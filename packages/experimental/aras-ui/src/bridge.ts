/**
 * Host runtime bridge connecting the Aras Smart Assistant UI to DeepSeek Harness
 * services (`ctx.agents`, `ctx.sessions`, `ctx.llm`, `ctx.credentials`, `ctx.settings`,
 * `approval/request`, `user-questions/request`, and live streaming events).
 *
 * @module @deepseek-ai/dsh-aras-ui/bridge
 */

import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection, type Agent, type AgentHandle, type AgentOptions, type ModelSelection } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { admitEncodedImages, type EncodedImageAttachment, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { brandString } from '@deepseek-ai/dsh-brand'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import {
  createUserMessage,
  ReasoningEffortId,
  type ContentBlock,
  type ToolResultMessage,
  type UserMessage,
} from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import { UserQuestionError, type AskUserQuestionAnswer, type AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import type {
  ArasApprovalMode,
  ArasCredentialStatus,
  ArasCustomProviderProfile,
  ArasImageAttachmentView,
  ArasLiveStreamState,
  ArasModelEntry,
  ArasPendingApproval,
  ArasPendingQuestion,
  ArasProviderCatalogGroup,
  ArasSessionDetail,
  ArasSessionSummary,
  ArasSettingsSnapshot,
  ArasStreamEvent,
  ArasToolCallView,
  ArasTranscriptItem,
} from './types.ts'

const STANDARD_CREDENTIAL_REFS: readonly { readonly ref: string; readonly label: string }[] = [
  { ref: 'DEEPSEEK_API_KEY', label: 'کلید API دیپ‌سیک (DeepSeek Official)' },
  { ref: 'OPENROUTER_API_KEY', label: 'کلید API اوپن‌روتر (OpenRouter)' },
  { ref: 'GEMINI_API_KEY', label: 'کلید API گوگل جمینای (Google Gemini)' },
  { ref: 'GROQ_API_KEY', label: 'کلید API گروک (Groq)' },
  { ref: 'OPENAI_API_KEY', label: 'کلید API اوپن‌ای‌آی (OpenAI)' },
  { ref: 'ANTHROPIC_API_KEY', label: 'کلید API آنتروپیک (Anthropic Claude)' },
]

/** Built-in `llm-pi-ai` catalog provider routes keyed by standard API key env var. */
const BUILTIN_PI_AI_CREDENTIAL_ROUTES: Readonly<Record<string, { readonly id: string; readonly displayName: string }>> = {
  OPENROUTER_API_KEY: { id: 'openrouter', displayName: 'OpenRouter' },
  GEMINI_API_KEY: { id: 'google', displayName: 'Google Gemini' },
  GROQ_API_KEY: { id: 'groq', displayName: 'Groq' },
  OPENAI_API_KEY: { id: 'openai', displayName: 'OpenAI' },
  ANTHROPIC_API_KEY: { id: 'anthropic', displayName: 'Anthropic Claude' },
  XAI_API_KEY: { id: 'xai', displayName: 'xAI (Grok)' },
  MISTRAL_API_KEY: { id: 'mistral', displayName: 'Mistral AI' },
  TOGETHER_API_KEY: { id: 'together', displayName: 'Together AI' },
}

interface PendingApprovalEntry {
  readonly view: ArasPendingApproval
  readonly resolve: (outcome: ApprovalOutcome) => void
}

interface PendingQuestionEntry {
  readonly view: ArasPendingQuestion
  readonly questionIds: readonly string[]
  readonly resolve: (answer: AskUserQuestionAnswer) => void
  readonly reject: (error: Error) => void
}

interface MutableLiveStream {
  attemptId: string
  turn: number
  step: number
  reasoning: string
  text: string
  toolCalls: Map<string, { id: string; name: string; argumentsText: string }>
}

/** Bridge initialization options derived from plugin configuration. */
export interface ArasBridgeOptions {
  /** Initial tool approval policy. */
  defaultApprovalPolicy: ArasApprovalMode
  /** Initial working directory for new sessions. */
  defaultCwd: string
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractTextFromBlocks(blocks: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === 'text' && block.text.length > 0) {
      parts.push(block.text)
    } else if (block.type === 'file') {
      parts.push(`[فایل پیوست: ${block.attachment.name}]`)
    }
  }
  return parts.join('\n')
}

function extractReasoningFromBlocks(blocks: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === 'reasoning' && block.text.length > 0) {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

function extractImagesFromBlocks(sessionId: string, blocks: readonly ContentBlock[]): ArasImageAttachmentView[] {
  const images: ArasImageAttachmentView[] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      const ref = block.attachment
      const id = String(ref.attachmentId)
      images.push({
        id,
        mediaType: ref.mediaType,
        width: ref.width,
        height: ref.height,
        ...(ref.name === undefined ? {} : { name: ref.name }),
        url: `/aras-api/sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(id)}`,
      })
    }
  }
  return images
}

function extractToolResultText(message: ToolResultMessage): string {
  return extractTextFromBlocks(message.content)
}

function isHumanUserMessage(message: UserMessage): boolean {
  return message.source.kind === 'user'
}

function deriveTitleFromEvents(events: readonly SessionEvent[]): string | undefined {
  for (const event of events) {
    if (event.type === 'user/message' && isHumanUserMessage(event.data)) {
      const text = extractTextFromBlocks(event.data.content).trim().replace(/\s+/gu, ' ')
      if (text.length > 0) {
        return text.length > 48 ? `${text.slice(0, 48)}…` : text
      }
    }
  }
  return undefined
}

/**
 * Project a Session's durable event log into ordered Aras UI transcript items.
 * @param sessionId - owning Session identifier.
 * @param events - contiguous durable Session events.
 * @returns ordered user, assistant, and tool-enriched items for rendering.
 */
