/**
 * Outbound network & HTTP/HTTPS proxy manager for `@deepseek-ai/dsh-aras-ui`.
 *
 * Solves the two root causes of outbound `403` failures on Windows & corporate networks:
 * 1. **Active Windows System Proxy / VPN (v2rayN, Clash, Nekoray, etc.)**:
 *    Windows VPN clients configure `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`
 *    rather than `HTTPS_PROXY` env vars, causing Node.js SDKs to bypass the tunnel and hit
 *    upstream `403 Forbidden` regional blocks.
 * 2. **Restrictive corporate / campus HTTP proxies (`Kerio`, `FortiGate`, `Squid`)**:
 *    Inherited `HTTP_PROXY` / `HTTPS_PROXY` env vars intercept outbound LLM calls or loopback
 *    requests and return `403 Access denied by security policy.`.
 *
 * Updates both `process.env` (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`) and
 * `undici`'s global dispatcher live at runtime without restarting the server.
 *
 * @module @deepseek-ai/dsh-aras-ui/network
 */

import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ArasNetworkMode, ArasNetworkStatus, ArasNetworkTestResult } from './types.ts'

/** Loopback hosts that must never traverse an HTTP proxy. */
export const ARAS_LOOPBACK_NO_PROXY = 'localhost,127.0.0.1,::1,[::1]'

const UNDICI_GLOBAL_DISPATCHER_SYMBOL = Symbol.for('undici.globalDispatcher.1')

const STARTUP_ENV_PROXY = {
  httpProxy: readFirstEnv(['HTTP_PROXY', 'http_proxy']),
  httpsProxy: readFirstEnv(['HTTPS_PROXY', 'https_proxy']),
  allProxy: readFirstEnv(['ALL_PROXY', 'all_proxy']),
  noProxy: readFirstEnv(['NO_PROXY', 'no_proxy']),
}

interface PersistedNetworkConfig {
  mode: ArasNetworkMode
  customProxyUrl: string
  noProxy: string
}

interface UndiciLike {
  Agent: new () => unknown
  EnvHttpProxyAgent: new (opts: {
    httpProxy?: string
    httpsProxy?: string
    noProxy?: string
  }) => unknown
  setGlobalDispatcher: (dispatcher: unknown) => void
}

let cachedUndici: UndiciLike | null | undefined
let baselineDirectDispatcher: unknown

function readFirstEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const val = process.env[name]?.trim()
    if (val !== undefined && val.length > 0) return val
  }
  return undefined
}

/** Resolve active `$DSH_HOME` directory using Harness rules. */
export function resolveArasDshHome(): string {
  const fromEnv = process.env.DSH_HOME?.trim()
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return resolve(fromEnv)
  }
  return join(homedir(), '.dsh')
}

function loadUndici(): UndiciLike | null {
  if (cachedUndici !== undefined) return cachedUndici
  const anchorCandidates = [
    fileURLToPath(new URL('../../../util/http-proxy/package.json', import.meta.url)),
    import.meta.url,
  ]
  for (const anchor of anchorCandidates) {
    try {
      const req = createRequire(anchor)
      const mod = req('undici') as Partial<UndiciLike>
      if (
        typeof mod.Agent === 'function'
        && typeof mod.EnvHttpProxyAgent === 'function'
        && typeof mod.setGlobalDispatcher === 'function'
      ) {
        cachedUndici = mod as UndiciLike
        return cachedUndici
      }
    } catch {
      // Try next candidate or graceful fallback in bare strip-types test runs.
    }
  }
  cachedUndici = null
  return null
}

/** Normalize user-supplied proxy URL (e.g. `127.0.0.1:10809` -> `http://127.0.0.1:10809`). */
export function normalizeHttpProxyUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('نشانی پراکسی نمی‌تواند خالی باشد (مثال: http://127.0.0.1:10809).')
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed) ? trimmed : `http://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    throw new Error(`ساختار نشانی پراکسی معتبر نیست: ${trimmed}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `پروتکل ${parsed.protocol.replace(':', '')} برای پراکسی HTTP پشتیبانی نمی‌شود؛ لطفاً پورت HTTP پراکسی/VPN خود (مثلاً http://127.0.0.1:10809 یا http://127.0.0.1:7890) را وارد کنید.`,
    )
  }
  if (!parsed.hostname) {
    throw new Error('نام میزبان پراکسی نامعتبر است.')
  }
  return parsed.toString().replace(/\/$/u, '')
}

