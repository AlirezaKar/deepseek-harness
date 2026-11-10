/**
 * `@deepseek-ai/dsh-aras-ui` — Persian RTL Web UI ("دستیار هوشمند ارس") and
 * Host bridge plugin for DeepSeek Harness.
 *
 * Supports two runtime attachment modes:
 * 1. **Web Override mode (`attachWebServer: true`)**: mounts `/aras-api/*`
 *    and claims `ctx.webServer.registerFallback(...)` so `dsh web` serves the
 *    Aras Smart Assistant UI instead of the default DSH React frontend.
 * 2. **Standalone HTTP mode (`attachWebServer: false`)**: starts a dedicated
 *    `node:http` listener (including `0.0.0.0` container preview binds) over
 *    any headless/base Harness composition.
 *
 * @module @deepseek-ai/dsh-aras-ui
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { ArasHostBridge } from './bridge.ts'
import type { ArasApprovalMode, ArasStreamEvent } from './types.ts'
import { renderArasIndexHtml } from './ui-html.ts'

export { ArasHostBridge, buildArasTranscript } from './bridge.ts'
export type { ArasBridgeOptions } from './bridge.ts'
export { renderArasIndexHtml } from './ui-html.ts'
export type * from './types.ts'

/** Stable Cordis plugin name. */
export const name = 'aras-ui'

/** Services required before mounting `@deepseek-ai/dsh-aras-ui`. */
export const inject = ['sessions', 'agents']

/** Plugin configuration for `@deepseek-ai/dsh-aras-ui`. */
export interface Config {
  /** Attach onto `ctx.webServer` (`dsh web` override mode) instead of starting a standalone listener. */
  attachWebServer: boolean
  /** Standalone HTTP bind address used when `attachWebServer` is `false`. */
  host: string
  /** Standalone HTTP listen port used when `attachWebServer` is `false` (`0` selects an ephemeral port). */
  port: number
  /** Print the bound Aras UI URL to stdout on startup. */
  printUrl: boolean
  /** Initial tool permission policy (`ask`, `auto-allow`, or `never`). */
  defaultApprovalPolicy: ArasApprovalMode
  /** Initial working directory for new conversations (defaults to current working directory when empty). */
  defaultCwd: string
}

/** Runtime configuration schema. */
export const Config: z<Config> = z.object({
  attachWebServer: z.boolean().default(true),
  host: z.string().default('0.0.0.0'),
  port: z.natural().max(65535).default(3080),
  printUrl: z.boolean().default(true),
  defaultApprovalPolicy: z.union([
    z.const('ask'),
    z.const('auto-allow'),
    z.const('never'),
  ]).default('ask'),
  defaultCwd: z.string().default(''),
})

const MAX_JSON_BODY_BYTES = 25 * 1024 * 1024

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none"><rect x="3" y="3" width="30" height="30" rx="8" fill="#1E66F5"/><circle cx="18" cy="18" r="7" fill="#FFFFFF"/></svg>`

/** Read and parse a JSON request body with a bounded byte budget. */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    total += buf.byteLength
    if (total > MAX_JSON_BODY_BYTES) {
      throw Object.assign(new Error('حجم داده ارسالی بیش از حد مجاز است.'), { statusCode: 413 })
    }
    chunks.push(buf)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw Object.assign(new Error('ساختار JSON معتبر نیست.'), { statusCode: 400 })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw Object.assign(new Error('بدنه درخواست باید یک شیء JSON باشد.'), { statusCode: 400 })
  }
  return parsed as Record<string, unknown>
}

/** Send a UTF-8 JSON HTTP response. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(payload.byteLength),
  })
  res.end(payload)
}

/** Extract HTTP status code from a caught error, defaulting to 400. */
function errorStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const code = (error as { statusCode?: unknown }).statusCode
    if (typeof code === 'number' && code >= 400 && code < 600) return code
  }
  return 400
}