export function buildArasTranscript(sessionId: string, events: readonly SessionEvent[]): ArasTranscriptItem[] {
  const items: ArasTranscriptItem[] = []
  const assistantByStep = new Map<string, {
    id: string
    seq: number
    turn: number
    step: number
    provider: string
    model: string
    reasoning: string
    text: string
    interrupted: boolean
    tools: Map<string, ArasToolCallView>
  }>()
  const toolToStepKey = new Map<string, string>()

  for (const event of events) {
    switch (event.type) {
      case 'user/message': {
        if (!isHumanUserMessage(event.data)) break
        const text = extractTextFromBlocks(event.data.content)
        const images = extractImagesFromBlocks(sessionId, event.data.content)
        if (text.trim().length === 0 && images.length === 0) break
        items.push({
          kind: 'user',
          id: String(event.data.id),
          seq: Number(event.seq),
          text,
          images,
        })
        break
      }
      case 'assistant/message': {
        const key = `${String(event.data.turn)}:${String(event.data.step)}`
        const tools = new Map<string, ArasToolCallView>()
        for (const block of event.data.message.content) {
          if (block.type === 'tool-call') {
            const callId = String(block.id)
            tools.set(callId, {
              callId,
              name: block.name,
              argumentsText: block.arguments,
              status: 'running',
            })
            toolToStepKey.set(callId, key)
          }
        }
        const entry = {
          id: String(event.data.message.id),
          seq: Number(event.seq),
          turn: event.data.turn,
          step: event.data.step,
          provider: event.data.message.source.provider,
          model: event.data.message.source.model,
          reasoning: extractReasoningFromBlocks(event.data.message.content),
          text: extractTextFromBlocks(event.data.message.content),
          interrupted: event.data.interrupted === true,
          tools,
        }
        assistantByStep.set(key, entry)
        items.push({
          kind: 'assistant',
          id: entry.id,
          seq: entry.seq,
          turn: entry.turn,
          step: entry.step,
          provider: entry.provider,
          model: entry.model,
          reasoning: entry.reasoning,
          text: entry.text,
          interrupted: entry.interrupted,
          tools: [...entry.tools.values()],
        })
        break
      }
      case 'tool/call': {
        const key = `${String(event.data.turn)}:${String(event.data.step)}`
        const callId = String(event.data.callId)
        toolToStepKey.set(callId, key)
        let entry = assistantByStep.get(key)
        if (entry === undefined) {
          entry = {
            id: `step-${key}`,
            seq: Number(event.seq),
            turn: event.data.turn,
            step: event.data.step,
            provider: '',
            model: '',
            reasoning: '',
            text: '',
            interrupted: false,
            tools: new Map(),
          }
          assistantByStep.set(key, entry)
          items.push({
            kind: 'assistant',
            id: entry.id,
            seq: entry.seq,
            turn: entry.turn,
            step: entry.step,
            provider: entry.provider,
            model: entry.model,
            reasoning: entry.reasoning,
            text: entry.text,
            interrupted: entry.interrupted,
            tools: [],
          })
        }
        if (!entry.tools.has(callId)) {
          entry.tools.set(callId, {
            callId,
            name: event.data.name,
            argumentsText: event.data.arguments,
            status: 'running',
          })
          syncAssistantTools(items, entry.id, entry.tools)
        }
        break
      }
      case 'tool/result': {
        const callId = String(event.data.message.toolCallId)
        const key = toolToStepKey.get(callId) ?? `${String(event.data.turn)}:${String(event.data.step)}`
        const entry = assistantByStep.get(key)
        if (entry !== undefined) {
          const existing = entry.tools.get(callId)
          const isError = event.data.message.isError === true
          entry.tools.set(callId, {
            callId,
            name: existing?.name ?? 'tool',
            argumentsText: existing?.argumentsText ?? '{}',
            status: isError ? 'error' : 'completed',
            resultText: extractToolResultText(event.data.message),
            ...(event.data.error?.reason === undefined ? {} : { errorReason: event.data.error.reason }),
          })
          syncAssistantTools(items, entry.id, entry.tools)
        }
        break
      }
      default:
        break
    }
  }

  return items
}

function syncAssistantTools(
  items: ArasTranscriptItem[],
  assistantId: string,
  tools: ReadonlyMap<string, ArasToolCallView>,
): void {
  const index = items.findIndex(item => item.kind === 'assistant' && item.id === assistantId)
  if (index < 0) return
  const current = items[index]
  if (current === undefined || current.kind !== 'assistant') return
  items[index] = {
    ...current,
    tools: [...tools.values()],
  }
}

/**
 * Stateful Host controller for Aras UI sessions, streaming events, approvals,
 * clarifying questions, and settings/credential management.
 */
export class ArasHostBridge {
  private approvalMode: ArasApprovalMode
  private defaultCwd: string
  private readonly ownedHandles = new Map<string, AgentHandle>()
  private readonly customTitles = new Map<string, string>()
  private readonly attachmentRefs = new Map<string, ImageAttachmentRef>()
  private readonly liveStreams = new Map<string, MutableLiveStream>()
  private readonly pendingApprovals = new Map<string, PendingApprovalEntry>()
  private readonly pendingQuestions = new Map<string, PendingQuestionEntry>()
  private readonly subscribers = new Set<(event: ArasStreamEvent) => void>()
  private readonly disposers: (() => void)[] = []
  private readonly dismissedBuiltinRoutes = new Set<string>()
  private readonly lifetime = new AbortController()

