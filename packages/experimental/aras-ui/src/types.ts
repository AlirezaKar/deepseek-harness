/**
 * Wire and projection types for the Aras Smart Assistant Web UI and Host bridge.
 *
 * @module @deepseek-ai/dsh-aras-ui/types
 */

import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions'

/** Policy applied by the Aras bridge when a tool requests human approval. */
export type ArasApprovalMode = 'ask' | 'auto-allow' | 'never'

/** Outbound HTTP/HTTPS network routing mode for LLM provider traffic. */
export type ArasNetworkMode = 'auto' | 'direct' | 'custom'

/** Live outbound network & proxy status surfaced in Aras Settings (`تنظیمات سامانه`). */
export interface ArasNetworkStatus {
  readonly mode: ArasNetworkMode
  readonly customProxyUrl: string
  readonly noProxy: string
  readonly effectiveProxyUrl: string | null
  readonly effectiveSource: 'none' | 'env' | 'windows-registry' | 'custom'
  readonly windowsSystemProxy?: string
  readonly warning?: string
}

/** Result of an on-demand outbound connectivity test from the Aras backend. */
export interface ArasNetworkTestResult {
  readonly reachable: boolean
  readonly targetUrl: string
  readonly status: number | null
  readonly latencyMs: number
  readonly effectiveProxyUrl: string | null
  readonly summary: string
}

/** Summary of one persisted or live conversation session. */
export interface ArasSessionSummary {
  readonly id: string
  readonly title: string
  readonly createdAt: number
  readonly cwd: string
  readonly status: 'idle' | 'running'
}

/** Image reference attached to a user message in the Aras transcript. */
export interface ArasImageAttachmentView {
  readonly id: string
  readonly mediaType: string
  readonly width: number
  readonly height: number
  readonly name?: string
  readonly url: string
}

/** One tool invocation and its optional result inside an assistant step. */
export interface ArasToolCallView {
  readonly callId: string
  readonly name: string
  readonly argumentsText: string
  readonly status: 'running' | 'completed' | 'error'
  readonly resultText?: string
  readonly errorReason?: string
}

/** Normalized transcript item rendered in the Aras conversation view. */
export type ArasTranscriptItem =
  | {
    readonly kind: 'user'
    readonly id: string
    readonly seq: number
    readonly text: string
    readonly images: readonly ArasImageAttachmentView[]
  }
  | {
    readonly kind: 'assistant'
    readonly id: string
    readonly seq: number
    readonly turn: number
    readonly step: number
    readonly provider: string
    readonly model: string
    readonly reasoning: string
    readonly text: string
    readonly interrupted: boolean
    readonly tools: readonly ArasToolCallView[]
  }
  | {
    readonly kind: 'error'
    readonly id: string
    readonly message: string
  }

/** Active streaming assistant attempt snapshot for mid-stream page loads. */
export interface ArasLiveStreamState {
  readonly attemptId: string
  readonly turn: number
  readonly step: number
  readonly reasoning: string
  readonly text: string
  readonly toolCalls: readonly {
    readonly id: string
    readonly name: string
    readonly argumentsText: string
  }[]
}

/** Pending interactive tool-permission request awaiting user action. */
export interface ArasPendingApproval {
  readonly requestId: string
  readonly sessionId: string
  readonly toolName: string
  readonly callId?: string
  readonly reason?: string
  readonly createdAt: number
}

/** Pending clarifying-question request (`ask_user_question`) awaiting user answers. */
export interface ArasPendingQuestion {
  readonly requestId: string
  readonly sessionId: string
  readonly questions: readonly AskUserQuestionItem[]
  readonly createdAt: number
}

/** Complete state returned when opening or resuming one Aras conversation session. */
export interface ArasSessionDetail {
  readonly session: ArasSessionSummary
  readonly items: readonly ArasTranscriptItem[]
  readonly liveStream: ArasLiveStreamState | null
  readonly pendingApprovals: readonly ArasPendingApproval[]
  readonly pendingQuestions: readonly ArasPendingQuestion[]
  readonly modelSelection: {
    readonly provider: string
    readonly model: string
    readonly reasoningEffort?: string
  }
}

/** Redacted status of one credential environment key in `$DSH_HOME/.credentials.yaml` or env. */
export interface ArasCredentialStatus {
  readonly ref: string
  readonly label: string
  readonly configured: boolean
  readonly source?: string
  readonly writable: boolean
}

/** Model entry in the settings and picker catalog. */
export interface ArasModelEntry {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly reasoningEfforts: readonly { readonly id: string; readonly name: string }[]
  readonly defaultEffort?: string
}

/** Provider group in the live LLM catalog. */
export interface ArasProviderCatalogGroup {
  readonly id: string
  readonly name: string
  readonly models: readonly ArasModelEntry[]
}

/**
 * Wire protocols a hand-declared route may speak, mirroring
 * `supportedProtocols()` in `@deepseek-ai/dsh-llm-pi-ai`. A route the installed
 * catalog does not describe must name one of these.
 */
export const ARAS_SUPPORTED_PROTOCOLS = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
] as const

/** One wire protocol a configured route can speak. */
export type ArasProviderProtocol = typeof ARAS_SUPPORTED_PROTOCOLS[number]