/** Build the `/aras-api/*` HTTP + SSE route handler bound to `bridge`. */
export function createArasApiHandler(
  bridge: ArasHostBridge,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const sseCloses = new Set<() => void>()

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://aras.local')
    const pathname = url.pathname

    try {
      // 1. Live Server-Sent Events stream
      if (method === 'GET' && pathname === '/aras-api/stream') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          'connection': 'keep-alive',
          'x-accel-buffering': 'no',
        })
        res.flushHeaders()

        const writeEvent = (event: ArasStreamEvent): void => {
          if (res.writableEnded || res.destroyed) return
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        }

        const unsubscribe = bridge.subscribe(writeEvent)
        const heartbeat = setInterval(() => {
          if (!res.writableEnded && !res.destroyed) {
            res.write(': ping\n\n')
          }
        }, 15_000)
        heartbeat.unref()

        const cleanup = (): void => {
          clearInterval(heartbeat)
          unsubscribe()
          sseCloses.delete(cleanup)
          if (!res.writableEnded) res.end()
        }
        sseCloses.add(cleanup)
        req.once('close', cleanup)
        res.once('close', cleanup)
        return
      }

      // 2. Sessions list & bulk delete
      if (pathname === '/aras-api/sessions') {
        if (method === 'GET') {
          const sessions = await bridge.listSessions()
          sendJson(res, 200, { sessions })
          return
        }
        if (method === 'DELETE') {
          const result = await bridge.deleteAllSessions()
          sendJson(res, 200, { ok: true, ...result })
          return
        }
      }

      // 3. Read image attachment (`/aras-api/sessions/:id/attachments/:attachmentId`)
      const attachMatch = /^\/aras-api\/sessions\/([^/]+)\/attachments\/([^/]+)$/.exec(pathname)
      if (method === 'GET' && attachMatch !== null) {
        const sessionId = decodeURIComponent(attachMatch[1]!)
        const attachmentId = decodeURIComponent(attachMatch[2]!)
        const image = await bridge.readImageAttachment(sessionId, attachmentId)
        if (image === undefined) {
          sendJson(res, 404, { error: 'تصویر مورد نظر یافت نشد.' })
          return
        }
        res.writeHead(200, {
          'content-type': image.mediaType,
          'cache-control': 'private, max-age=3600',
          'content-length': String(image.bytes.byteLength),
        })
        res.end(Buffer.from(image.bytes))
        return
      }

      // 4. Prompt submission (`/aras-api/sessions/:id/prompt` or `/aras-api/sessions/prompt`)
      const promptMatch = /^\/aras-api\/sessions\/([^/]+)\/prompt$/.exec(pathname)
      if (method === 'POST' && (promptMatch !== null || pathname === '/aras-api/sessions/prompt')) {
        const body = await readJsonBody(req)
        const targetId = promptMatch !== null
          ? decodeURIComponent(promptMatch[1]!)
          : typeof body.sessionId === 'string' && body.sessionId.trim().length > 0
            ? body.sessionId.trim()
            : 'new'
        const text = typeof body.text === 'string' ? body.text : ''
        const rawImages = Array.isArray(body.images) ? body.images : []
        const images: Array<{ data: string; mediaType: string; name?: string }> = []
        for (const item of rawImages) {
          if (typeof item !== 'object' || item === null) continue
          const rec = item as Record<string, unknown>
          if (typeof rec.mediaType === 'string' && typeof rec.data === 'string' && rec.data.length > 0) {
            images.push({
              mediaType: rec.mediaType,
              data: rec.data,
              ...(typeof rec.name === 'string' && rec.name.length > 0 ? { name: rec.name } : {}),
            })
          }
        }
        const steer = body.steer === true
        const result = await bridge.sendPrompt(targetId, { text, images, steer })
        sendJson(res, 200, result)
        return
      }

      // 5. Cancel active session turn (`/aras-api/sessions/:id/cancel`)
      const cancelMatch = /^\/aras-api\/sessions\/([^/]+)\/cancel$/.exec(pathname)
      if (method === 'POST' && cancelMatch !== null) {
        const sessionId = decodeURIComponent(cancelMatch[1]!)
        const result = bridge.cancelSession(sessionId)
        sendJson(res, 200, { ok: true, ...result })
        return
      }

      // 6. Session detail or delete (`/aras-api/sessions/:id`)
      const detailMatch = /^\/aras-api\/sessions\/([^/]+)$/.exec(pathname)
      if (detailMatch !== null) {
        const sessionId = decodeURIComponent(detailMatch[1]!)
        if (method === 'GET') {
          const detail = await bridge.getSessionDetail(sessionId)
          sendJson(res, 200, detail)
          return
        }
        if (method === 'DELETE') {
          const result = await bridge.deleteSession(sessionId)
          sendJson(res, 200, { ok: true, ...result })
          return
        }
      }

      // 7. Interactive tool approval decision (`/aras-api/approvals/:id`)
      const approvalMatch = /^\/aras-api\/approvals\/([^/]+)$/.exec(pathname)
      if (method === 'POST' && approvalMatch !== null) {
        const approvalId = decodeURIComponent(approvalMatch[1]!)
        const body = await readJsonBody(req)
        const rawOutcome = body.outcome ?? body.decision
        const outcome = rawOutcome === 'allowed-once' || rawOutcome === 'rejected' || rawOutcome === 'cancelled'
          ? rawOutcome
          : 'rejected'
        const ok = bridge.resolveApproval(approvalId, outcome)
        sendJson(res, 200, { ok })
        return
      }

      // 8. Interactive `ask_user_question` response (`/aras-api/questions/:id`)
      const questionMatch = /^\/aras-api\/questions\/([^/]+)$/.exec(pathname)
      if (method === 'POST' && questionMatch !== null) {
        const questionId = decodeURIComponent(questionMatch[1]!)
        const body = await readJsonBody(req)
        if (body.cancelled === true || body.cancel === true) {
          const ok = bridge.resolveQuestion(questionId, { cancelled: true })
          sendJson(res, 200, { ok })
          return
        }

        const answers: Array<{ id: string; selected: string[]; custom?: string }> = []
        if (Array.isArray(body.answers)) {
          for (const entry of body.answers) {
            if (typeof entry !== 'object' || entry === null) continue
            const rec = entry as Record<string, unknown>
            if (typeof rec.id !== 'string') continue
            const selected = Array.isArray(rec.selected)
              ? rec.selected.filter((v): v is string => typeof v === 'string')
              : []
            answers.push({
              id: rec.id,
              selected,
              ...(typeof rec.custom === 'string' && rec.custom.trim().length > 0 ? { custom: rec.custom } : {}),
            })
          }
        }
        const ok = bridge.resolveQuestion(questionId, { answers })
        sendJson(res, 200, { ok })
        return
      }

      // 9. Settings snapshot (`GET /aras-api/settings`)
      if (method === 'GET' && pathname === '/aras-api/settings') {
        const snapshot = await bridge.getSettingsSnapshot()
        sendJson(res, 200, snapshot)
        return
      }

      // 10. Model selection (`POST /aras-api/settings/model`)
      if (method === 'POST' && pathname === '/aras-api/settings/model') {
        const body = await readJsonBody(req)
        const provider = typeof body.provider === 'string'
          ? body.provider.trim()
          : typeof body.providerId === 'string'
            ? body.providerId.trim()
            : ''
        const model = typeof body.model === 'string'
          ? body.model.trim()
          : typeof body.modelId === 'string'
            ? body.modelId.trim()
            : ''
        const reasoningEffort = typeof body.reasoningEffort === 'string' ? body.reasoningEffort : undefined
        const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim().length > 0
          ? body.sessionId.trim()
          : undefined
        await bridge.updateModelSelection({
          provider,
          model,
          ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
          ...(sessionId !== undefined ? { sessionId } : {}),
        })
        const snapshot = await bridge.getSettingsSnapshot()
        sendJson(res, 200, snapshot)
        return
      }

      // 11. Save or clear API key credential (`POST /aras-api/settings/credentials`)
      if (method === 'POST' && pathname === '/aras-api/settings/credentials') {
        const body = await readJsonBody(req)
        const ref = typeof body.ref === 'string'
          ? body.ref.trim()
          : typeof body.credentialId === 'string'
            ? body.credentialId.trim()
            : ''
        const unset = body.unset === true || body.clear === true
        const value = typeof body.value === 'string' ? body.value : undefined
        await bridge.updateCredential(ref, value, unset)
        const snapshot = await bridge.getSettingsSnapshot()
        sendJson(res, 200, snapshot)
        return
      }

      // 12. DeepSeek provider config (`POST /aras-api/settings/providers/deepseek`)
      if (method === 'POST' && pathname === '/aras-api/settings/providers/deepseek') {
        const body = await readJsonBody(req)
        const baseURL = typeof body.baseURL === 'string'
          ? body.baseURL
          : typeof body.baseUrl === 'string'
            ? body.baseUrl
            : undefined
        const apiKeyEnv = typeof body.apiKeyEnv === 'string' ? body.apiKeyEnv : undefined
        const reasoningEffort = typeof body.reasoningEffort === 'string' ? body.reasoningEffort : undefined
        await bridge.updateDeepSeekConfig({
          ...(baseURL !== undefined ? { baseURL } : {}),
          ...(apiKeyEnv !== undefined ? { apiKeyEnv } : {}),
          ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
        })
        const snapshot = await bridge.getSettingsSnapshot()
        sendJson(res, 200, snapshot)
        return
      }

      // 13. Custom OpenAI-compatible provider upsert/remove (`POST /aras-api/settings/providers/custom`)
      if (method === 'POST' && pathname === '/aras-api/settings/providers/custom') {
        const body = await readJsonBody(req)
        const id = typeof body.id === 'string' ? body.id : ''
        if (body.remove === true) {
          await bridge.upsertCustomProvider({ id, remove: true })
          const snapshot = await bridge.getSettingsSnapshot()
          sendJson(res, 200, snapshot)
          return
        }
        const displayName = typeof body.displayName === 'string'
          ? body.displayName
          : typeof body.name === 'string'
            ? body.name
            : undefined
        const api = typeof body.api === 'string' ? body.api : undefined
        const baseURL = typeof body.baseURL === 'string'
          ? body.baseURL
          : typeof body.baseUrl === 'string'
            ? body.baseUrl
            : undefined
        const apiKeyEnv = typeof body.apiKeyEnv === 'string' ? body.apiKeyEnv : undefined
        const rawModels = Array.isArray(body.models) ? body.models : []
        const models: Array<{ id: string; name?: string }> = []
        for (const m of rawModels) {
          if (typeof m === 'string' && m.trim().length > 0) {
            models.push({ id: m.trim() })
          } else if (typeof m === 'object' && m !== null) {
            const rec = m as Record<string, unknown>
            if (typeof rec.id === 'string' && rec.id.trim().length > 0) {
              models.push({
                id: rec.id.trim(),
                ...(typeof rec.name === 'string' && rec.name.trim().length > 0 ? { name: rec.name.trim() } : {}),
              })
            }
          }
        }
        await bridge.upsertCustomProvider({
          id,
          ...(displayName !== undefined ? { displayName } : {}),
          ...(api !== undefined ? { api } : {}),
          ...(baseURL !== undefined ? { baseURL } : {}),
          ...(apiKeyEnv !== undefined ? { apiKeyEnv } : {}),
          models,
        })
        const snapshot = await bridge.getSettingsSnapshot()
        sendJson(res, 200, snapshot)
        return
      }

      // 14. Remove custom provider (`DELETE /aras-api/settings/providers/custom/:id`)
      const deleteProviderMatch = /^\/aras-api\/settings\/providers\/custom\/([^/]+)$/.exec(pathname)
      if (method === 'DELETE' && deleteProviderMatch !== null) {
        const id = decodeURIComponent(deleteProviderMatch[1]!)
        await bridge.upsertCustomProvider({ id, remove: true })
        const snapshot = await bridge.getSettingsSnapshot()
        sendJson(res, 200, snapshot)
        return
      }

      // 15. Save runtime agent preferences (`POST /aras-api/settings/preferences`)
      if (method === 'POST' && pathname === '/aras-api/settings/preferences') {
        const body = await readJsonBody(req)
        const approvalMode = body.approvalMode === 'ask' || body.approvalMode === 'auto-allow' || body.approvalMode === 'never'
          ? body.approvalMode
          : undefined
        const defaultCwd = typeof body.defaultCwd === 'string' ? body.defaultCwd : undefined
        await bridge.updatePreferences({
          ...(approvalMode !== undefined ? { approvalMode } : {}),
          ...(defaultCwd !== undefined ? { defaultCwd } : {}),
        })
        const snapshot = await bridge.getSettingsSnapshot()
        sendJson(res, 200, snapshot)
        return
      }

      // 16. Save outbound network / HTTP proxy mode (`POST /aras-api/settings/network`)
      if (method === 'POST' && pathname === '/aras-api/settings/network') {
        const body = await readJsonBody(req)
        const mode = body.mode === 'auto' || body.mode === 'direct' || body.mode === 'custom'
          ? body.mode
          : 'auto'
        const customProxyUrl = typeof body.customProxyUrl === 'string' ? body.customProxyUrl : undefined
        const noProxy = typeof body.noProxy === 'string' ? body.noProxy : undefined
        await bridge.updateNetworkConfig({
          mode,
          ...(customProxyUrl !== undefined ? { customProxyUrl } : {}),
          ...(noProxy !== undefined ? { noProxy } : {}),
        })
        const snapshot = await bridge.getSettingsSnapshot()
        sendJson(res, 200, snapshot)
        return
      }

      // 17. Live outbound HTTPS connectivity diagnostic (`POST /aras-api/settings/network/test`)
      if (method === 'POST' && pathname === '/aras-api/settings/network/test') {
        const body = await readJsonBody(req)
        const targetUrl = typeof body.targetUrl === 'string' ? body.targetUrl : undefined
        const result = await bridge.testNetworkConnectivity(targetUrl)
        sendJson(res, 200, result)
        return
      }

      sendJson(res, 404, { error: `مسیر API یافت نشد: ${pathname}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendJson(res, errorStatus(error), { error: message })
    }
  }

  Object.defineProperty(handler, 'closeAllStreams', {
    value: () => {
      for (const close of [...sseCloses]) close()
    },
  })
  return handler
}

/** Build the SPA fallback handler serving the RTL Aras UI shell. */
export function createArasFallbackHandler(): (req: IncomingMessage, res: ServerResponse) => void {
  const htmlBytes = Buffer.from(renderArasIndexHtml(), 'utf8')
  const faviconBytes = Buffer.from(FAVICON_SVG, 'utf8')

  return (req: IncomingMessage, res: ServerResponse): void => {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://aras.local')

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      res.end()
      return
    }

    if (url.pathname === '/favicon.ico' || url.pathname === '/favicon.svg') {
      res.writeHead(200, {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'content-length': String(faviconBytes.byteLength),
      })
      res.end(method === 'HEAD' ? undefined : faviconBytes)
      return
    }

    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': String(htmlBytes.byteLength),
    })
    res.end(method === 'HEAD' ? undefined : htmlBytes)
  }
}

/** Start a standalone `node:http` server when `attachWebServer` is `false`. */
async function listenStandaloneServer(
  host: string,
  port: number,
  apiHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  fallbackHandler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://aras.local').pathname
    if (pathname === '/aras-api' || pathname.startsWith('/aras-api/')) {
      void apiHandler(req, res)
      return
    }
    fallbackHandler(req, res)
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening)
      reject(err)
    }
    const onListening = (): void => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })

  const addr = server.address() as AddressInfo
  const rawOriginHost = host.includes(':') ? `[${host}]` : host
  const companion = (host === '127.0.0.1' || host === '::1' || host === '0.0.0.0')
    ? startCompanionLoopbackServer(
      `http://${host === '0.0.0.0' ? '127.0.0.1' : rawOriginHost}:${String(addr.port)}`,
      apiHandler,
      fallbackHandler,
    )
    : null
  if (companion !== null) {
    server.once('close', () => {
      companion.close()
    })
  }
  const displayHost = host === '0.0.0.0' || host === '::' || host === '127.0.0.1' || host === '::1'
    ? 'localhost'
    : rawOriginHost
  return {
    server,
    url: `http://${displayHost}:${String(addr.port)}/`,
  }
}