  /**
   * Bind listeners onto the Cordis Host context.
   * @param ctx - Host Cordis context.
   * @param options - resolved initial bridge configuration.
   */
  constructor(
    private readonly ctx: Context,
    options?: Partial<ArasBridgeOptions>,
  ) {
    this.approvalMode = options?.defaultApprovalPolicy ?? 'ask'
    this.defaultCwd = resolve(options?.defaultCwd ?? process.cwd())

    this.disposers.push(ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      if (agent.session.header.origin === 'subagent') return
      const sessionId = String(agent.session.id)
      const attemptId = String(frame.attemptId)
      if (frame.type === 'start') {
        this.liveStreams.set(sessionId, {
          attemptId,
          turn: frame.turn,
          step: frame.step,
          reasoning: '',
          text: '',
          toolCalls: new Map(),
        })
        this.broadcast({
          type: 'stream.start',
          sessionId,
          attemptId,
          turn: frame.turn,
          step: frame.step,
        })
      } else if (frame.type === 'chunk') {
        const active = this.liveStreams.get(sessionId)
        if (frame.chunk.type === 'text-delta') {
          if (active !== undefined) active.text += frame.chunk.text
          this.broadcast({
            type: 'stream.delta',
            sessionId,
            attemptId,
            deltaKind: 'text',
            text: frame.chunk.text,
          })
        } else if (frame.chunk.type === 'reasoning-delta') {
          if (active !== undefined) active.reasoning += frame.chunk.text
          this.broadcast({
            type: 'stream.delta',
            sessionId,
            attemptId,
            deltaKind: 'reasoning',
            text: frame.chunk.text,
          })
        } else if (frame.chunk.type === 'tool-call-delta') {
          const callId = String(frame.chunk.id)
          if (active !== undefined) {
            const current = active.toolCalls.get(callId) ?? { id: callId, name: frame.chunk.name ?? '', argumentsText: '' }
            if (frame.chunk.name !== undefined && frame.chunk.name.length > 0) current.name = frame.chunk.name
            current.argumentsText += frame.chunk.argumentsDelta
            active.toolCalls.set(callId, current)
          }
          this.broadcast({
            type: 'stream.delta',
            sessionId,
            attemptId,
            deltaKind: 'tool-call',
            toolCallId: callId,
            ...(frame.chunk.name === undefined ? {} : { toolName: frame.chunk.name }),
            argumentsDelta: frame.chunk.argumentsDelta,
          })
        }
      } else if (frame.type === 'end') {
        this.liveStreams.delete(sessionId)
        this.broadcast({
          type: 'stream.end',
          sessionId,
          attemptId,
          committed: frame.outcome.kind === 'committed' && frame.outcome.eventType === 'assistant/message',
        })
      }
    }))

    this.disposers.push(ctx.on('session/event', (session, event) => {
      if (session.header.origin === 'subagent') return
      const sessionId = String(session.id)
      this.recordSessionAttachments(event)
      if (event.type === 'user/message' && isHumanUserMessage(event.data)) {
        const text = extractTextFromBlocks(event.data.content)
        const images = extractImagesFromBlocks(sessionId, event.data.content)
        if (text.trim().length > 0 || images.length > 0) {
          if (!this.customTitles.has(sessionId) && text.trim().length > 0) {
            const compact = text.trim().replace(/\s+/gu, ' ')
            this.customTitles.set(sessionId, compact.length > 48 ? `${compact.slice(0, 48)}…` : compact)
            this.broadcast({ type: 'session.updated', session: this.summarizeLiveSession(session) })
          }
          this.broadcast({
            type: 'transcript.item',
            sessionId,
            item: {
              kind: 'user',
              id: String(event.data.id),
              seq: Number(event.seq),
              text,
              images,
            },
          })
        }
      } else if (event.type === 'assistant/message') {
        const tools: ArasToolCallView[] = []
        for (const block of event.data.message.content) {
          if (block.type === 'tool-call') {
            tools.push({
              callId: String(block.id),
              name: block.name,
              argumentsText: block.arguments,
              status: 'running',
            })
          }
        }
        this.broadcast({
          type: 'transcript.item',
          sessionId,
          item: {
            kind: 'assistant',
            id: String(event.data.message.id),
            seq: Number(event.seq),
            turn: event.data.turn,
            step: event.data.step,
            provider: event.data.message.source.provider,
            model: event.data.message.source.model,
            reasoning: extractReasoningFromBlocks(event.data.message.content),
            text: extractTextFromBlocks(event.data.message.content),
            interrupted: event.data.interrupted === true,
            tools,
          },
        })
      } else if (event.type === 'tool/call') {
        this.broadcast({
          type: 'tool.call',
          sessionId,
          turn: event.data.turn,
          step: event.data.step,
          tool: {
            callId: String(event.data.callId),
            name: event.data.name,
            argumentsText: event.data.arguments,
            status: 'running',
          },
        })
      } else if (event.type === 'tool/result') {
        const isError = event.data.message.isError === true
        this.broadcast({
          type: 'tool.result',
          sessionId,
          turn: event.data.turn,
          step: event.data.step,
          callId: String(event.data.message.toolCallId),
          status: isError ? 'error' : 'completed',
          resultText: extractToolResultText(event.data.message),
          ...(event.data.error?.reason === undefined ? {} : { errorReason: event.data.error.reason }),
        })
      }
    }))

    this.disposers.push(ctx.on('agent/status', ({ agent, status }) => {
      if (agent.session.header.origin === 'subagent') return
      this.broadcast({
        type: 'session.status',
        sessionId: String(agent.session.id),
        status,
      })
    }))

    this.disposers.push(ctx.on('agent/error', ({ agent, error }) => {
      if (agent.session.header.origin === 'subagent') return
      const message = error instanceof Error ? error.message : String(error)
      this.broadcast({
        type: 'session.error',
        sessionId: String(agent.session.id),
        message,
      })
    }))

    this.disposers.push(ctx.on('approval/request', async (request, next) => {
      const rootSessionId = this.resolveRootSessionId(request.agent)
      if (rootSessionId === undefined) return next()
      if (this.approvalMode === 'auto-allow') return 'allowed-once'
      if (this.approvalMode === 'never') return 'rejected'

      const requestId = randomUUID()
      const view: ArasPendingApproval = {
        requestId,
        sessionId: rootSessionId,
        toolName: request.toolName,
        ...(request.callId === undefined ? {} : { callId: String(request.callId) }),
        ...(request.reason === undefined ? {} : { reason: request.reason }),
        createdAt: Date.now(),
      }

      const signal = request.signal === undefined
        ? this.lifetime.signal
        : AbortSignal.any([request.signal, this.lifetime.signal])
      if (signal.aborted) return 'cancelled'

      return new Promise<ApprovalOutcome>((resolveOutcome) => {
        const onAbort = (): void => {
          if (this.pendingApprovals.delete(requestId)) {
            this.broadcast({ type: 'approval.resolved', requestId, sessionId: rootSessionId, outcome: 'cancelled' })
          }
          resolveOutcome('cancelled')
        }
        signal.addEventListener('abort', onAbort, { once: true })
        this.pendingApprovals.set(requestId, {
          view,
          resolve: (outcome) => {
            signal.removeEventListener('abort', onAbort)
            this.pendingApprovals.delete(requestId)
            this.broadcast({ type: 'approval.resolved', requestId, sessionId: rootSessionId, outcome })
            resolveOutcome(outcome)
          },
        })
        this.broadcast({ type: 'approval.requested', approval: view })
      })
    }))

    this.disposers.push(ctx.on('user-questions/request', async (request: AskUserQuestionRequest, next) => {
      if (request.agent === undefined) return next()
      const rootSessionId = this.resolveRootSessionId(request.agent)
      if (rootSessionId === undefined) return next()

      const requestId = randomUUID()
      const view: ArasPendingQuestion = {
        requestId,
        sessionId: rootSessionId,
        questions: request.questions,
        createdAt: Date.now(),
      }

      const signal = request.signal === undefined
        ? this.lifetime.signal
        : AbortSignal.any([request.signal, this.lifetime.signal])
      if (signal.aborted) {
        throw new UserQuestionError('Aras question aborted before display', 'ASK_ABORTED')
      }

      return new Promise<AskUserQuestionAnswer>((resolveAnswer, rejectAnswer) => {
        const onAbort = (): void => {
          if (this.pendingQuestions.delete(requestId)) {
            this.broadcast({ type: 'question.resolved', requestId, sessionId: rootSessionId })
          }
          rejectAnswer(new UserQuestionError('Aras question cancelled by runtime', 'ASK_ABORTED'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
        this.pendingQuestions.set(requestId, {
          view,
          questionIds: request.questions.map(question => question.id),
          resolve: (answer) => {
            signal.removeEventListener('abort', onAbort)
            this.pendingQuestions.delete(requestId)
            this.broadcast({ type: 'question.resolved', requestId, sessionId: rootSessionId })
            resolveAnswer(answer)
          },
          reject: (error) => {
            signal.removeEventListener('abort', onAbort)
            this.pendingQuestions.delete(requestId)
            this.broadcast({ type: 'question.resolved', requestId, sessionId: rootSessionId })
            rejectAnswer(error)
          },
        })
        this.broadcast({ type: 'question.requested', question: view })
      })
    }))
  }

  /**
   * Subscribe an SSE listener to real-time bridge events.
   * @param listener - callback invoked for each broadcast event.
   * @returns disposer that unregisters the listener.
   */
  subscribe(listener: (event: ArasStreamEvent) => void): () => void {
    this.subscribers.add(listener)
    listener({ type: 'ready', timestamp: Date.now() })
    return () => {
      this.subscribers.delete(listener)
    }
  }

  /**
   * List ordinary sessions ordered newest-first.
   * @returns summaries of live and persisted sessions.
   */
  async listSessions(): Promise<ArasSessionSummary[]> {
    const byId = new Map<string, ArasSessionSummary>()

    const persistence = this.ctx.get('sessionPersistence')
    if (persistence !== undefined) {
      const stored = await persistence.list()
      for (const snap of stored) {
        const header = snap.header
        if (header.origin === 'subagent') continue
        const id = String(header.id)
        byId.set(id, {
          id,
          title: this.customTitles.get(id) ?? `گفتگو ${id.slice(-6)}`,
          createdAt: header.createdAt,
          cwd: header.cwd ?? this.defaultCwd,
          status: 'idle',
        })
      }
    }

    for (const session of this.ctx.sessions.list()) {
      if (session.header.origin === 'subagent') continue
      byId.set(String(session.id), this.summarizeLiveSession(session))
    }

    return [...byId.values()].sort((left, right) => right.createdAt - left.createdAt)
  }

  /**
   * Create a fresh conversation session backed by a live DSH Agent.
   * @param requestedCwd - optional working directory override.
   * @returns complete detail of the newly created session.
   */
  async createSession(requestedCwd?: string): Promise<ArasSessionDetail> {
    const cwd = resolve(requestedCwd !== undefined && requestedCwd.trim().length > 0 ? requestedCwd : this.defaultCwd)
    await mkdir(cwd, { recursive: true })
    await this.sanitizeSavedDefaultSelection()
    const sessionId = brandString<SessionId>(`aras-${randomUUID()}`)
    const presets = this.ctx.get('agentPresets')
    const resolvedPreset = presets === undefined ? undefined : (await presets.resolve(undefined)).id

    const handle = await this.ctx.agents.create({
      sessionId,
      agentOptions: this.defaultAgentOptions(),
      meta: {
        cwd,
        ...(resolvedPreset === undefined ? {} : { agentPreset: resolvedPreset }),
      },
      setup: async (agentCtx) => {
        installModelSelection(agentCtx)
        if (presets !== undefined && resolvedPreset !== undefined) {
          await presets.mount(agentCtx, resolvedPreset)
        }
      },
    })
    this.ownedHandles.set(String(sessionId), handle)
    const summary = this.summarizeLiveSession(handle.agent.session)
    this.broadcast({ type: 'session.updated', session: summary })
    return this.detailForAgent(handle.agent)
  }

  /**
   * Open or resume an existing session and return its full transcript and live state.
   * @param rawId - session id string.
   * @returns session detail snapshot.
   */
  async getSessionDetail(rawId: string): Promise<ArasSessionDetail> {
    const agent = await this.ensureLiveAgent(rawId)
    return this.detailForAgent(agent)
  }

  /**
   * Queue a user prompt (with optional base64 images) onto a session's Agent.
   * @param rawId - target session id, or `'new'` to create one automatically.
   * @param input - prompt text and optional encoded images.
   * @returns target session id and accepted message id.
   */
  async sendPrompt(
    rawId: string,
    input: {
      readonly text: string
      readonly images?: readonly { readonly data: string; readonly mediaType: string; readonly name?: string }[]
      readonly steer?: boolean
    },
  ): Promise<{ readonly sessionId: string; readonly messageId: string }> {
    const agent = rawId === 'new'
      ? (await this.createSession()).session.id
      : rawId
    const liveAgent = typeof agent === 'string' ? await this.ensureLiveAgent(agent) : agent
    const sessionId = String(liveAgent.session.id)

    const blocks: ContentBlock[] = []
    if (input.images !== undefined && input.images.length > 0) {
      const attachments = this.ctx.get('attachments')
      if (attachments === undefined) {
        throw new Error('سرویس ذخیره‌سازی پیوست در این نمایه فعال نیست.')
      }
      const refs = await admitEncodedImages(
        attachments,
        input.images.map((img): EncodedImageAttachment => {
          const mediaType = img.mediaType === 'image/png'
            || img.mediaType === 'image/jpeg'
            || img.mediaType === 'image/webp'
            || img.mediaType === 'image/gif'
            ? img.mediaType
            : 'image/png'
          return {
            data: img.data,
            mediaType,
            ...(img.name === undefined ? {} : { name: img.name }),
          }
        }),
      )
      for (const ref of refs) {
        this.attachmentRefs.set(`${sessionId}:${String(ref.attachmentId)}`, ref)
        blocks.push({ type: 'image', attachment: ref })
      }
    }

    const trimmed = input.text.trim()
    if (trimmed.length > 0) {
      blocks.push({ type: 'text', text: input.text })
    }
    if (blocks.length === 0) {
      throw new Error('متن پیام یا تصویر پیوست الزامی است.')
    }

    const userMessage = createUserMessage({
      content: blocks,
      source: { kind: 'user' },
    })

    if (input.steer === true && liveAgent.status === 'running') {
      liveAgent.steer(userMessage)
    } else {
      liveAgent.followup(userMessage)
    }

    return {
      sessionId,
      messageId: String(userMessage.id),
    }
  }

  /**
   * Cancel the active turn on a live session.
   * @param rawId - session id to cancel.
   * @returns whether a live session was found and signalled.
   */
  cancelSession(rawId: string): { readonly cancelled: boolean } {
    const live = this.ctx.agents.get(brandString<SessionId>(rawId))
    if (live === undefined) return { cancelled: false }
    live.cancel({ kind: 'user' })
    return { cancelled: true }
  }

  /**
   * Read raw bytes of an admitted image attachment for display in the chat transcript.
   * @param sessionId - session id string.
   * @param attachmentId - attachment id string.
   * @returns mediaType and raw image bytes, or undefined when unavailable.
   */
  async readImageAttachment(
    sessionId: string,
    attachmentId: string,
  ): Promise<{ readonly mediaType: string; readonly bytes: Uint8Array } | undefined> {
    const attachments = this.ctx.get('attachments')
    if (attachments === undefined) return undefined
    const ref = this.attachmentRefs.get(`${sessionId}:${attachmentId}`) ?? this.attachmentRefs.get(`*:${attachmentId}`)
    if (ref === undefined) return undefined
    const stored = await attachments.readImage(ref)
    return { mediaType: ref.mediaType, bytes: stored.data }
  }

  /**
   * Resolve a pending interactive tool-permission request.
   * @param requestId - pending approval id.
   * @param outcome - user decision (`allowed-once`, `rejected`, or `cancelled`).
   * @returns whether a matching pending request existed.
   */
  resolveApproval(requestId: string, outcome: ApprovalOutcome): boolean {
    const entry = this.pendingApprovals.get(requestId)
    if (entry === undefined) return false
    entry.resolve(outcome)
    return true
  }

  /**
   * Resolve or dismiss a pending `ask_user_question` prompt.
   * @param requestId - pending question request id.
   * @param payload - structured answers per question id, or `{ cancelled: true }`.
   * @returns whether a matching pending question existed.
   */
  resolveQuestion(
    requestId: string,
    payload:
      | { readonly cancelled: true }
      | { readonly answers: readonly { readonly id: string; readonly selected: readonly string[]; readonly custom?: string }[] },
  ): boolean {
    const entry = this.pendingQuestions.get(requestId)
    if (entry === undefined) return false
    if ('cancelled' in payload && payload.cancelled) {
      entry.reject(new UserQuestionError('کاربر از پاسخ به سوال صرف‌نظر کرد', 'ASK_CANCELLED'))
      return true
    }
    if (!('answers' in payload)) return false
    entry.resolve({
      answers: payload.answers.map(ans => ({
        id: ans.id,
        selected: [...ans.selected],
        ...(ans.custom === undefined || ans.custom.trim().length === 0 ? {} : { custom: ans.custom }),
      })),
    })
    return true
  }

  /**
   * Read the full redacted settings, credentials, and live model catalog snapshot.
   * @returns complete settings payload for the Aras Settings screen.
   */
  async getSettingsSnapshot(): Promise<ArasSettingsSnapshot> {
    const defaultSel = this.currentDefaultSelection()
    const settingsSvc = this.ctx.get('settings')
    const credentialsSvc = this.ctx.get('credentials')

    let namespaces = settingsSvc?.describe({ redactSecrets: true }) ?? []
    const deepseekNs = namespaces.find(item => String(item.ns) === 'llm-deepseek')
    const deepseekVal = isPlainRecord(deepseekNs?.value) ? deepseekNs.value : {}
    const deepseekConfig = {
      baseURL: typeof deepseekVal.baseURL === 'string' ? deepseekVal.baseURL : 'https://api.deepseek.com',
      apiKeyEnv: typeof deepseekVal.apiKeyEnv === 'string' && deepseekVal.apiKeyEnv.length > 0
        ? deepseekVal.apiKeyEnv
        : 'DEEPSEEK_API_KEY',
      reasoningEffort: typeof deepseekVal.reasoningEffort === 'string' ? deepseekVal.reasoningEffort : '',
    }

    let piAiNs = namespaces.find(item => String(item.ns) === 'llm-pi-ai')
    let piAiVal = isPlainRecord(piAiNs?.value) ? piAiNs.value : {}
    let rawProviders = isPlainRecord(piAiVal.providers) ? piAiVal.providers : {}

    // Auto-activate built-in pi-ai catalog routes (OpenRouter, Gemini, Groq, OpenAI, Anthropic)
    // when their standard API key is already saved in credentials and not manually dismissed.
    if (settingsSvc?.writable === true && credentialsSvc !== undefined) {
      const autoOps: { op: 'set'; path: readonly string[]; value: unknown }[] = []
      const addedRouteIds: string[] = []
      for (const [envRef, routeMeta] of Object.entries(BUILTIN_PI_AI_CREDENTIAL_ROUTES)) {
        if (routeMeta.id in rawProviders || this.dismissedBuiltinRoutes.has(routeMeta.id)) continue
        const credInfo = await credentialsSvc.describe(credentialRef(envRef))
        if (credInfo.configured) {
          autoOps.push({
            op: 'set',
            path: ['providers', routeMeta.id],
            value: { displayName: routeMeta.displayName, apiKeyEnv: envRef },
          })
          addedRouteIds.push(routeMeta.id)
        }
      }
      if (autoOps.length > 0) {
        await settingsSvc.mutate(brandString<SettingsNamespace>('llm-pi-ai'), autoOps)
        await this.waitForProviderRoutes(addedRouteIds, true)
        namespaces = settingsSvc.describe({ redactSecrets: true })
        piAiNs = namespaces.find(item => String(item.ns) === 'llm-pi-ai')
        piAiVal = isPlainRecord(piAiNs?.value) ? piAiNs.value : {}
        rawProviders = isPlainRecord(piAiVal.providers) ? piAiVal.providers : {}
      }
    }

    const { groups, failures } = await this.buildLiveCatalog()
    const customProviders: ArasCustomProviderProfile[] = []
    const extraRefs = new Set<string>()
    if (deepseekConfig.apiKeyEnv.length > 0) extraRefs.add(deepseekConfig.apiKeyEnv)

    for (const [id, profile] of Object.entries(rawProviders)) {
      if (!isPlainRecord(profile)) continue
      const apiKeyEnv = typeof profile.apiKeyEnv === 'string' ? profile.apiKeyEnv : ''
      if (apiKeyEnv.length > 0) extraRefs.add(apiKeyEnv)
      const rawModels = Array.isArray(profile.models) ? profile.models : []
      const models: { id: string; name: string }[] = []
      for (const item of rawModels) {
        if (isPlainRecord(item) && typeof item.id === 'string') {
          models.push({
            id: item.id,
            name: typeof item.name === 'string' && item.name.length > 0 ? item.name : item.id,
          })
        }
      }
      customProviders.push({
        id,
        displayName: typeof profile.displayName === 'string' && profile.displayName.length > 0 ? profile.displayName : id,
        api: typeof profile.api === 'string' && profile.api.length > 0 ? profile.api : 'catalog-default',
        baseURL: typeof profile.baseURL === 'string' ? profile.baseURL : '',
        apiKeyEnv,
        models,
      })
    }

    const refMap = new Map<string, string>(STANDARD_CREDENTIAL_REFS.map(item => [item.ref, item.label]))
    for (const ref of extraRefs) {
      if (!refMap.has(ref)) refMap.set(ref, `متغیر کلید سفارشی (${ref})`)
    }

    const credentials: ArasCredentialStatus[] = []
    for (const [ref, label] of refMap.entries()) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(ref)) continue
      if (credentialsSvc === undefined) {
        const fromEnv = typeof process.env[ref] === 'string' && process.env[ref].length > 0
        credentials.push({
          ref,
          label,
          configured: fromEnv,
          ...(fromEnv ? { source: 'environment' } : {}),
          writable: false,
        })
      } else {
        const info = await credentialsSvc.describe(credentialRef(ref))
        credentials.push({
          ref,
          label,
          configured: info.configured,
          ...(info.source === undefined ? {} : { source: info.source }),
          writable: info.writable,
        })
      }
    }

    return {
      defaultModel: defaultSel,
      catalog: groups,
      catalogFailures: failures,
      credentials,
      deepseekConfig,
      customProviders,
      preferences: {
        approvalMode: this.approvalMode,
        defaultCwd: this.defaultCwd,
      },
      settingsWritable: settingsSvc?.writable ?? false,
      credentialsWritable: credentialsSvc !== undefined,
    }
  }

  /**
   * Set or remove an API key in the Harness credential store.
   * @param ref - environment variable / credential reference name.
   * @param value - secret value to save, or undefined/empty when unsetting.
   * @param unset - true to delete the stored credential.
   */
  async updateCredential(ref: string, value: string | undefined, unset: boolean): Promise<void> {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(ref)) {
      throw new Error('نام متغیر کلید API نامعتبر است (فقط حروف انگلیسی، اعداد و زیرخط مجاز است).')
    }
    const credentialsSvc = this.ctx.get('credentials')
    if (credentialsSvc === undefined) {
      throw new Error('سرویس مدیریت کلیدها (credentials) در این نمایه فعال نیست.')
    }
    const branded = credentialRef(ref)
    if (unset) {
      await credentialsSvc.unset(branded)
    } else {
      if (value === undefined || value.trim().length === 0) {
        throw new Error('مقدار کلید API نمی‌تواند خالی باشد.')
      }
      await credentialsSvc.set(branded, value.trim())

      const builtinRoute = BUILTIN_PI_AI_CREDENTIAL_ROUTES[ref]
      const settingsSvc = this.ctx.get('settings')
      if (builtinRoute !== undefined && settingsSvc?.writable === true) {
        this.dismissedBuiltinRoutes.delete(builtinRoute.id)
        const namespaces = settingsSvc.describe({ redactSecrets: true })
        const piAiNs = namespaces.find(item => String(item.ns) === 'llm-pi-ai')
        const piAiVal = isPlainRecord(piAiNs?.value) ? piAiNs.value : {}
        const rawProviders = isPlainRecord(piAiVal.providers) ? piAiVal.providers : {}
        if (!(builtinRoute.id in rawProviders)) {
          await settingsSvc.mutate(brandString<SettingsNamespace>('llm-pi-ai'), [{
            op: 'set',
            path: ['providers', builtinRoute.id],
            value: { displayName: builtinRoute.displayName, apiKeyEnv: ref },
          }])
          await this.waitForProviderRoutes([builtinRoute.id], true)
        }
      }
    }
  }

  /**
   * Update the active default model selection (and optionally apply it to a live session).
   * @param input - provider, model, optional reasoning effort, and optional sessionId.
   */
  async updateModelSelection(input: {
    readonly provider: string
    readonly model: string
    readonly reasoningEffort?: string
    readonly sessionId?: string
  }): Promise<void> {
    if (input.provider.trim().length === 0 || input.model.trim().length === 0) {
      throw new Error('انتخاب ارائه‌دهنده و نام مدل الزامی است.')
    }
    const provider = input.provider.trim()
    const model = input.model.trim()
    const normalizedEffort = await this.normalizeReasoningEffort(
      provider,
      model,
      input.reasoningEffort?.trim(),
    )
    const selection: ModelSelection = {
      provider,
      model,
      ...(normalizedEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(normalizedEffort) }),
    }
    const defaults = this.ctx.get('agentDefaultModel')
    if (defaults !== undefined) {
      await defaults.saveSelection(selection)
    }
    if (input.sessionId !== undefined && input.sessionId.length > 0) {
      const live = this.ctx.agents.get(brandString<SessionId>(input.sessionId))
      live?.model.select(selection)
    }
  }

  /**
   * Update the built-in `llm-deepseek` provider configuration.
   * @param input - baseURL, apiKeyEnv, and optional default reasoningEffort.
   */
  async updateDeepSeekConfig(input: {
    readonly baseURL?: string
    readonly apiKeyEnv?: string
    readonly reasoningEffort?: string
  }): Promise<void> {
    const settingsSvc = this.ctx.get('settings')
    if (settingsSvc === undefined || !settingsSvc.writable) {
      throw new Error('سرویس تنظیمات قابل ویرایش در این نمایه در دسترس نیست.')
    }
    const ns = brandString<SettingsNamespace>('llm-deepseek')
    const ops: (
      | { op: 'set'; path: readonly string[]; value: unknown }
      | { op: 'unset'; path: readonly string[] }
    )[] = []

    if (input.baseURL !== undefined) {
      const trimmed = input.baseURL.trim()
      if (trimmed.length === 0 || trimmed === 'https://api.deepseek.com') {
        ops.push({ op: 'unset', path: ['baseURL'] })
      } else {
        ops.push({ op: 'set', path: ['baseURL'], value: trimmed })
      }
    }
    if (input.apiKeyEnv !== undefined && input.apiKeyEnv.trim().length > 0) {
      ops.push({ op: 'set', path: ['apiKeyEnv'], value: input.apiKeyEnv.trim() })
    }
    if (input.reasoningEffort !== undefined) {
      const trimmed = input.reasoningEffort.trim()
      if (trimmed.length === 0) {
        ops.push({ op: 'unset', path: ['reasoningEffort'] })
      } else {
        ops.push({ op: 'set', path: ['reasoningEffort'], value: trimmed })
      }
    }

    if (ops.length > 0) {
      await settingsSvc.mutate(ns, ops)
    }
  }

  /**
   * Add, update, or remove a provider profile under `llm-pi-ai` (OpenAI, Anthropic, OpenRouter, Ollama, custom gateways).
   * @param input - provider route profile or `{ id, remove: true }`.
   */
  async upsertCustomProvider(
    input:
      | { readonly id: string; readonly remove: true }
      | {
        readonly id: string
        readonly displayName?: string
        readonly api?: string
        readonly baseURL?: string
        readonly apiKeyEnv?: string
        readonly models?: readonly { readonly id: string; readonly name?: string }[]
      },
  ): Promise<void> {
    const routeId = input.id.trim()
    if (!/^[a-z0-9][a-z0-9-_]*$/u.test(routeId)) {
      throw new Error('شناسه ارائه‌دهنده باید با حروف کوچک انگلیسی، اعداد یا خط تیره باشد (مثلاً openai یا custom-gateway).')
    }
    const settingsSvc = this.ctx.get('settings')
    if (settingsSvc === undefined || !settingsSvc.writable) {
      throw new Error('سرویس تنظیمات قابل ویرایش در این نمایه در دسترس نیست.')
    }
    const ns = brandString<SettingsNamespace>('llm-pi-ai')
    if ('remove' in input) {
      this.dismissedBuiltinRoutes.add(routeId)
      await settingsSvc.mutate(ns, [{ op: 'unset', path: ['providers', routeId] }])
      await this.waitForProviderRoutes([routeId], false)
      return
    }

    this.dismissedBuiltinRoutes.delete(routeId)
    const profile: Record<string, unknown> = {}
    if (input.displayName !== undefined && input.displayName.trim().length > 0) {
      profile.displayName = input.displayName.trim()
    }
    if (input.api !== undefined && input.api.trim().length > 0) {
      profile.api = input.api.trim()
    }
    if (input.baseURL !== undefined && input.baseURL.trim().length > 0) {
      profile.baseURL = input.baseURL.trim()
    }
    if (input.apiKeyEnv !== undefined && input.apiKeyEnv.trim().length > 0) {
      profile.apiKeyEnv = input.apiKeyEnv.trim()
    }
    if (input.models !== undefined && input.models.length > 0) {
      profile.models = input.models
        .filter(model => model.id.trim().length > 0)
        .map(model => ({
          id: model.id.trim(),
          ...(model.name !== undefined && model.name.trim().length > 0 ? { name: model.name.trim() } : {}),
        }))
    }

    await settingsSvc.mutate(ns, [{ op: 'set', path: ['providers', routeId], value: profile }])
    await this.waitForProviderRoutes([routeId], true)
  }

  private async waitForProviderRoutes(routeIds: readonly string[], shouldExist: boolean): Promise<void> {
    const llm = this.ctx.get('llm')
    if (llm === undefined || routeIds.length === 0) return
    for (let attempt = 0; attempt < 16; attempt++) {
      const registered = new Set(llm.listProviders().map(item => item.id))
      const settled = routeIds.every(id => registered.has(id) === shouldExist)
      if (settled) return
      await new Promise<void>(resolveDelay => setTimeout(resolveDelay, 50))
    }
  }

  private async normalizeReasoningEffort(
    provider: string,
    model: string,
    requested: string | undefined,
  ): Promise<string | undefined> {
    const trimmed = requested?.trim()
    if (trimmed === undefined || trimmed.length === 0) return undefined
    const llm = this.ctx.get('llm')
    if (llm === undefined) return trimmed
    try {
      const info = await llm.resolveModelInfo(provider, model)
      if (info.reasoning === undefined) return undefined
      if (info.reasoning.efforts.some(effort => String(effort.id) === trimmed)) {
        return trimmed
      }
      return info.reasoning.defaultEffort === undefined
        ? undefined
        : String(info.reasoning.defaultEffort)
    } catch {
      return trimmed
    }
  }

  private async sanitizeSavedDefaultSelection(): Promise<void> {
    const defaults = this.ctx.get('agentDefaultModel')
    if (defaults === undefined) return
    const current = defaults.currentSelection()
    if (current.reasoningEffort === undefined) return
    const normalized = await this.normalizeReasoningEffort(
      current.provider,
      current.model,
      String(current.reasoningEffort),
    )
    if (normalized !== String(current.reasoningEffort)) {
      await defaults.saveSelection({
        provider: current.provider,
        model: current.model,
        ...(normalized === undefined ? {} : { reasoningEffort: ReasoningEffortId(normalized) }),
      })
    }
  }

  /**
   * Update runtime Aras bridge preferences (approval mode and default workspace path).
   * @param input - updated preferences.
   */
  async updatePreferences(input: {
    readonly approvalMode?: ArasApprovalMode
    readonly defaultCwd?: string
  }): Promise<void> {
    if (input.approvalMode !== undefined) {
      if (input.approvalMode !== 'ask' && input.approvalMode !== 'auto-allow' && input.approvalMode !== 'never') {
        throw new Error('حالت تایید ابزار نامعتبر است.')
      }
      this.approvalMode = input.approvalMode
    }
    if (input.defaultCwd !== undefined && input.defaultCwd.trim().length > 0) {
      const nextCwd = resolve(input.defaultCwd.trim())
      await mkdir(nextCwd, { recursive: true })
      this.defaultCwd = nextCwd
    }
  }

  /**
   * Tear down listeners, abort pending interactive waits, and dispose bridge-owned Agent handles.
   */
  async dispose(): Promise<void> {
    this.lifetime.abort()
    for (const off of this.disposers.splice(0)) off()
    this.subscribers.clear()
    this.pendingApprovals.clear()
    this.pendingQuestions.clear()
    const handles = [...this.ownedHandles.values()]
    this.ownedHandles.clear()
    await Promise.allSettled(handles.map(handle => handle.dispose()))
  }

  private broadcast(event: ArasStreamEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event)
      } catch (error) {
        this.ctx.logger.warn(`aras-ui SSE subscriber error: ${String(error)}`)
      }
    }
  }

  private resolveRootSessionId(agent: Agent): string | undefined {
    let current: Session | undefined = agent.session
    let guard = 0
    while (current !== undefined && current.header.origin === 'subagent' && guard < 16) {
      const parentId = current.header.parentSession
      if (parentId === undefined) return undefined
      current = this.ctx.sessions.get(parentId)
      guard += 1
    }
    if (current === undefined || current.header.origin === 'subagent') return undefined
    const id = String(current.id)
    return this.ownedHandles.has(id) || this.ctx.agents.get(current.id) !== undefined ? id : undefined
  }

  private recordSessionAttachments(event: SessionEvent): void {
    if (event.type !== 'user/message') return
    // Session id is captured when indexing a full session or on prompt admission.
    for (const block of event.data.content) {
      if (block.type === 'image') {
        // Also index under wildcard fallback if needed.
        this.attachmentRefs.set(`*:${String(block.attachment.attachmentId)}`, block.attachment)
      }
    }
  }

  private indexAllSessionAttachments(session: Session): void {
    const sid = String(session.id)
    for (const event of session.snapshotEvents()) {
      if (event.type === 'user/message') {
        for (const block of event.data.content) {
          if (block.type === 'image') {
            this.attachmentRefs.set(`${sid}:${String(block.attachment.attachmentId)}`, block.attachment)
          }
        }
      }
    }
  }

  private summarizeLiveSession(session: Session): ArasSessionSummary {
    const id = String(session.id)
    const events = session.snapshotEvents()
    const derived = this.customTitles.get(id) ?? deriveTitleFromEvents(events)
    if (derived !== undefined && !this.customTitles.has(id)) {
      this.customTitles.set(id, derived)
    }
    const liveAgent = this.ctx.agents.get(session.id)
    return {
      id,
      title: derived ?? 'گفتگوی جدید',
      createdAt: session.header.createdAt,
      cwd: session.header.cwd ?? this.defaultCwd,
      status: liveAgent?.status ?? 'idle',
    }
  }

  private detailForAgent(agent: Agent): ArasSessionDetail {
    const session = agent.session
    const sessionId = String(session.id)
    this.indexAllSessionAttachments(session)
    const summary = this.summarizeLiveSession(session)
    const items = buildArasTranscript(sessionId, session.snapshotEvents())
    const activeStream = this.liveStreams.get(sessionId)
    const liveStream: ArasLiveStreamState | null = activeStream === undefined
      ? null
      : {
        attemptId: activeStream.attemptId,
        turn: activeStream.turn,
        step: activeStream.step,
        reasoning: activeStream.reasoning,
        text: activeStream.text,
        toolCalls: [...activeStream.toolCalls.values()],
      }

    const pendingApprovals = [...this.pendingApprovals.values()]
      .filter(entry => entry.view.sessionId === sessionId)
      .map(entry => entry.view)
    const pendingQuestions = [...this.pendingQuestions.values()]
      .filter(entry => entry.view.sessionId === sessionId)
      .map(entry => entry.view)

    const currentModel = agent.model.current() ?? this.currentDefaultSelection()
    return {
      session: summary,
      items,
      liveStream,
      pendingApprovals,
      pendingQuestions,
      modelSelection: {
        provider: currentModel.provider,
        model: currentModel.model,
        ...(currentModel.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: String(currentModel.reasoningEffort) }),
      },
    }
  }

  private async ensureLiveAgent(rawId: string): Promise<Agent> {
    const sessionId = brandString<SessionId>(rawId)
    const existing = this.ctx.agents.get(sessionId)
    if (existing !== undefined) {
      if (existing.session.header.origin === 'subagent') {
        throw new Error('این نشست متعلق به یک زیرعامل داخلی است.')
      }
      return existing
    }

    const presets = this.ctx.get('agentPresets')
    let presetId: string | undefined
    const sessionQuery = this.ctx.get('sessionQuery')
    if (sessionQuery !== undefined) {
      using obs = await sessionQuery.observeSession(sessionId)
      if (obs.header.origin === 'subagent') {
        throw new Error('این نشست متعلق به یک زیرعامل داخلی است.')
      }
      presetId = obs.header.agentPreset
    }
    const resolvedPreset = presets === undefined ? undefined : (await presets.resolve(presetId)).id
    await this.sanitizeSavedDefaultSelection()

    const handle = await this.ctx.agents.resume({
      resumeSessionId: sessionId,
      agentOptions: this.defaultAgentOptions(),
      setup: async (agentCtx) => {
        installModelSelection(agentCtx)
        if (presets !== undefined && resolvedPreset !== undefined) {
          await presets.mount(agentCtx, resolvedPreset)
        }
      },
    })
    this.ownedHandles.set(rawId, handle)
    return handle.agent
  }

  private currentDefaultSelection(): { provider: string; model: string; reasoningEffort?: string } {
    const defaults = this.ctx.get('agentDefaultModel')
    if (defaults !== undefined) {
      const sel = defaults.currentSelection()
      return {
        provider: sel.provider,
        model: sel.model,
        ...(sel.reasoningEffort === undefined ? {} : { reasoningEffort: String(sel.reasoningEffort) }),
      }
    }
    return { provider: 'deepseek-official', model: 'deepseek-flash' }
  }

  private defaultAgentOptions(): AgentOptions {
    const self = this
    return {
      get provider() { return self.currentDefaultSelection().provider },
      get model() { return self.currentDefaultSelection().model },
      get reasoningEffort() {
        const eff = self.currentDefaultSelection().reasoningEffort
        return eff === undefined ? undefined : ReasoningEffortId(eff)
      },
    }
  }

  private async buildLiveCatalog(): Promise<{
    groups: ArasProviderCatalogGroup[]
    failures: { id: string; name: string; message: string }[]
  }> {
    const llm = this.ctx.get('llm')
    if (llm === undefined) return { groups: [], failures: [] }

    const providers = llm.listProviders()
    const groups: ArasProviderCatalogGroup[] = []
    const failures: { id: string; name: string; message: string }[] = []

    for (const provider of providers) {
      try {
        const models = await llm.listModels(provider.id)
        const entries: ArasModelEntry[] = []
        for (const model of models) {
          const resolved = await llm.resolveModelInfo(provider.id, model.id)
          entries.push({
            id: model.id,
            name: model.name,
            ...(model.description === undefined ? {} : { description: model.description }),
            reasoningEfforts: resolved.reasoning?.efforts.map(eff => ({ id: String(eff.id), name: eff.name })) ?? [],
            ...(resolved.reasoning?.defaultEffort === undefined
              ? {}
              : { defaultEffort: String(resolved.reasoning.defaultEffort) }),
          })
        }
        if (entries.length > 0) {
          groups.push({ id: provider.id, name: provider.name, models: entries })
        }
      } catch (error) {
        failures.push({
          id: provider.id,
          name: provider.name,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (!groups.some(group => group.id === 'deepseek-official')) {
      groups.unshift({
        id: 'deepseek-official',
        name: 'DeepSeek Official (نیازمند DEEPSEEK_API_KEY)',
        models: [
          {
            id: 'deepseek-flash',
            name: 'DeepSeek Flash',
            reasoningEfforts: [],
          },
          {
            id: 'deepseek-chat',
            name: 'DeepSeek V3 Chat',
            reasoningEfforts: [],
          },
          {
            id: 'deepseek-reasoner',
            name: 'DeepSeek R1 Reasoner',
            reasoningEfforts: [
              { id: 'low', name: 'Low' },
              { id: 'medium', name: 'Medium' },
              { id: 'high', name: 'High' },
            ],
            defaultEffort: 'medium',
          },
        ],
      })
    }

    return { groups, failures }
  }
}
