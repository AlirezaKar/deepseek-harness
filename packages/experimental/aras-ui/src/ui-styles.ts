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
  color-scheme: dark;
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
  color-scheme: light;
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
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.26) transparent;
}

*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.26);
  border-radius: 999px;
}

*::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.45);
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

/* ── Chat Sub-header (3-column RTL Grid: PDF Right | Title Center | Model Left) ─ */
.aras-chat-subheader {
  min-height: 54px;
  border-bottom: 1px solid var(--border-subtle);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
}

.aras-subheader-side {
  min-width: 0;
  display: flex;
  align-items: center;
}

.aras-subheader-right {
  justify-content: flex-start;
  gap: 8px;
}

.aras-subheader-left {
  justify-content: flex-end;
}

.aras-subheader-delete-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: transparent;
  color: var(--danger);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.aras-subheader-delete-btn:hover,
.aras-subheader-delete-btn.confirming {
  background: var(--danger-soft);
  border-color: var(--danger);
}

.aras-chat-subheader-title {
  min-width: 0;
  max-width: 100%;
  justify-self: center;
  text-align: center;
  font-size: 15.5px;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  unicode-bidi: plaintext;
}

.aras-subheader-model-pill {
  display: block;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11.5px;
  cursor: pointer;
  direction: ltr;
  text-align: left;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.aras-subheader-model-pill:hover {
  border-color: var(--accent-border);
  color: var(--text-primary);
}

.aras-pdf-btn {
  flex-shrink: 0;
  white-space: nowrap;
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
.aras-transcript,
.aras-settled-list,
.aras-live-slot,
.aras-interactive-slot {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
}

.aras-settled-list:empty,
.aras-live-slot:empty,
.aras-interactive-slot:empty {
  display: none;
}

.aras-settled-entry {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.aras-msg-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.aras-msg-user-wrap {
  align-self: flex-start;
  max-width: 82%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.aras-msg-user {
  max-width: 100%;
  background: var(--user-bubble);
  border: 1px solid var(--user-bubble-border);
  padding: 12px 16px;
  border-radius: 16px 16px 4px 16px;
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.aras-msg-user-text {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  line-height: 1.82;
  font-size: 14px;
  unicode-bidi: plaintext;
  text-align: start;
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
  padding: 16px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 13px;
  box-shadow: var(--shadow-sm);
}

.aras-msg-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 9px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 12px;
  color: var(--text-secondary);
}

.aras-msg-author {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 700;
  color: var(--text-primary);
}

.aras-msg-author-badge {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.aras-msg-meta-model {
  direction: ltr;
  unicode-bidi: isolate;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
}

.aras-msg-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border-subtle);
}

.aras-msg-user-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.72;
  transition: opacity 0.15s ease;
}

.aras-msg-user-wrap:hover .aras-msg-user-actions {
  opacity: 1;
}

.aras-copy-msg-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.aras-copy-msg-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent-border);
}

.aras-copy-msg-btn.copied,
.aras-code-copy-btn.copied {
  color: var(--success) !important;
  border-color: rgba(52, 211, 153, 0.45) !important;
  background: var(--success-soft) !important;
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
  border-inline-start: 3px solid var(--accent);
  background: rgba(30, 102, 245, 0.055);
}

[data-theme="light"] .aras-collapse-card.reasoning {
  background: rgba(30, 102, 245, 0.045);
}

.aras-collapse-card.tool-running {
  border-inline-start: 3px solid var(--warning);
}

.aras-collapse-card.tool-completed {
  border-inline-start: 3px solid var(--success);
}

.aras-collapse-card.tool-error {
  border-inline-start: 3px solid var(--danger);
}

.aras-collapse-header {
  width: 100%;
  border: none;
  background: transparent;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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
  min-width: 0;
}

.aras-reasoning-header-main {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1;
}

.aras-thinking-icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.aras-thinking-icon.active {
  animation: arasPulse 1.25s infinite ease-in-out;
}

.aras-reasoning-preview {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  unicode-bidi: plaintext;
}

.aras-collapse-card.open .aras-reasoning-preview {
  display: none;
}

.aras-reasoning-meta-chips {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.aras-reasoning-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  white-space: nowrap;
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
  line-height: 1.78;
  unicode-bidi: plaintext;
  text-align: start;
}

.aras-reasoning-scroll {
  max-height: 300px;
  overflow-y: auto;
  padding-inline-end: 4px;
}

.aras-reasoning-md {
  font-size: 13px;
  line-height: 1.78;
  color: var(--text-secondary);
}

.aras-reasoning-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6px;
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

/* Markdown body (GFM Tables, Code Blocks, Blockquotes, Lists, Bidirectional Typography) */
.aras-md {
  color: var(--text-primary);
  font-size: 14.2px;
  line-height: 1.88;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.aras-md > *:first-child {
  margin-top: 0;
}

.aras-md > *:last-child {
  margin-bottom: 0;
}

.aras-md p {
  margin: 0 0 11px;
  unicode-bidi: plaintext;
  text-align: start;
}

.aras-md h1,
.aras-md h2,
.aras-md h3,
.aras-md h4,
.aras-md h5,
.aras-md h6 {
  margin: 16px 0 8px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--text-primary);
  unicode-bidi: plaintext;
  text-align: start;
}