/**
 * Best-effort companion loopback listener so `http://localhost:<port>/` resolves
 * immediately over both IPv6 `[::1]` and IPv4 `127.0.0.1` without proxy interception
 * or Happy Eyeballs fallback delay when `dsh-host-webserver` binds a single IP family.
 */
function startCompanionLoopbackServer(
  origin: string,
  apiHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  fallbackHandler: (req: IncomingMessage, res: ServerResponse) => void,
): Server | null {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return null
  }
  const port = Number(parsed.port)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null

  const companionHost = parsed.hostname === '127.0.0.1'
    ? '::1'
    : parsed.hostname === '[::1]' || parsed.hostname === '::1'
      ? '127.0.0.1'
      : null
  if (companionHost === null) return null

  const companion = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://aras.local').pathname
    if (pathname === '/aras-api' || pathname.startsWith('/aras-api/')) {
      void apiHandler(req, res)
      return
    }
    fallbackHandler(req, res)
  })
  // A listener error is never fatal: the primary server still serves the UI.
  // The handler stays attached (not `once`) because a later error on a listening
  // socket would otherwise surface as an uncaught exception.
  companion.on('error', () => {
    // Ignore EADDRINUSE / EAFNOSUPPORT on single-stack machines.
  })
  try {
    companion.listen({ host: companionHost, port, ipv6Only: companionHost === '::1' })
    companion.unref()
    return companion
  } catch {
    companion.close()
    return null
  }
}