/** A model listed on a hand-declared provider route. */
export interface ArasProviderModelEntry {
  readonly id: string
  readonly name?: string
  /** Context window in tokens; omitted uses the route default. */
  readonly contextWindow?: number
  /** Output cap in tokens; omitted uses the route default. */
  readonly maxTokens?: number
  /** Input modalities; omitted uses the route default. */
  readonly input?: readonly ('text' | 'image')[]
  /** Whether the model can call tools; omitted lets the protocol decide. */
  readonly tools?: boolean
  /** Whether the model accepts thinking/reasoning budgets. */
  readonly reasoning?: boolean
}

/**
 * Settings view of a provider route stored under `llm-pi-ai`. Any endpoint the
 * profile declares is served as-is: the route key does not have to name an
 * installed pi-ai provider, so arbitrary base URLs are configurable.
 */
export interface ArasCustomProviderProfile {
  readonly id: string
  readonly displayName: string
  /** Declared wire protocol, or `''` when the profile defers to the installed catalog. */
  readonly api: string
  /** Declared endpoint, or `''` when the profile defers to the installed catalog. */
  readonly baseURL: string
  readonly apiKeyEnv: string
  /** Models the profile lists explicitly; empty when it serves the installed catalog. */
  readonly models: readonly ArasProviderModelEntry[]
  /** Headers declared for this route (secrets already redacted). */
  readonly headers: Readonly<Record<string, string>>
  /** Route-level fallbacks applied to models the catalog does not size. */
  readonly defaultContextWindow?: number
  readonly defaultMaxTokens?: number
  readonly defaultInput?: readonly ('text' | 'image')[]
  /** True when the route names no installed pi-ai provider, so every field above must be declared. */
  readonly declared: boolean
  /** Whether the live LLM catalog currently serves at least one model for this route. */
  readonly serviceable: boolean
  /** Why the route is not serving models, when `serviceable` is false. */
  readonly problem?: string
}

/** Complete settings snapshot consumed by the Aras Settings (`تنظیمات سامانه`) view. */
export interface ArasSettingsSnapshot {
  readonly defaultModel: {
    readonly provider: string
    readonly model: string
    readonly reasoningEffort?: string
  }
  readonly catalog: readonly ArasProviderCatalogGroup[]
  readonly catalogFailures: readonly { readonly id: string; readonly name: string; readonly message: string }[]
  readonly credentials: readonly ArasCredentialStatus[]
  readonly deepseekConfig: {
    readonly baseURL: string
    readonly apiKeyEnv: string
    readonly reasoningEffort: string
  }
  readonly customProviders: readonly ArasCustomProviderProfile[]
  /** Wire protocols a hand-declared route may name, in the adapter's preference order. */
  readonly supportedProtocols: readonly string[]
  /** Model ids the installed catalog describes for each route, used to validate a hand-declared route. */
  readonly catalogRouteModels: Readonly<Record<string, readonly string[]>>
  readonly preferences: {
    readonly approvalMode: ArasApprovalMode
    readonly defaultCwd: string
  }
  readonly network: ArasNetworkStatus
  readonly settingsWritable: boolean
  readonly credentialsWritable: boolean
}

/** Server-Sent Event envelope pushed over `GET /aras-api/stream`. */
export type ArasStreamEvent =
  | { readonly type: 'ready'; readonly timestamp: number }
  | { readonly type: 'session.status'; readonly sessionId: string; readonly status: 'idle' | 'running' }
  | { readonly type: 'session.updated'; readonly session: ArasSessionSummary }
  | { readonly type: 'session.deleted'; readonly sessionId: string }
  | { readonly type: 'session.error'; readonly sessionId: string; readonly message: string }
  | {
    readonly type: 'stream.start'
    readonly sessionId: string
    readonly attemptId: string
    readonly turn: number
    readonly step: number
  }
  | {
    readonly type: 'stream.delta'
    readonly sessionId: string
    readonly attemptId: string
    readonly deltaKind: 'text' | 'reasoning' | 'tool-call'
    readonly text?: string
    readonly toolCallId?: string
    readonly toolName?: string
    readonly argumentsDelta?: string
  }
  | {
    readonly type: 'stream.end'
    readonly sessionId: string
    readonly attemptId: string
    readonly committed: boolean
  }
  | {
    readonly type: 'transcript.item'
    readonly sessionId: string
    readonly item: ArasTranscriptItem
  }
  | {
    readonly type: 'tool.call'
    readonly sessionId: string
    readonly turn: number
    readonly step: number
    readonly tool: ArasToolCallView
  }
  | {
    readonly type: 'tool.result'
    readonly sessionId: string
    readonly turn: number
    readonly step: number
    readonly callId: string
    readonly status: 'completed' | 'error'
    readonly resultText: string
    readonly errorReason?: string
  }
  | { readonly type: 'approval.requested'; readonly approval: ArasPendingApproval }
  | { readonly type: 'approval.resolved'; readonly requestId: string; readonly sessionId: string; readonly outcome: ApprovalOutcome }
  | { readonly type: 'question.requested'; readonly question: ArasPendingQuestion }
  | { readonly type: 'question.resolved'; readonly requestId: string; readonly sessionId: string }
