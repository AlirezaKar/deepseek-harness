/**
 * RTL Persian stylesheet for the Aras Smart Assistant (`دستیار هوشمند ارس`) Web UI,
 * including Dark, Light, and Auto themes, collapsible harness cards, settings forms,
 * and print-to-PDF layout rules.
 *
 * @module @deepseek-ai/dsh-aras-ui/ui-styles
 */

/** Complete CSS text injected into the Aras single-page shell. */
export const ARAS_UI_STYLES = /* css */ `
:root,
[data-theme="dark"] {
  --bg-header: #121722;
  --bg-sidebar: #141925;
  --bg-main: #171c26;
  --bg-elevated: #1d2432;
  --bg-card: #1b2230;
  --bg-input: #171c27;
  --bg-hover: rgba(255, 255, 255, 0.045);
  --border-subtle: rgba(255, 255, 255, 0.075);
  --border-strong: rgba(255, 255, 255, 0.15);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --accent: #68a4f6;
  --accent-hover: #5393ee;
  --accent-soft: rgba(104, 164, 246, 0.12);
  --accent-border: rgba(104, 164, 246, 0.48);
  --user-bubble: #23334d;
  --user-bubble-border: rgba(104, 164, 246, 0.28);
  --assistant-bubble: #1b2230;
  --send-idle: #5b6478;
  --success: #34d399;
  --success-soft: rgba(52, 211, 153, 0.12);
  --warning: #fbbf24;
  --warning-soft: rgba(251, 191, 36, 0.12);
  --danger: #f87171;
  --danger-soft: rgba(248, 113, 113, 0.12);
  --code-bg: #0f141e;
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.25);
}

[data-theme="light"] {
  --bg-header: #ffffff;
  --bg-sidebar: #f8fafc;
  --bg-main: #f1f5f9;
  --bg-elevated: #ffffff;
  --bg-card: #ffffff;
  --bg-input: #ffffff;
  --bg-hover: rgba(15, 23, 42, 0.05);
  --border-subtle: rgba(15, 23, 42, 0.09);
  --border-strong: rgba(15, 23, 42, 0.18);
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #64748b;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-soft: rgba(37, 99, 235, 0.1);
  --accent-border: rgba(37, 99, 235, 0.4);
  --user-bubble: #dbeafe;
  --user-bubble-border: rgba(37, 99, 235, 0.25);
  --assistant-bubble: #ffffff;
  --send-idle: #94a3b8;
  --success: #059669;
  --success-soft: rgba(5, 150, 105, 0.1);
  --warning: #d97706;
  --warning-soft: rgba(217, 119, 6, 0.1);
  --danger: #dc2626;
  --danger-soft: rgba(220, 38, 38, 0.1);
  --code-bg: #0f172a;
  --shadow-sm: 0 2px 10px rgba(15, 23, 42, 0.06);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--bg-main);
  color: var(--text-primary);
  font-family: "Vazirmatn", "IRANSansX", "IRANSans", "Segoe UI", Tahoma, sans-serif;
  font-size: 14px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

button, input, textarea, select {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}

/* ── Top Header Bar ──────────────────────────────────────────────────────── */
.aras-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

.aras-topbar {
  height: 58px;
  min-height: 58px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  position: relative;
  z-index: 30;
}

.aras-menu-btn {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.aras-menu-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.aras-topbar-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  white-space: nowrap;
  pointer-events: none;
}

.aras-brand-logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

/* ── Workspace Body (RTL: Sidebar on Right, Main Canvas on Left) ────────── */
.aras-body {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

.aras-sidebar {
  width: 256px;
  min-width: 256px;
  background: var(--bg-sidebar);
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  transition: margin-right 0.22s ease, opacity 0.2s ease;
  z-index: 20;
}

.aras-sidebar.collapsed {
  margin-right: -256px;
  opacity: 0;
  pointer-events: none;
}

.aras-nav {
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
  flex: 1;
}

.aras-nav-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-primary);
  padding: 10px 14px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 11px;
  cursor: pointer;
  text-align: right;
  font-size: 13.5px;
  font-weight: 500;
  transition: background 0.15s ease, color 0.15s ease;
}

.aras-nav-item svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.88;
}

.aras-nav-item:hover {
  background: var(--bg-hover);
}

.aras-nav-item.active {
  background: var(--accent);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(104, 164, 246, 0.25);
}

.aras-nav-item.active svg {
  opacity: 1;
}

.aras-nav-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 12px 6px;
}

.aras-sidebar-footer {
  padding: 12px 14px;
  border-top: 1px solid var(--border-subtle);
}

.aras-theme-switch {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 4px;
  border-radius: 11px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-header);
}

.aras-theme-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.aras-theme-btn:hover {
  color: var(--text-primary);
}

.aras-theme-btn.active {
  background: var(--accent);
  color: #ffffff;
  font-weight: 600;
}

/* ── Main Content Region ─────────────────────────────────────────────────── */
.aras-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-main);
  position: relative;
}

.aras-view {
  display: none;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.aras-view.active {
  display: flex;
}

.aras-chat-column {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 20px;
}

/* ── Chat Sub-header ─────────────────────────────────────────────────────── */
.aras-chat-subheader {
  min-height: 54px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  padding: 10px 4px;
}

.aras-chat-subheader-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 15.5px;
  font-weight: 700;
  color: var(--text-primary);
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aras-subheader-actions-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.aras-subheader-model-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11.5px;
  cursor: pointer;
  direction: ltr;
}

.aras-subheader-model-pill:hover {
  border-color: var(--accent-border);
  color: var(--text-primary);
}

.aras-pdf-btn {
  padding: 5px 14px;
  border-radius: 8px;
  border: 1px solid var(--accent-border);
  background: transparent;
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.aras-pdf-btn:hover {
  background: var(--accent-soft);
}

/* ── Welcome Empty Hero ──────────────────────────────────────────────────── */
.aras-chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0;
  display: flex;
  flex-direction: column;
}

.aras-welcome-hero {
  margin: auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
  max-width: 640px;
}

.aras-welcome-hero.hidden {
  display: none;
}

.aras-welcome-title {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.aras-welcome-subtitle {
  font-size: 13.5px;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.aras-mode-bar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: rgba(15, 20, 30, 0.35);
}

[data-theme="light"] .aras-mode-bar {
  background: #e2e8f0;
}

.aras-mode-pill {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 7px 22px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s ease, color 0.15s ease;
}

.aras-mode-pill.active {
  background: var(--accent);
  color: #ffffff;
  font-weight: 600;
  cursor: default;
}

.aras-mode-pill.disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

/* ── Transcript Messages & Rich Harness Blocks ───────────────────────────── */
.aras-transcript {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
}

.aras-msg-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: arasFadeIn 0.16s ease-out;
}

@keyframes arasFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.aras-msg-user {
  align-self: flex-start;
  max-width: 82%;
  background: var(--user-bubble);
  border: 1px solid var(--user-bubble-border);
  padding: 12px 16px;
  border-radius: 16px 16px 4px 16px;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.aras-msg-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.aras-msg-images img {
  max-width: 220px;
  max-height: 180px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  object-fit: cover;
}

.aras-msg-assistant {
  align-self: stretch;
  background: var(--assistant-bubble);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
}

.aras-msg-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--text-muted);
}

.aras-msg-meta-model {
  direction: ltr;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* Collapsible Reasoning & Tool Cards */
.aras-collapse-card {
  border: 1px solid var(--border-subtle);
  border-radius: 11px;
  background: rgba(15, 20, 30, 0.28);
  overflow: hidden;
}

[data-theme="light"] .aras-collapse-card {
  background: #f8fafc;
}

.aras-collapse-card.reasoning {
  border-right: 3px solid var(--accent);
}

.aras-collapse-card.tool-running {
  border-right: 3px solid var(--warning);
}

.aras-collapse-card.tool-completed {
  border-right: 3px solid var(--success);
}

.aras-collapse-card.tool-error {
  border-right: 3px solid var(--danger);
}

.aras-collapse-header {
  width: 100%;
  border: none;
  background: transparent;
  padding: 9px 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text-secondary);
  text-align: right;
}

.aras-collapse-header:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.aras-collapse-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.aras-tool-name-code {
  direction: ltr;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  padding: 1px 7px;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  font-size: 11.5px;
}

.aras-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.aras-badge.running {
  background: var(--warning-soft);
  color: var(--warning);
}

.aras-badge.completed {
  background: var(--success-soft);
  color: var(--success);
}

.aras-badge.error {
  background: var(--danger-soft);
  color: var(--danger);
}

.aras-collapse-body {
  display: none;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12.5px;
  color: var(--text-secondary);
}

.aras-collapse-card.open > .aras-collapse-body {
  display: block;
}

.aras-collapse-chevron {
  transition: transform 0.15s ease;
}

.aras-collapse-card.open .aras-collapse-chevron {
  transform: rotate(180deg);
}

.aras-reasoning-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
}

.aras-tool-io-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 4px;
  margin-top: 8px;
}

.aras-tool-io-label:first-child {
  margin-top: 0;
}

.aras-code-pre {
  direction: ltr;
  text-align: left;
  background: var(--code-bg);
  color: #e2e8f0;
  padding: 10px 12px;
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  overflow-x: auto;
  max-height: 280px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Markdown body */
.aras-md {
  color: var(--text-primary);
  line-height: 1.8;
  word-break: break-word;
}

.aras-md p {
  margin-bottom: 10px;
}

.aras-md p:last-child {
  margin-bottom: 0;
}

.aras-md h1, .aras-md h2, .aras-md h3, .aras-md h4 {
  margin: 14px 0 8px;
  font-weight: 700;
}

.aras-md ul, .aras-md ol {
  padding-right: 22px;
  margin-bottom: 10px;
}

.aras-md code.inline {
  direction: ltr;
  unicode-bidi: embed;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
}

.aras-md pre {
  margin: 10px 0;
}

/* Interactive Approval & Question Cards */
.aras-interactive-card {
  border-radius: 14px;
  padding: 16px 18px;
  background: var(--bg-card);
  border: 1px solid var(--warning);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aras-interactive-card.question {
  border-color: var(--accent);
}

.aras-interactive-title {
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}

.aras-interactive-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.aras-btn {
  padding: 7px 16px;
  border-radius: 9px;
  border: 1px solid var(--border-strong);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.aras-btn:hover {
  background: var(--bg-hover);
}

.aras-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #ffffff;
}

.aras-btn.primary:hover {
  background: var(--accent-hover);
}

.aras-btn.danger {
  background: var(--danger-soft);
  border-color: rgba(248, 113, 113, 0.4);
  color: var(--danger);
}

.aras-question-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
}

.aras-question-opt {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
}

/* ── Bottom Composer Bar ─────────────────────────────────────────────────── */
.aras-composer-wrap {
  border-top: 1px solid var(--border-subtle);
  padding: 14px 0 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.aras-attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 12px;
}

.aras-attachment-strip:empty {
  display: none;
}

.aras-attachment-chip {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-strong);
}

.aras-attachment-chip img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.aras-attachment-remove {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.aras-composer-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--bg-input);
  padding: 6px 8px 6px 14px;
  transition: border-color 0.15s ease, border-radius 0.15s ease;
}

.aras-composer-pill:focus-within {
  border-color: var(--accent);
}

.aras-composer-pill.multiline {
  border-radius: 22px;
  align-items: flex-end;
}

.aras-send-btn {
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 50%;
  border: none;
  background: var(--send-idle);
  color: #e2e8f0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.aras-send-btn.ready {
  background: var(--accent);
  color: #ffffff;
}

.aras-send-btn.running {
  background: var(--danger);
  color: #ffffff;
}

.aras-composer-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  resize: none;
  max-height: 150px;
  min-height: 24px;
  line-height: 24px;
  padding: 4px 2px;
  text-align: right;
}

.aras-composer-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.8;
}

.aras-attach-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 20px;
  transition: background 0.15s ease, color 0.15s ease;
}

.aras-attach-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.aras-composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  font-size: 11.5px;
  color: var(--text-secondary);
  position: relative;
}

.aras-composer-hint {
  margin: 0 auto;
  text-align: center;
}

.aras-char-counter {
  position: absolute;
  left: 8px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

/* ── Settings & Secondary Pages ──────────────────────────────────────────── */
.aras-page-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px 48px;
}

.aras-page-container {
  max-width: 880px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.aras-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.aras-page-title {
  font-size: 20px;
  font-weight: 800;
}

.aras-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--shadow-sm);
}

.aras-card-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.aras-card-desc {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.aras-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.aras-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.aras-field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.aras-input, .aras-select {
  padding: 9px 12px;
  border-radius: 9px;
  border: 1px solid var(--border-strong);
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
}

.aras-input.ltr, .aras-select.ltr {
  direction: ltr;
  text-align: left;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
}

.aras-input:focus, .aras-select:focus {
  border-color: var(--accent);
}

.aras-cred-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
}

.aras-cred-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aras-cred-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.aras-session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  border-radius: 11px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.aras-session-item:hover {
  border-color: var(--accent-border);
  background: var(--bg-hover);
}

.aras-toast {
  position: fixed;
  bottom: 24px;
  left: 24px;
  padding: 10px 18px;
  border-radius: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  color: var(--text-primary);
  font-size: 13px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.aras-toast.visible {
  opacity: 1;
  transform: translateY(0);
}

.aras-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  display: inline-block;
  animation: arasPulse 1.2s infinite ease-in-out;
}

@keyframes arasPulse {
  0%, 100% { opacity: 0.35; transform: scale(0.88); }
  50% { opacity: 1; transform: scale(1.15); }
}

@media (max-width: 860px) {
  .aras-sidebar {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    box-shadow: -8px 0 28px rgba(0, 0, 0, 0.45);
  }
  .aras-composer-hint {
    display: none;
  }
}

@media print {
  .aras-topbar,
  .aras-sidebar,
  .aras-composer-wrap,
  .aras-pdf-btn,
  .aras-subheader-model-pill {
    display: none !important;
  }
  html, body, .aras-shell, .aras-body, .aras-main, .aras-view, .aras-chat-column, .aras-chat-scroll {
    height: auto !important;
    overflow: visible !important;
    background: #ffffff !important;
    color: #000000 !important;
  }
  .aras-msg-assistant, .aras-msg-user {
    border: 1px solid #cbd5e1 !important;
    background: #ffffff !important;
    color: #000000 !important;
    break-inside: avoid;
  }
}
`