function mergeNoProxy(...lists: readonly (string | undefined)[]): string {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const list of [ARAS_LOOPBACK_NO_PROXY, ...lists]) {
    if (!list) continue
    for (const token of list.split(',')) {
      const item = token.trim()
      if (!item) continue
      const lower = item.toLowerCase()
      if (seen.has(lower)) continue
      seen.add(lower)
      ordered.push(item)
    }
  }
  return ordered.join(',')
}

/** Parse Windows `Internet Settings` `ProxyServer` registry value into an HTTP(S) proxy URL. */
export function parseWindowsProxyServerValue(raw: string): {
  proxyUrl?: string
  socksOnly?: string
} {
  const trimmed = raw.trim()
  if (!trimmed) return {}

  // Multi-protocol string: `http=127.0.0.1:10809;https=127.0.0.1:10809;socks=127.0.0.1:10808`
  if (trimmed.includes('=')) {
    const map = new Map<string, string>()
    for (const part of trimmed.split(';')) {
      const idx = part.indexOf('=')
      if (idx <= 0) continue
      const scheme = part.slice(0, idx).trim().toLowerCase()
      const target = part.slice(idx + 1).trim()
      if (target) map.set(scheme, target)
    }
    const candidate = map.get('https') ?? map.get('http')
    if (candidate !== undefined) {
      try {
        return { proxyUrl: normalizeHttpProxyUrl(candidate) }
      } catch {
        return {}
      }
    }
    const socks = map.get('socks')
    if (socks !== undefined) {
      return { socksOnly: socks }
    }
    return {}
  }

  if (/^socks/iu.test(trimmed)) {
    return { socksOnly: trimmed }
  }

  try {
    return { proxyUrl: normalizeHttpProxyUrl(trimmed) }
  } catch {
    return {}
  }
}