.aras-md h1 { font-size: 1.36em; border-bottom: 1px solid var(--border-subtle); padding-bottom: 6px; }
.aras-md h2 { font-size: 1.22em; border-bottom: 1px solid var(--border-subtle); padding-bottom: 5px; }
.aras-md h3 { font-size: 1.11em; }
.aras-md h4 { font-size: 1.03em; }
.aras-md h5, .aras-md h6 { font-size: 0.96em; color: var(--text-secondary); }

.aras-md ul,
.aras-md ol {
  padding-inline-start: 24px;
  padding-inline-end: 0;
  margin: 0 0 12px;
}

.aras-md li {
  margin-bottom: 5px;
  unicode-bidi: plaintext;
  text-align: start;
}

.aras-md li:last-child {
  margin-bottom: 0;
}

.aras-md li.aras-task-item {
  list-style: none;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-inline-start: -18px;
}

.aras-md li.aras-task-item input[type="checkbox"] {
  margin-top: 5px;
  accent-color: var(--accent);
}

.aras-md blockquote {
  margin: 12px 0;
  padding: 10px 14px;
  border-inline-start: 3px solid var(--accent);
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--text-secondary);
  unicode-bidi: plaintext;
  text-align: start;
}

.aras-md blockquote p:last-child {
  margin-bottom: 0;
}

.aras-md hr.aras-hr {
  border: none;
  border-top: 1px solid var(--border-strong);
  margin: 16px 0;
}

.aras-md a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  unicode-bidi: isolate;
}

.aras-md a:hover {
  color: var(--accent-hover);
}

.aras-md del {
  color: var(--text-muted);
  text-decoration: line-through;
}

.aras-md code.inline {
  direction: ltr;
  unicode-bidi: isolate;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
}

.aras-code-block {
  direction: ltr;
  text-align: left;
  margin: 12px 0;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--code-bg);
  overflow: hidden;
}

.aras-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11.5px;
  color: #94a3b8;
}

.aras-code-lang {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-transform: lowercase;
}

.aras-code-copy-btn {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: #cbd5e1;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.aras-code-copy-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.aras-code-block .aras-code-pre {
  margin: 0;
  border-radius: 0;
  max-height: 440px;
}

.aras-md pre {
  margin: 10px 0;
}

.aras-table-wrap {
  width: 100%;
  overflow-x: auto;
  margin: 12px 0;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--bg-card);
}

.aras-md table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
  line-height: 1.65;
}

.aras-md thead th {
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-weight: 700;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-strong);
  border-left: 1px solid var(--border-subtle);
  text-align: start;
  unicode-bidi: plaintext;
  white-space: nowrap;
}

.aras-md thead th:last-child,
.aras-md tbody td:last-child {
  border-left: none;
}

.aras-md tbody td {
  padding: 9px 14px;
  border-bottom: 1px solid var(--border-subtle);
  border-left: 1px solid var(--border-subtle);
  color: var(--text-primary);
  vertical-align: top;
  unicode-bidi: plaintext;
  text-align: start;
}

.aras-md tbody tr:last-child td {
  border-bottom: none;
}

.aras-md tbody tr:nth-child(even) td {
  background: rgba(255, 255, 255, 0.024);
}

[data-theme="light"] .aras-md tbody tr:nth-child(even) td {
  background: rgba(15, 23, 42, 0.025);
}

.aras-md tbody tr:hover td {
  background: var(--bg-hover);
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
  unicode-bidi: plaintext;
  text-align: start;
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
  gap: 12px;
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

.aras-session-item-info {
  min-width: 0;
  flex: 1;
}

.aras-session-item-title {
  font-weight: 700;
  unicode-bidi: plaintext;
  text-align: start;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aras-session-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.aras-session-delete-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.aras-session-delete-btn:hover {
  background: var(--danger-soft);
  border-color: rgba(248, 113, 113, 0.45);
  color: var(--danger);
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
  .aras-chat-subheader {
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 140px);
    gap: 8px;
  }
}

@media print {
  .aras-topbar,
  .aras-sidebar,
  .aras-composer-wrap,
  .aras-pdf-btn,
  .aras-subheader-delete-btn,
  .aras-subheader-model-pill,
  .aras-msg-actions,
  .aras-msg-user-actions,
  .aras-reasoning-toolbar,
  .aras-code-copy-btn {
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
  .aras-table-wrap,
  .aras-md thead th,
  .aras-md tbody td {
    border-color: #cbd5e1 !important;
    color: #000000 !important;
  }
  .aras-md thead th {
    background: #f1f5f9 !important;
  }
}
`