/** Mount `@deepseek-ai/dsh-aras-ui` onto the Cordis context. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const bridge = new ArasHostBridge(ctx, {
    defaultApprovalPolicy: config.defaultApprovalPolicy,
    defaultCwd: config.defaultCwd.trim().length > 0 ? config.defaultCwd.trim() : process.cwd(),
  })
  const apiHandler = createArasApiHandler(bridge) as ((req: IncomingMessage, res: ServerResponse) => Promise<void>) & {
    closeAllStreams?: () => void
  }
  const fallbackHandler = createArasFallbackHandler()

  if (config.attachWebServer) {
    ctx.inject(['webServer'], (webCtx: Context) => {
      const webServer = webCtx.webServer
      const disposeApi = webServer.register({
        kind: 'prefix',
        path: '/aras-api',
        handler: apiHandler,
      })
      const disposeFallback = webServer.registerFallback(fallbackHandler)

      let companionServer: Server | null = null
      try {
        const origin = webServer.getOrigin()
        companionServer = startCompanionLoopbackServer(origin, apiHandler, fallbackHandler)
        if (config.printUrl) {
          let friendlyUrl = `${origin}/`
          try {
            const u = new URL(origin)
            if (u.hostname === '127.0.0.1' || u.hostname === '[::1]' || u.hostname === '::1') {
              friendlyUrl = `http://localhost:${u.port}/  (also ${origin}/)`
            }
          } catch {
            // Keep raw origin.
          }
          process.stdout.write(`Aras Smart Assistant UI (دستیار هوشمند ارس): ${friendlyUrl}\n`)
        }
      } catch {
        // Listener may not be bound in synthetic tests.
      }

      webCtx.effect(() => () => {
        apiHandler.closeAllStreams?.()
        companionServer?.close()
        disposeFallback()
        disposeApi()
      })
    })

    ctx.effect(() => async () => {
      apiHandler.closeAllStreams?.()
      await bridge.dispose()
    })
    return
  }

  // Standalone HTTP listener (used with headless/base profiles or 0.0.0.0 preview binds)
  const envPort = process.env.ARAS_UI_PORT ? Number(process.env.ARAS_UI_PORT) : undefined
  const envHost = process.env.ARAS_UI_HOST?.trim()
  const host = envHost || config.host
  const port = envPort !== undefined && Number.isInteger(envPort) && envPort >= 0 && envPort <= 65535
    ? envPort
    : config.port

  const { server, url } = await listenStandaloneServer(host, port, apiHandler, fallbackHandler)
  if (config.printUrl) {
    process.stdout.write(`Aras Smart Assistant UI (دستیار هوشمند ارس): ${url} (bound ${host})\n`)
  }

  ctx.effect(() => async () => {
    apiHandler.closeAllStreams?.()
    await bridge.dispose()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })
}