async function isLoopbackProxyReachable(proxyUrl: string, timeoutMs = 350): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(proxyUrl)
  } catch {
    return false
  }
  const host = parsed.hostname.replace(/^\[|\]$/gu, '').toLowerCase()
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1'
  if (!isLoopback) return true
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return false

  return new Promise<boolean>((resolveReachable) => {
    const socket = createConnection({ host: host === 'localhost' ? '127.0.0.1' : host, port })
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolveReachable(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function detectWindowsSystemProxy(): Promise<{
  enabled: boolean
  rawServer?: string
  proxyUrl?: string
  warning?: string
}> {
  if (process.platform !== 'win32') {
    return { enabled: false }
  }

  const stdout = await new Promise<string>((resolveOut) => {
    execFile(
      'reg.exe',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
      { timeout: 1500, windowsHide: true },
      (err, out) => {
        if (err) {
          resolveOut('')
          return
        }
        resolveOut(String(out ?? ''))
      },
    )
  })

  if (!stdout) return { enabled: false }
  const enableMatch = /^\s*ProxyEnable\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/mu.exec(stdout)
  if (!enableMatch) return { enabled: false }
  const enabledNum = enableMatch[1]!.startsWith('0x')
    ? Number.parseInt(enableMatch[1]!, 16)
    : Number.parseInt(enableMatch[1]!, 10)
  if (enabledNum !== 1) return { enabled: false }

  const serverMatch = /^\s*ProxyServer\s+REG_SZ\s+(.+)$/mu.exec(stdout)
  const rawServer = serverMatch?.[1]?.trim()
  if (!rawServer) return { enabled: true }

  const parsed = parseWindowsProxyServerValue(rawServer)
  if (parsed.socksOnly !== undefined) {
    return {
      enabled: true,
      rawServer,
      warning: `پراکسی ویندوز فقط روی SOCKS (${parsed.socksOnly}) تنظیم شده است؛ در صورت نیاز پورت HTTP VPN خود را در حالت «پراکسی دستی» وارد کنید.`,
    }
  }
  if (parsed.proxyUrl === undefined) {
    return { enabled: true, rawServer }
  }

  const reachable = await isLoopbackProxyReachable(parsed.proxyUrl)
  if (!reachable) {
    return {
      enabled: true,
      rawServer,
      warning: `پراکسی سیستم ویندوز (${parsed.proxyUrl}) فعال است اما پورت آن پاسخ نمی‌دهد؛ اتصال مستقیم جایگزین شد.`,
    }
  }

  return {
    enabled: true,
    rawServer,
    proxyUrl: parsed.proxyUrl,
  }
}

function setProxyProcessEnv(proxyUrl: string | null, noProxy: string): void {
  process.env.NO_PROXY = noProxy
  process.env.no_proxy = noProxy

  if (proxyUrl === null) {
    for (const key of ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
      delete process.env[key]
    }
    return
  }

  process.env.HTTP_PROXY = proxyUrl
  process.env.http_proxy = proxyUrl
  process.env.HTTPS_PROXY = proxyUrl
  process.env.https_proxy = proxyUrl
  delete process.env.ALL_PROXY
  delete process.env.all_proxy
}

function applyUndiciDispatcher(proxyUrl: string | null, noProxy: string): void {
  const globalObj = globalThis as Record<symbol, unknown>
  if (baselineDirectDispatcher === undefined && globalObj[UNDICI_GLOBAL_DISPATCHER_SYMBOL] !== undefined) {
    baselineDirectDispatcher = globalObj[UNDICI_GLOBAL_DISPATCHER_SYMBOL]
  }

  const undici = loadUndici()
  if (undici !== null) {
    const nextDispatcher = proxyUrl === null
      ? new undici.Agent()
      : new undici.EnvHttpProxyAgent({
        httpProxy: proxyUrl,
        httpsProxy: proxyUrl,
        noProxy,
      })
    undici.setGlobalDispatcher(nextDispatcher)
    globalObj[UNDICI_GLOBAL_DISPATCHER_SYMBOL] = nextDispatcher
    return
  }

  if (proxyUrl === null && baselineDirectDispatcher !== undefined) {
    globalObj[UNDICI_GLOBAL_DISPATCHER_SYMBOL] = baselineDirectDispatcher
  }
}

/**
 * Runtime outbound network controller persisted at `$DSH_HOME/aras-network.json`.
 */
export class ArasNetworkController {
  private readonly configPath: string
  private config: PersistedNetworkConfig = {
    mode: 'auto',
    customProxyUrl: '',
    noProxy: ARAS_LOOPBACK_NO_PROXY,
  }

  private lastStatus: ArasNetworkStatus = {
    mode: 'auto',
    customProxyUrl: '',
    noProxy: ARAS_LOOPBACK_NO_PROXY,
    effectiveProxyUrl: null,
    effectiveSource: 'none',
  }

  private initialized = false

  constructor(homeDir: string = resolveArasDshHome()) {
    this.configPath = join(homeDir, 'aras-network.json')
    // Ensure loopback NO_PROXY is set immediately at construction time.
    const mergedNoProxy = mergeNoProxy(process.env.NO_PROXY, process.env.no_proxy)
    process.env.NO_PROXY = mergedNoProxy
    process.env.no_proxy = mergedNoProxy
  }

  /** Load persisted network config (if any) and apply dispatcher + env policy. */
  async ensureInitialized(): Promise<ArasNetworkStatus> {
    if (this.initialized) return this.lastStatus
    this.initialized = true
    try {
      const raw = await readFile(this.configPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedNetworkConfig>
      if (parsed.mode === 'auto' || parsed.mode === 'direct' || parsed.mode === 'custom') {
        this.config.mode = parsed.mode
      }
      if (typeof parsed.customProxyUrl === 'string') {
        this.config.customProxyUrl = parsed.customProxyUrl.trim()
      }
      if (typeof parsed.noProxy === 'string' && parsed.noProxy.trim().length > 0) {
        this.config.noProxy = mergeNoProxy(parsed.noProxy)
      }
    } catch {
      // First run — default `auto` mode applies.
    }
    return this.reconcile()
  }

  /** Re-evaluate current mode against environment and Windows System Proxy. */
  async getStatus(): Promise<ArasNetworkStatus> {
    await this.ensureInitialized()
    return this.reconcile()
  }

  /** Save and immediately apply a new network mode / proxy configuration. */
  async updateConfig(input: {
    readonly mode: ArasNetworkMode
    readonly customProxyUrl?: string
    readonly noProxy?: string
  }): Promise<ArasNetworkStatus> {
    await this.ensureInitialized()
    if (input.mode !== 'auto' && input.mode !== 'direct' && input.mode !== 'custom') {
      throw new Error('حالت شبکه نامعتبر است (auto، direct یا custom مجاز است).')
    }

    let normalizedCustom = this.config.customProxyUrl
    if (input.customProxyUrl !== undefined) {
      normalizedCustom = input.customProxyUrl.trim().length > 0
        ? normalizeHttpProxyUrl(input.customProxyUrl)
        : ''
    }
    if (input.mode === 'custom' && normalizedCustom.length === 0) {
      throw new Error('در حالت «پراکسی دستی»، وارد کردن نشانی پراکسی (مثلاً http://127.0.0.1:10809) الزامی است.')
    }

    const nextNoProxy = mergeNoProxy(STARTUP_ENV_PROXY.noProxy, input.noProxy ?? this.config.noProxy)
    this.config = {
      mode: input.mode,
      customProxyUrl: normalizedCustom,
      noProxy: nextNoProxy,
    }

    await mkdir(dirname(this.configPath), { recursive: true })
    await writeFile(this.configPath, `${JSON.stringify(this.config, null, 2)}\n`, 'utf8')
    return this.reconcile()
  }

  /** Run a live outbound HTTPS probe to diagnose 403 / proxy / TLS issues. */
  async testConnectivity(rawUrl?: string): Promise<ArasNetworkTestResult> {
    const status = await this.getStatus()
    const targetUrl = rawUrl !== undefined && rawUrl.trim().length > 0
      ? rawUrl.trim()
      : 'https://api.deepseek.com/models'

    let parsed: URL
    try {
      parsed = new URL(targetUrl)
    } catch {
      throw new Error('نشانی مقصد برای تست اتصال معتبر نیست.')
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('نشانی تست باید با https:// یا http:// آغاز شود.')
    }

    const startedAt = Date.now()
    try {
      const response = await fetch(parsed.toString(), {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ArasAssistant/1.0',
        },
        signal: AbortSignal.timeout(8_000),
      })
      const latencyMs = Date.now() - startedAt
      let bodySnippet = ''
      try {
        const text = await response.text()
        bodySnippet = text.slice(0, 240).replace(/\s+/gu, ' ').trim()
      } catch {
        // Ignore body read failures after headers.
      }

      if (response.status === 403) {
        const isSecurityPolicy = /security policy|access denied|squid|fortigate|kerio/iu.test(bodySnippet)
        const summary = isSecurityPolicy
          ? `خطای ۴۰۳ از سمت فایروال/پراکسی شبکه («Access denied by security policy»): پراکسی فعلی اجازه دسترسی به ${parsed.hostname} را نمی‌دهد. حالت شبکه را روی «اتصال مستقیم (بدون پراکسی)» یا پورت VPN محلی قرار دهید.`
          : `خطای ۴۰۳ (محدودیت جغرافیایی/IP از سمت ${parsed.hostname}): ارتباط برقرار شد اما IP فعلی مسدود است. VPN خود را روشن کرده و حالت شبکه را روی «خودکار» یا «پراکسی دستی» تنظیم کنید.`
        return {
          reachable: false,
          targetUrl: parsed.toString(),
          status: 403,
          latencyMs,
          effectiveProxyUrl: status.effectiveProxyUrl,
          summary,
        }
      }

      // 200, 401 (missing API key header on /models), 404, or 405 all confirm
      // end-to-end TLS reachability to the real provider without any 403 block!
      const reachable = response.status < 500
      const summary = reachable
        ? `اتصال به ${parsed.hostname} برقرار و بدون مسدودیت ۴۰۳ است (کد HTTP ${String(response.status)} در ${String(latencyMs)} میلی‌ثانیه${status.effectiveProxyUrl ? ` از طریق ${status.effectiveProxyUrl}` : ' — اتصال مستقیم'}).`
        : `سرور مقصد پاسخ خطای ${String(response.status)} بازگرداند (${String(latencyMs)} میلی‌ثانیه).`
      return {
        reachable,
        targetUrl: parsed.toString(),
        status: response.status,
        latencyMs,
        effectiveProxyUrl: status.effectiveProxyUrl,
        summary,
      }
    } catch (error) {
      const latencyMs = Date.now() - startedAt
      const detail = error instanceof Error ? error.message : String(error)
      return {
        reachable: false,
        targetUrl: parsed.toString(),
        status: null,
        latencyMs,
        effectiveProxyUrl: status.effectiveProxyUrl,
        summary: `عدم برقراری ارتباط با ${parsed.hostname}: ${detail}${status.effectiveProxyUrl ? ` (پراکسی فعال: ${status.effectiveProxyUrl})` : ''}`,
      }
    }
  }

  private async reconcile(): Promise<ArasNetworkStatus> {
    const noProxy = mergeNoProxy(STARTUP_ENV_PROXY.noProxy, this.config.noProxy)
    const winProxy = await detectWindowsSystemProxy()

    let effectiveProxyUrl: string | null = null
    let effectiveSource: ArasNetworkStatus['effectiveSource'] = 'none'
    let warning = winProxy.warning

    if (this.config.mode === 'direct') {
      effectiveProxyUrl = null
      effectiveSource = 'none'
      warning = undefined
    } else if (this.config.mode === 'custom') {
      effectiveProxyUrl = normalizeHttpProxyUrl(this.config.customProxyUrl)
      effectiveSource = 'custom'
      const reachable = await isLoopbackProxyReachable(effectiveProxyUrl)
      if (!reachable) {
        warning = `هشدار: پورت پراکسی دستی (${effectiveProxyUrl}) در حال حاضر پاسخ نمی‌دهد؛ از روشن بودن VPN اطمینان حاصل کنید.`
      } else {
        warning = undefined
      }
    } else {
      // `auto` mode: check valid HTTP(S) startup env proxy first, then Windows System Proxy.
      const rawEnv = STARTUP_ENV_PROXY.httpsProxy ?? STARTUP_ENV_PROXY.httpProxy ?? STARTUP_ENV_PROXY.allProxy
      if (rawEnv !== undefined) {
        try {
          const candidate = normalizeHttpProxyUrl(rawEnv)
          if (await isLoopbackProxyReachable(candidate)) {
            effectiveProxyUrl = candidate
            effectiveSource = 'env'
          } else {
            warning = `پراکسی متغیر محیطی (${candidate}) در دسترس نیست؛ اتصال مستقیم جایگزین شد.`
          }
        } catch {
          // Non-HTTP scheme in ALL_PROXY (e.g. socks5://) — check Windows HTTP proxy next.
        }
      }
      if (effectiveProxyUrl === null && winProxy.proxyUrl !== undefined) {
        effectiveProxyUrl = winProxy.proxyUrl
        effectiveSource = 'windows-registry'
      }
    }

    setProxyProcessEnv(effectiveProxyUrl, noProxy)
    applyUndiciDispatcher(effectiveProxyUrl, noProxy)

    this.lastStatus = {
      mode: this.config.mode,
      customProxyUrl: this.config.customProxyUrl,
      noProxy,
      effectiveProxyUrl,
      effectiveSource,
      ...(winProxy.rawServer !== undefined ? { windowsSystemProxy: winProxy.rawServer } : {}),
      ...(warning !== undefined ? { warning } : {}),
    }
    return this.lastStatus
  }
}
