import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import SessionStore, { type SessionEvent, type SessionId } from '@deepseek-ai/dsh-session'
import type { SettingsPathOp } from '@deepseek-ai/dsh-settings'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ArasHostBridge,
  buildArasTranscript,
  createArasApiHandler,
  createArasFallbackHandler,
  renderArasIndexHtml,
} from '../src/index.ts'
import { normalizeHttpProxyUrl, parseWindowsProxyServerValue } from '../src/network.ts'
import { ARAS_UI_SCRIPT } from '../src/ui-script.ts'

describe('@deepseek-ai/dsh-aras-ui', () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop()
      if (fn) await fn()
    }
  })

  it('renders the RTL Persian Aras Smart Assistant HTML shell and valid client script', () => {
    const html = renderArasIndexHtml()
    expect(html).toContain('<html lang="fa" dir="rtl"')
    expect(html).toContain('دستیار هوشمند ارس')
    expect(html).toContain('خوش آمدید!')
    expect(html).toContain('حالت خودکار فعال است؛ مسیر مناسب برای هر پیام به‌صورت هوشمند انتخاب می‌شود.')
    expect(html).toContain('منتظر سوال شما هستم')
    expect(html).toContain('خروجی PDF')
    expect(html).toContain('تنظیمات سامانه')
    expect(html).toContain('پیشخوان')
    expect(html).toContain('گفتگوی جدید')
    expect(html).toContain('گفتگوها')
    expect(html).toContain('اسناد')
    expect(html).toContain('پایگاه‌های داده')
    expect(html).toContain('سوالات متداول')
    expect(html).toContain('آپلودر')
    expect(html).toContain('خروج')
    expect(html).toContain('با زدن Enter پیام ارسال می‌شود؛ Shift+Enter برای خط جدید.')
    expect(html).toContain('۰ / ۱۰,۰۰۰ کاراکتر')
    expect(html).toContain('aras-subheader-right')
    expect(html).toContain('aras-subheader-left')
    expect(html).toContain('id="aras-delete-active-chat-btn"')
    expect(html).toContain('id="aras-delete-all-sessions-btn"')
    expect(html).toContain('id="aras-settled-list"')
    expect(html).toContain('id="aras-live-slot"')
    expect(html).not.toContain('arasFadeIn')

    // Client-side SPA runtime must parse without syntax errors and render GFM Markdown
    expect(() => new Function(ARAS_UI_SCRIPT)).not.toThrow()

    const win: { __arasRenderMarkdown?: (raw: string) => string } = {}
    const sandbox = vm.createContext({
      window: win,
      document: {
        readyState: 'loading',
        documentElement: { setAttribute() {} },
        addEventListener() {},
        getElementById() { return null },
        querySelectorAll() { return [] },
      },
      localStorage: { getItem() { return 'dark' }, setItem() {} },
      EventSource: function () {},
      fetch: async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({}) }),
      setTimeout,
      clearTimeout,
    })
    vm.runInContext(ARAS_UI_SCRIPT, sandbox)
    expect(typeof win.__arasRenderMarkdown).toBe('function')

    const rendered = win.__arasRenderMarkdown!([
      'سلام دنیا با کد `127.0.0.1:3080`',
      '',
      '- مورد فارسی اول',
      '',
      '1. English step one',
      '',
      '| ستون اول | ستون دوم | کد |',
      '| :--- | :---: | ---: |',
      '| **ردیف ۱** | مقدار \\| تست | `x | y` |',
      '',
      '```ts',
      'const answer = 42',
    ].join('\n'))
    expect(rendered).toContain('<p dir="auto">سلام دنیا با کد <code class="inline">127.0.0.1:3080</code></p>')
    expect(rendered).toContain('<ul dir="rtl"><li dir="auto">مورد فارسی اول</li></ul>')
    expect(rendered).toContain('<ol dir="ltr"><li dir="auto">English step one</li></ol>')
    expect(rendered).toContain('<div class="aras-table-wrap"><table>')
    expect(rendered).toContain('<th style="text-align:center;">ستون دوم</th>')
    expect(rendered).toContain('<strong>ردیف ۱</strong>')
    expect(rendered).toContain('مقدار | تست')
    expect(rendered).toContain('<code class="inline">x | y</code>')
    expect(rendered).toContain('aras-code-block')
    expect(rendered).toContain('const answer = 42')
  })

  it('projects user turns, reasoning, and paired tool results while filtering synthetic injected user messages', () => {
    const events: SessionEvent[] = [
      {
        seq: 0 as never,
        timestamp: 1000,
        type: 'user/message',
        data: {
          id: 'inj-1' as never,
          role: 'user',
          timestamp: 1000,
          source: { kind: 'context-injection' } as never,
          content: [{ type: 'text', text: '<system-reminder>hidden context</system-reminder>' }],
        },
      } as unknown as SessionEvent,
      {
        seq: 1 as never,
        timestamp: 1010,
        type: 'user/message',
        data: {
          id: 'usr-1' as never,
          role: 'user',
          timestamp: 1010,
          source: { kind: 'user' },
          content: [{ type: 'text', text: 'سلام! وضعیت پروژه را بررسی کن.' }],
        },
      } as unknown as SessionEvent,
      {
        seq: 2 as never,
        timestamp: 1020,
        type: 'assistant/message',
        data: {
          turn: 1,
          step: 1,
          message: {
            id: 'ast-1' as never,
            role: 'assistant',
            timestamp: 1020,
            source: { provider: 'deepseek-official', model: 'deepseek-reasoner' },
            stopReason: 'tool_calls',
            content: [
              { type: 'reasoning', text: 'ابتدا فایل package.json را می‌خوانم.' },
              {
                type: 'tool-call',
                id: 'call-1' as never,
                name: 'read_file',
                arguments: '{"path":"package.json"}',
              },
            ],
          },
        },
      } as unknown as SessionEvent,
      {
        seq: 3 as never,
        timestamp: 1030,
        type: 'tool/result',
        data: {
          turn: 1,
          step: 1,
          message: {
            id: 'tr-1' as never,
            role: 'tool',
            toolCallId: 'call-1' as never,
            toolName: 'read_file',
            isError: false,
            timestamp: 1030,
            content: [{ type: 'text', text: '{"name":"demo"}' }],
          },
        },
      } as unknown as SessionEvent,
      {
        seq: 4 as never,
        timestamp: 1040,
        type: 'assistant/message',
        data: {
          turn: 1,
          step: 2,
          message: {
            id: 'ast-2' as never,
            role: 'assistant',
            timestamp: 1040,
            source: { provider: 'deepseek-official', model: 'deepseek-reasoner' },
            stopReason: 'stop',
            content: [{ type: 'text', text: 'فایل package.json بررسی شد و نام پروژه demo است.' }],
          },
        },
      } as unknown as SessionEvent,
    ]

    const items = buildArasTranscript('sess-1', events)

    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({
      kind: 'user',
      id: 'usr-1',
      text: 'سلام! وضعیت پروژه را بررسی کن.',
    })
    expect(items[1]).toMatchObject({
      kind: 'assistant',
      id: 'ast-1',
      reasoning: 'ابتدا فایل package.json را می‌خوانم.',
      tools: [
        {
          callId: 'call-1',
          name: 'read_file',
          argumentsText: '{"path":"package.json"}',
          status: 'completed',
          resultText: '{"name":"demo"}',
        },
      ],
    })
    expect(items[2]).toMatchObject({
      kind: 'assistant',
      id: 'ast-2',
      text: 'فایل package.json بررسی شد و نام پروژه demo است.',
    })
  })

  it('serves settings, custom providers, tool approvals, and user questions over HTTP', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'aras-ui-test-'))
    // Keep `$DSH_HOME` (network config, deleted-session registry, session dirs) inside the test sandbox.
    const previousDshHome = process.env.DSH_HOME
    process.env.DSH_HOME = tempRoot
    const ctx = new Context()
    await ctx.plugin(SessionStore)

    const nsStore = new Map<string, Record<string, unknown>>()
    ctx.provide('settings', {
      writable: true,
      describe: () => [...nsStore.entries()].map(([ns, value]) => ({ ns, value })),
      mutate: async (ns: unknown, ops: readonly SettingsPathOp[]) => {
        const key = String(ns)
        const current = structuredClone(nsStore.get(key) ?? {})
        for (const op of ops) {
          let cursor: Record<string, unknown> = current
          for (let i = 0; i < op.path.length - 1; i++) {
            const seg = op.path[i]!
            if (typeof cursor[seg] !== 'object' || cursor[seg] === null) cursor[seg] = {}
            cursor = cursor[seg] as Record<string, unknown>
          }
          const leaf = op.path[op.path.length - 1]!
          if (op.op === 'set') cursor[leaf] = op.value
          else delete cursor[leaf]
        }
        nsStore.set(key, current)
      },
    } as never)

    const fakeSessionId = brandString<SessionId>('aras-test-session')
    const fakeAgent = {
      session: {
        id: fakeSessionId,
        header: {
          id: fakeSessionId,
          createdAt: Date.now(),
          cwd: tempRoot,
        },
        snapshotEvents: () => [],
      },
      status: 'running',
    } as unknown as Agent

    ctx.provide('agents', {
      get: (id: SessionId) => (String(id) === String(fakeSessionId) ? fakeAgent : undefined),
    } as never)

    const bridge = new ArasHostBridge(ctx, {
      defaultApprovalPolicy: 'ask',
      defaultCwd: tempRoot,
    })
    const apiHandler = createArasApiHandler(bridge)
    const fallbackHandler = createArasFallbackHandler()

    const server = createServer((req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
      if (pathname.startsWith('/aras-api')) {
        void apiHandler(req, res)
        return
      }
      fallbackHandler(req, res)
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const port = (server.address() as AddressInfo).port
    const baseUrl = `http://127.0.0.1:${String(port)}`

    cleanups.push(async () => {
      await bridge.dispose()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await ctx.fiber.dispose()
      await rm(tempRoot, { recursive: true, force: true })
      if (previousDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousDshHome
    })

    // 1. HTML shell fallback
    const rootRes = await fetch(`${baseUrl}/chat/new/`)
    expect(rootRes.status).toBe(200)
    expect(rootRes.headers.get('content-type')).toContain('text/html')
    const html = await rootRes.text()
    expect(html).toContain('دستیار هوشمند ارس')

    // 2. Settings read & update preferences + custom OpenAI gateway
    const initialSettingsRes = await fetch(`${baseUrl}/aras-api/settings`)
    expect(initialSettingsRes.status).toBe(200)
    const initialSettings = (await initialSettingsRes.json()) as {
      preferences: { approvalMode: string }
      credentials: Array<{ ref: string }>
    }
    expect(initialSettings.preferences.approvalMode).toBe('ask')
    expect(initialSettings.credentials.map(c => c.ref)).toEqual(
      expect.arrayContaining(['OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY']),
    )

    const customProviderRes = await fetch(`${baseUrl}/aras-api/settings/providers/custom`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'aras-local-vllm',
        displayName: 'Aras Local Gateway',
        baseURL: 'http://127.0.0.1:8000/v1',
        apiKeyEnv: 'ARAS_VLLM_API_KEY',
        models: [{ id: 'qwen-2.5-72b', name: 'Qwen 2.5 72B' }],
      }),
    })
    expect(customProviderRes.status).toBe(200)
    const afterCustom = (await customProviderRes.json()) as {
      customProviders: Array<{ id: string; baseURL: string }>
    }
    expect(afterCustom.customProviders).toEqual([
      expect.objectContaining({
        id: 'aras-local-vllm',
        baseURL: 'http://127.0.0.1:8000/v1',
      }),
    ])

    // 3. Interactive tool approval waterfall (while approvalMode is 'ask')
    const approvalIds: string[] = []
    const unsub = bridge.subscribe((ev) => {
      if (ev.type === 'approval.requested') approvalIds.push(ev.approval.requestId)
    })

    const approvalPromise = ctx.waterfall(
      'approval/request',
      {
        agent: fakeAgent,
        toolName: 'bash',
        reason: 'اجرای دستور تست',
      } as never,
      async () => 'rejected' as const,
    )

    expect(approvalIds).toHaveLength(1)
    const decisionRes = await fetch(`${baseUrl}/aras-api/approvals/${encodeURIComponent(approvalIds[0]!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'allowed-once' }),
    })
    expect(decisionRes.status).toBe(200)
    expect(await approvalPromise).toBe('allowed-once')

    // 4. Interactive ask_user_question waterfall
    const questionIds: string[] = []
    const unsubQ = bridge.subscribe((ev) => {
      if (ev.type === 'question.requested') questionIds.push(ev.question.requestId)
    })

    const questionPromise = ctx.waterfall(
      'user-questions/request',
      {
        agent: fakeAgent,
        questions: [
          {
            id: 'deploy_env',
            header: 'محیط استقرار',
            question: 'در کدام محیط مستقر شود؟',
            options: [
              { label: 'تست (Staging)', description: 'محیط آزمایشی' },
              { label: 'عملیاتی (Prod)', description: 'محیط اصلی' },
            ],
          },
        ],
      } as never,
      async () => ({ answers: [] }),
    )

    expect(questionIds).toHaveLength(1)
    const qRes = await fetch(`${baseUrl}/aras-api/questions/${encodeURIComponent(questionIds[0]!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        answers: [{ id: 'deploy_env', selected: ['تست (Staging)'] }],
      }),
    })
    expect(qRes.status).toBe(200)
    expect(await questionPromise).toEqual({
      answers: [{ id: 'deploy_env', selected: ['تست (Staging)'] }],
    })

    // 5. Preferences update (`auto-allow`)
    const prefRes = await fetch(`${baseUrl}/aras-api/settings/preferences`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        approvalMode: 'auto-allow',
        defaultCwd: tempRoot,
      }),
    })
    expect(prefRes.status).toBe(200)
    const updatedPref = (await prefRes.json()) as {
      preferences: { approvalMode: string }
    }
    expect(updatedPref.preferences.approvalMode).toBe('auto-allow')

    // 6. Network proxy configuration & 403 diagnostic probe
    expect(normalizeHttpProxyUrl('127.0.0.1:10809')).toBe('http://127.0.0.1:10809')
    expect(parseWindowsProxyServerValue('http=127.0.0.1:10809;https=127.0.0.1:10809;socks=127.0.0.1:10808')).toEqual({
      proxyUrl: 'http://127.0.0.1:10809',
    })

    const directNetRes = await fetch(`${baseUrl}/aras-api/settings/network`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'direct' }),
    })
    expect(directNetRes.status).toBe(200)
    const directNetSnap = (await directNetRes.json()) as {
      network: { mode: string; effectiveProxyUrl: string | null }
    }
    expect(directNetSnap.network.mode).toBe('direct')
    expect(directNetSnap.network.effectiveProxyUrl).toBeNull()

    const diagServer = createServer((req, res) => {
      if (req.url === '/blocked') {
        res.writeHead(403, { 'content-type': 'text/plain' })
        res.end('Access denied by security policy.')
        return
      }
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end('{"error":"missing bearer token"}')
    })
    await new Promise<void>((resolve) => diagServer.listen(0, '127.0.0.1', () => resolve()))
    cleanups.push(async () => {
      await new Promise<void>((resolve) => diagServer.close(() => resolve()))
    })
    const diagPort = (diagServer.address() as AddressInfo).port

    const okProbeRes = await fetch(`${baseUrl}/aras-api/settings/network/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUrl: `http://127.0.0.1:${String(diagPort)}/models` }),
    })
    expect(okProbeRes.status).toBe(200)
    const okProbe = (await okProbeRes.json()) as { reachable: boolean; status: number }
    expect(okProbe.reachable).toBe(true)
    expect(okProbe.status).toBe(401)

    const blockedProbeRes = await fetch(`${baseUrl}/aras-api/settings/network/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUrl: `http://127.0.0.1:${String(diagPort)}/blocked` }),
    })
    expect(blockedProbeRes.status).toBe(200)
    const blockedProbe = (await blockedProbeRes.json()) as { reachable: boolean; status: number; summary: string }
    expect(blockedProbe.reachable).toBe(false)
    expect(blockedProbe.status).toBe(403)
    expect(blockedProbe.summary).toContain('Access denied by security policy')

    // 7. Session deletion (`DELETE /aras-api/sessions/:id`)
    const deletableId = brandString<SessionId>('aras-deletable-session')
    ctx.sessions.create(deletableId, { meta: { cwd: tempRoot } })

    const deletedEvents: string[] = []
    const unsubDel = bridge.subscribe((ev) => {
      if (ev.type === 'session.deleted') deletedEvents.push(ev.sessionId)
    })

    const beforeDeleteList = (await (await fetch(`${baseUrl}/aras-api/sessions`)).json()) as {
      sessions: Array<{ id: string }>
    }
    expect(beforeDeleteList.sessions.map(s => s.id)).toContain(String(deletableId))

    const delRes = await fetch(`${baseUrl}/aras-api/sessions/${encodeURIComponent(String(deletableId))}`, {
      method: 'DELETE',
    })
    expect(delRes.status).toBe(200)
    expect(await delRes.json()).toMatchObject({ ok: true, deleted: true })
    expect(deletedEvents).toContain(String(deletableId))

    const afterDeleteList = (await (await fetch(`${baseUrl}/aras-api/sessions`)).json()) as {
      sessions: Array<{ id: string }>
    }
    expect(afterDeleteList.sessions.map(s => s.id)).not.toContain(String(deletableId))

    const missingDetailRes = await fetch(
      `${baseUrl}/aras-api/sessions/${encodeURIComponent(String(deletableId))}`,
    )
    expect(missingDetailRes.status).toBe(404)

    unsub()
    unsubQ()
    unsubDel()
  })
})
