/**
 * Browser client runtime script for the Aras Smart Assistant (`دستیار هوشمند ارس`) Web UI.
 * Zero external CDN dependencies so offline, sandboxed, and proxied deployments work identically.
 *
 * @module @deepseek-ai/dsh-aras-ui/ui-script
 */

/** Self-contained client JavaScript injected into the Aras single-page shell. */
export const ARAS_UI_SCRIPT = `
(function () {
  'use strict';

  var MAX_CHARS = 10000;
  var PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  var state = {
    activeTab: 'new-chat',
    themeMode: localStorage.getItem('aras_theme') || 'auto',
    sidebarCollapsed: false,
    currentSessionId: null,
    currentSessionTitle: 'گفتگوی جدید',
    sessionStatus: 'idle',
    items: [],
    liveStream: null,
    userToggledReasoning: {},
    openCards: {},
    pendingApprovals: [],
    pendingQuestions: [],
    stagedImages: [],
    sessionsList: [],
    settings: null,
    sending: false
  };

  function toPersianNumber(num) {
    var formatted = Number(num || 0).toLocaleString('en-US');
    return formatted.replace(/[0-9]/g, function (d) {
      return PERSIAN_DIGITS[Number(d)];
    });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMarkdown(raw) {
    if (!raw) return '';
    var text = String(raw).replace(/\\r\\n/g, '\\n');
    var codeBlocks = [];
    text = text.replace(/\`\`\`([a-zA-Z0-9_-]*)\\n([\\s\\S]*?)\`\`\`/g, function (_m, lang, code) {
      var idx = codeBlocks.length;
      var header = lang ? '<div style="font-size:11px;color:#94a3b8;margin-bottom:6px;font-family:monospace;">' + escapeHtml(lang) + '</div>' : '';
      codeBlocks.push('<pre class="aras-code-pre">' + header + escapeHtml(code.replace(/\\n$/, '')) + '</pre>');
      return '@@ARAS_CODE_' + idx + '@@';
    });

    var lines = text.split('\\n');
    var htmlParts = [];
    var inList = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var codeMatch = /^@@ARAS_CODE_(\\d+)@@$/.exec(line.trim());
      if (codeMatch) {
        if (inList) { htmlParts.push('</ul>'); inList = false; }
        htmlParts.push(codeBlocks[Number(codeMatch[1])]);
        continue;
      }
      if (/^#{1,4}\\s+/.test(line)) {
        if (inList) { htmlParts.push('</ul>'); inList = false; }
        var level = line.match(/^#+/)[0].length;
        var headingText = formatInline(line.replace(/^#{1,4}\\s+/, ''));
        htmlParts.push('<h' + level + '>' + headingText + '</h' + level + '>');
        continue;
      }
      if (/^[-*]\\s+/.test(line)) {
        if (!inList) { htmlParts.push('<ul>'); inList = true; }
        htmlParts.push('<li>' + formatInline(line.replace(/^[-*]\\s+/, '')) + '</li>');
        continue;
      }
      if (line.trim() === '') {
        if (inList) { htmlParts.push('</ul>'); inList = false; }
        continue;
      }
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push('<p>' + formatInline(line) + '</p>');
    }
    if (inList) htmlParts.push('</ul>');

    var joined = htmlParts.join('');
    joined = joined.replace(/@@ARAS_CODE_(\\d+)@@/g, function (_m, n) {
      return codeBlocks[Number(n)] || '';
    });
    return joined;
  }

  function formatInline(str) {
    var s = escapeHtml(str);
    s = s.replace(/\`([^\`]+)\`/g, '<code class="inline">$1</code>');
    s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    s = s.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">$1</a>');
    return s;
  }

  function showToast(msg) {
    var el = document.getElementById('aras-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      el.classList.remove('visible');
    }, 3200);
  }

  async function apiFetch(path, options) {
    var opts = Object.assign({ headers: {} }, options || {});
    if (opts.body && typeof opts.body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    var res = await fetch(path, opts);
    var data = null;
    var ct = res.headers.get('content-type') || '';
    if (ct.indexOf('application/json') >= 0) {
      data = await res.json();
    } else {
      data = { message: await res.text() };
    }
    if (!res.ok) {
      throw new Error((data && data.error) || (data && data.message) || ('خطای سرور (' + res.status + ')'));
    }
    return data;
  }

  /* ── Theme Management ─────────────────────────────────────────────────── */
  function applyTheme(mode) {
    state.themeMode = mode;
    localStorage.setItem('aras_theme', mode);
    var resolved = mode;
    if (mode === 'auto') {
      var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      resolved = prefersLight ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    var buttons = document.querySelectorAll('[data-theme-btn]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.classList.toggle('active', btn.getAttribute('data-theme-btn') === mode);
    }
  }

  /* ── Navigation & Views ───────────────────────────────────────────────── */
  function switchTab(tabId) {
    if (tabId === 'new-chat') {
      startFreshChatView();
      return;
    }
    state.activeTab = tabId;
    syncNavigationUI();
    if (tabId === 'chats') {
      loadSessionsList();
    } else if (tabId === 'settings') {
      loadSettings();
    }
  }

  function syncNavigationUI() {
    var navBtns = document.querySelectorAll('[data-nav-tab]');
    for (var i = 0; i < navBtns.length; i++) {
      var b = navBtns[i];
      var target = b.getAttribute('data-nav-tab');
      var isActive = (state.activeTab === 'chat' && target === 'new-chat' && !state.currentSessionId) ||
        (state.activeTab === 'chat' && target === 'chats' && !!state.currentSessionId) ||
        (target === state.activeTab);
      b.classList.toggle('active', isActive);
    }

    var views = document.querySelectorAll('[data-view]');
    for (var j = 0; j < views.length; j++) {
      var v = views[j];
      var vName = v.getAttribute('data-view');
      var show = (vName === 'chat' && (state.activeTab === 'new-chat' || state.activeTab === 'chat')) ||
        (vName === state.activeTab);
      v.classList.toggle('active', show);
    }
  }

  function startFreshChatView() {
    state.activeTab = 'new-chat';
    state.currentSessionId = null;
    state.currentSessionTitle = 'گفتگوی جدید';
    state.sessionStatus = 'idle';
    state.items = [];
    state.liveStream = null;
    state.pendingApprovals = [];
    state.pendingQuestions = [];
    syncNavigationUI();
    renderChatSurface(true);
  }

  async function openExistingSession(sessionId) {
    try {
      var detail = await apiFetch('/aras-api/sessions/' + encodeURIComponent(sessionId));
      state.activeTab = 'chat';
      state.currentSessionId = detail.session.id;
      state.currentSessionTitle = detail.session.title || 'گفتگو';
      state.sessionStatus = detail.session.status || 'idle';
      state.items = detail.items || [];
      state.liveStream = detail.liveStream || null;
      state.pendingApprovals = detail.pendingApprovals || [];
      state.pendingQuestions = detail.pendingQuestions || [];
      updateModelBadge(detail.modelSelection);
      syncNavigationUI();
      renderChatSurface(true);
    } catch (err) {
      showToast(err.message || 'خطا در بارگذاری گفتگو');
    }
  }

  function updateModelBadge(sel) {
    var pill = document.getElementById('aras-active-model-pill');
    if (!pill || !sel) return;
    var label = sel.provider + ' / ' + sel.model + (sel.reasoningEffort ? ' (' + sel.reasoningEffort + ')' : '');
    pill.textContent = label;
  }

  /* ── Rendering Chat Surface ───────────────────────────────────────────── */
  function formatJsonPretty(raw) {
    if (!raw) return '{}';
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch (_e) {
      return raw;
    }
  }

  function renderToolCardHtml(tool, cardKey) {
    var isOpen = !!state.openCards[cardKey];
    var statusClass = tool.status === 'error' ? 'error' : (tool.status === 'completed' ? 'completed' : 'running');
    var statusLabel = tool.status === 'error' ? 'خطا' : (tool.status === 'completed' ? 'انجام شد' : 'در حال اجرا...');
    var html = '<div class="aras-collapse-card tool-' + statusClass + (isOpen ? ' open' : '') + '" data-card-key="' + escapeHtml(cardKey) + '">';
    html += '<button type="button" class="aras-collapse-header" data-toggle-card="' + escapeHtml(cardKey) + '">';
    html += '<span class="aras-collapse-title"><span>اجرای ابزار</span><span class="aras-tool-name-code">' + escapeHtml(tool.name || 'tool') + '</span></span>';
    html += '<span style="display:inline-flex;align-items:center;gap:8px;"><span class="aras-badge ' + statusClass + '">' + statusLabel + '</span><span class="aras-collapse-chevron">▾</span></span>';
    html += '</button>';
    html += '<div class="aras-collapse-body">';
    html += '<div class="aras-tool-io-label">ورودی ابزار (Arguments):</div>';
    html += '<pre class="aras-code-pre">' + escapeHtml(formatJsonPretty(tool.argumentsText)) + '</pre>';
    if (tool.resultText != null || tool.errorReason != null) {
      html += '<div class="aras-tool-io-label">خروجی ابزار (Result):</div>';
      var out = tool.errorReason ? (tool.errorReason + (tool.resultText ? '\\n' + tool.resultText : '')) : (tool.resultText || '(بدون خروجی متنی)');
      html += '<pre class="aras-code-pre">' + escapeHtml(out) + '</pre>';
    }
    html += '</div></div>';
    return html;
  }

  function renderReasoningCardHtml(reasoningText, cardKey, autoOpen) {
    if (!reasoningText || !reasoningText.trim()) return '';
    var toggled = state.userToggledReasoning[cardKey];
    var isOpen = toggled !== undefined ? toggled : !!autoOpen;
    var html = '<div class="aras-collapse-card reasoning' + (isOpen ? ' open' : '') + '" data-reasoning-key="' + escapeHtml(cardKey) + '">';
    html += '<button type="button" class="aras-collapse-header" data-toggle-reasoning="' + escapeHtml(cardKey) + '">';
    html += '<span class="aras-collapse-title">';
    if (autoOpen) html += '<span class="aras-pulse-dot"></span>';
    html += '<span>فرآیند تفکر و استدلال مدل</span></span>';
    html += '<span class="aras-collapse-chevron">▾</span>';
    html += '</button>';
    html += '<div class="aras-collapse-body"><div class="aras-reasoning-text">' + escapeHtml(reasoningText) + '</div></div>';
    html += '</div>';
    return html;
  }

  function renderApprovalCardHtml(app) {
    var html = '<div class="aras-interactive-card" data-approval-id="' + escapeHtml(app.requestId) + '">';
    html += '<div class="aras-interactive-title" style="color:var(--warning);">⚠️ درخواست مجوز اجرای ابزار</div>';
    html += '<div style="font-size:13px;color:var(--text-primary);">دستیار قصد اجرای ابزار <code class="aras-tool-name-code">' + escapeHtml(app.toolName) + '</code> را دارد.</div>';
    if (app.reason) {
      html += '<div style="font-size:12.5px;color:var(--text-secondary);">دلیل: ' + escapeHtml(app.reason) + '</div>';
    }
    html += '<div class="aras-interactive-actions">';
    html += '<button type="button" class="aras-btn primary" data-approval-action="allowed-once" data-req-id="' + escapeHtml(app.requestId) + '">تایید و اجرا (یک‌بار)</button>';
    html += '<button type="button" class="aras-btn danger" data-approval-action="rejected" data-req-id="' + escapeHtml(app.requestId) + '">رد درخواست</button>';
    html += '<button type="button" class="aras-btn" data-approval-action="cancelled" data-req-id="' + escapeHtml(app.requestId) + '">لغو</button>';
    html += '</div></div>';
    return html;
  }

  function renderQuestionCardHtml(qReq) {
    var html = '<form class="aras-interactive-card question" data-question-form="' + escapeHtml(qReq.requestId) + '">';
    html += '<div class="aras-interactive-title" style="color:var(--accent);">💬 سوال تکمیلی دستیار</div>';
    for (var i = 0; i < qReq.questions.length; i++) {
      var q = qReq.questions[i];
      var inputType = q.multiSelect ? 'checkbox' : 'radio';
      html += '<div class="aras-question-block" data-qid="' + escapeHtml(q.id) + '">';
      html += '<div style="font-weight:700;font-size:13.5px;">' + escapeHtml(q.question || q.header || q.id) + '</div>';
      if (q.detail) {
        html += '<pre class="aras-code-pre" style="margin:4px 0;">' + escapeHtml(q.detail) + '</pre>';
      }
      var opts = q.options || [];
      for (var j = 0; j < opts.length; j++) {
        var opt = opts[j];
        var optLabel = opt.label || opt.id || String(opt);
        html += '<label class="aras-question-opt">';
        html += '<input type="' + inputType + '" name="q_' + escapeHtml(qReq.requestId + '_' + q.id) + '" value="' + escapeHtml(optLabel) + '"' + (j === 0 && !q.multiSelect ? ' checked' : '') + ' />';
        html += '<span><strong>' + escapeHtml(optLabel) + '</strong>' + (opt.description ? ' — <span style="color:var(--text-secondary);">' + escapeHtml(opt.description) + '</span>' : '') + '</span>';
        html += '</label>';
      }
      html += '<input type="text" class="aras-input" name="custom_' + escapeHtml(q.id) + '" placeholder="توضیح دلخواه یا پاسخ سفارشی (اختیاری)..." />';
      html += '</div>';
    }
    html += '<div class="aras-interactive-actions">';
    html += '<button type="submit" class="aras-btn primary">ارسال پاسخ</button>';
    html += '<button type="button" class="aras-btn" data-question-cancel="' + escapeHtml(qReq.requestId) + '">انصراف</button>';
    html += '</div></form>';
    return html;
  }

  function renderChatSurface(scrollToBottom) {
    var titleEl = document.getElementById('aras-chat-title');
    if (titleEl) titleEl.textContent = state.currentSessionTitle || 'گفتگوی جدید';

    var hero = document.getElementById('aras-welcome-hero');
    var transcriptEl = document.getElementById('aras-transcript');
    var scrollContainer = document.getElementById('aras-chat-scroll');
    if (!hero || !transcriptEl || !scrollContainer) return;

    var hasActivity = state.items.length > 0 || !!state.liveStream || state.pendingApprovals.length > 0 || state.pendingQuestions.length > 0;
    hero.classList.toggle('hidden', hasActivity);

    var parts = [];
    for (var i = 0; i < state.items.length; i++) {
      var item = state.items[i];
      if (item.kind === 'user') {
        parts.push('<div class="aras-msg-row">');
        parts.push('<div class="aras-msg-user">');
        if (item.images && item.images.length > 0) {
          parts.push('<div class="aras-msg-images">');
          for (var im = 0; im < item.images.length; im++) {
            parts.push('<img src="' + escapeHtml(item.images[im].url) + '" alt="پیوست" />');
          }
          parts.push('</div>');
        }
        parts.push(escapeHtml(item.text));
        parts.push('</div></div>');
      } else if (item.kind === 'assistant') {
        parts.push('<div class="aras-msg-row"><div class="aras-msg-assistant">');
        parts.push('<div class="aras-msg-meta"><span>دستیار هوشمند ارس</span><span class="aras-msg-meta-model">' + escapeHtml((item.provider && item.model) ? (item.provider + '/' + item.model) : '') + '</span></div>');
        if (item.reasoning) {
          parts.push(renderReasoningCardHtml(item.reasoning, 'settled-' + item.id, false));
        }
        if (item.tools && item.tools.length > 0) {
          for (var t = 0; t < item.tools.length; t++) {
            parts.push(renderToolCardHtml(item.tools[t], 'tool-' + item.tools[t].callId));
          }
        }
        if (item.text) {
          parts.push('<div class="aras-md">' + renderMarkdown(item.text) + '</div>');
        }
        if (item.interrupted) {
          parts.push('<div style="font-size:12px;color:var(--warning);">⏹ پاسخ توسط کاربر متوقف شد.</div>');
        }
        parts.push('</div></div>');
      } else if (item.kind === 'error') {
        parts.push('<div class="aras-interactive-card" style="border-color:var(--danger);"><div class="aras-interactive-title" style="color:var(--danger);">خطا در اجرای درخواست</div><div style="font-size:13px;">' + escapeHtml(item.message) + '</div></div>');
      }
    }

    if (state.liveStream) {
      var ls = state.liveStream;
      parts.push('<div class="aras-msg-row"><div class="aras-msg-assistant">');
      parts.push('<div class="aras-msg-meta"><span style="display:inline-flex;align-items:center;gap:6px;"><span class="aras-pulse-dot"></span><span>در حال تولید پاسخ...</span></span><span>گام ' + toPersianNumber(ls.step + 1) + '</span></div>');
      if (ls.reasoning) {
        var autoExpandReasoning = !ls.text;
        parts.push(renderReasoningCardHtml(ls.reasoning, 'live-' + ls.attemptId, autoExpandReasoning));
      }
      if (ls.toolCalls && ls.toolCalls.length > 0) {
        for (var tc = 0; tc < ls.toolCalls.length; tc++) {
          var liveTool = ls.toolCalls[tc];
          parts.push(renderToolCardHtml({
            callId: liveTool.id,
            name: liveTool.name || 'tool',
            argumentsText: liveTool.argumentsText || '',
            status: 'running'
          }, 'tool-' + liveTool.id));
        }
      }
      if (ls.text) {
        parts.push('<div class="aras-md">' + renderMarkdown(ls.text) + '</div>');
      }
      parts.push('</div></div>');
    } else if (state.sessionStatus === 'running') {
      parts.push('<div class="aras-msg-row"><div class="aras-msg-assistant"><div style="display:inline-flex;align-items:center;gap:8px;color:var(--text-secondary);font-size:13px;"><span class="aras-pulse-dot"></span><span>ارکستریتور در حال پردازش است...</span></div></div></div>');
    }

    for (var a = 0; a < state.pendingApprovals.length; a++) {
      parts.push(renderApprovalCardHtml(state.pendingApprovals[a]));
    }
    for (var q = 0; q < state.pendingQuestions.length; q++) {
      parts.push(renderQuestionCardHtml(state.pendingQuestions[q]));
    }

    transcriptEl.innerHTML = parts.join('');
    syncComposerButtonState();

    if (scrollToBottom) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  /* ── Composer & Attachments ───────────────────────────────────────────── */
  function syncComposerButtonState() {
    var input = document.getElementById('aras-composer-input');
    var btn = document.getElementById('aras-send-btn');
    var counter = document.getElementById('aras-char-counter');
    var pill = document.getElementById('aras-composer-pill');
    if (!input || !btn || !counter || !pill) return;

    var len = input.value.length;
    counter.textContent = toPersianNumber(len) + ' / ' + toPersianNumber(MAX_CHARS) + ' کاراکتر';

    input.style.height = 'auto';
    var nextHeight = Math.min(150, Math.max(24, input.scrollHeight));
    input.style.height = nextHeight + 'px';
    pill.classList.toggle('multiline', nextHeight > 38);

    if (state.sessionStatus === 'running') {
      btn.className = 'aras-send-btn running';
      btn.title = 'توقف تولید پاسخ';
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
    } else {
      var hasContent = input.value.trim().length > 0 || state.stagedImages.length > 0;
      btn.className = 'aras-send-btn' + (hasContent ? ' ready' : '');
      btn.title = 'ارسال پیام';
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>';
    }
  }

  function renderAttachmentStrip() {
    var strip = document.getElementById('aras-attachment-strip');
    if (!strip) return;
    var html = '';
    for (var i = 0; i < state.stagedImages.length; i++) {
      var img = state.stagedImages[i];
      html += '<div class="aras-attachment-chip">';
      html += '<img src="data:' + escapeHtml(img.mediaType) + ';base64,' + escapeHtml(img.data) + '" alt="' + escapeHtml(img.name || 'image') + '" />';
      html += '<button type="button" class="aras-attachment-remove" data-remove-img="' + i + '">×</button>';
      html += '</div>';
    }
    strip.innerHTML = html;
    syncComposerButtonState();
  }

  async function handleSendOrStop() {
    if (state.sessionStatus === 'running' && state.currentSessionId) {
      try {
        await apiFetch('/aras-api/sessions/' + encodeURIComponent(state.currentSessionId) + '/cancel', { method: 'POST', body: {} });
        showToast('درخواست توقف ارسال شد.');
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    if (state.sending) return;
    var input = document.getElementById('aras-composer-input');
    if (!input) return;
    var text = input.value;
    if (!text.trim() && state.stagedImages.length === 0) return;
    if (text.length > MAX_CHARS) {
      showToast('متن پیام بیش از حد مجاز ۱۰,۰۰۰ کاراکتر است.');
      return;
    }

    state.sending = true;
    var imagesToSend = state.stagedImages.slice();
    input.value = '';
    state.stagedImages = [];
    renderAttachmentStrip();
    syncComposerButtonState();

    try {
      var targetId = state.currentSessionId || 'new';
      var res = await apiFetch('/aras-api/sessions/' + encodeURIComponent(targetId) + '/prompt', {
        method: 'POST',
        body: { text: text, images: imagesToSend }
      });
      if (!state.currentSessionId) {
        state.currentSessionId = res.sessionId;
        state.activeTab = 'chat';
        var detail = await apiFetch('/aras-api/sessions/' + encodeURIComponent(res.sessionId));
        state.currentSessionTitle = detail.session.title;
        state.sessionStatus = detail.session.status;
        state.items = detail.items || [];
        state.liveStream = detail.liveStream || null;
        syncNavigationUI();
        renderChatSurface(true);
      }
    } catch (err) {
      input.value = text;
      state.stagedImages = imagesToSend;
      renderAttachmentStrip();
      showToast(err.message || 'خطا در ارسال پیام');
    } finally {
      state.sending = false;
      syncComposerButtonState();
    }
  }

  /* ── Sessions History Page (گفتگوها) ──────────────────────────────────── */
  async function loadSessionsList() {
    var box = document.getElementById('aras-sessions-list');
    if (!box) return;
    try {
      var res = await apiFetch('/aras-api/sessions');
      state.sessionsList = res.sessions || [];
      if (state.sessionsList.length === 0) {
        box.innerHTML = '<div style="color:var(--text-secondary);padding:24px;text-align:center;">هنوز گفتگویی ثبت نشده است. از بخش «گفتگوی جدید» شروع کنید.</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < state.sessionsList.length; i++) {
        var s = state.sessionsList[i];
        var dateStr = new Date(s.createdAt).toLocaleString('fa-IR');
        html += '<div class="aras-session-item" data-open-session="' + escapeHtml(s.id) + '">';
        html += '<div><div style="font-weight:700;">' + escapeHtml(s.title) + '</div><div style="font-size:12px;color:var(--text-muted);">' + escapeHtml(dateStr) + ' • <span style="direction:ltr;unicode-bidi:embed;">' + escapeHtml(s.cwd) + '</span></div></div>';
        html += '<span class="aras-badge ' + (s.status === 'running' ? 'running' : 'completed') + '">' + (s.status === 'running' ? 'در حال اجرا' : 'آماده') + '</span>';
        html += '</div>';
      }
      box.innerHTML = html;
    } catch (err) {
      box.innerHTML = '<div style="color:var(--danger);">' + escapeHtml(err.message) + '</div>';
    }
  }

  /* ── Settings Page (تنظیمات سامانه) ───────────────────────────────────── */
  async function loadSettings() {
    var root = document.getElementById('aras-settings-content');
    if (!root) return;
    try {
      var snap = await apiFetch('/aras-api/settings');
      state.settings = snap;
      updateModelBadge(snap.defaultModel);
      renderSettingsContent(snap);
    } catch (err) {
      root.innerHTML = '<div class="aras-card" style="border-color:var(--danger);">' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderSettingsContent(snap) {
    var root = document.getElementById('aras-settings-content');
    if (!root) return;

    var html = '';

    /* 1. Active Model Selection Card */
    html += '<div class="aras-card">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">';
    html += '<div><div class="aras-card-title">انتخاب مدل هوش مصنوعی و سطح استدلال</div><div class="aras-card-desc">مدل پیش‌فرض ارکستریتور DeepSeek Harness برای گفتگوهای سامانه ارس را مشخص کنید.</div></div>';
    html += '<button type="button" class="aras-btn" id="aras-refresh-settings-btn">بروزرسانی فهرست مدل‌ها</button>';
    html += '</div>';

    if (snap.catalog && snap.catalog.length > 0) {
      html += '<div class="aras-form-grid">';
      html += '<div class="aras-field"><label>مدل‌های آماده استفاده (کشف‌شده از کلیدهای فعال)</label><select id="aras-catalog-select" class="aras-select ltr">';
      for (var g = 0; g < snap.catalog.length; g++) {
        var grp = snap.catalog[g];
        html += '<optgroup label="' + escapeHtml(grp.name + ' (' + grp.id + ')') + '">';
        for (var m = 0; m < grp.models.length; m++) {
          var mod = grp.models[m];
          var val = grp.id + '::' + mod.id;
          var selected = (snap.defaultModel.provider === grp.id && snap.defaultModel.model === mod.id) ? ' selected' : '';
          html += '<option value="' + escapeHtml(val) + '"' + selected + '>' + escapeHtml(mod.name + ' (' + mod.id + ')') + '</option>';
        }
        html += '</optgroup>';
      }
      html += '</select></div>';
      html += '<div class="aras-field"><label>سطح تفکر (Reasoning Effort)</label><input id="aras-model-effort" class="aras-input ltr" value="' + escapeHtml(snap.defaultModel.reasoningEffort || '') + '" placeholder="پیش‌فرض مدل (مثلاً low / medium / high / max)" /></div>';
      html += '</div>';
    } else {
      html += '<div style="padding:10px 12px;border-radius:9px;background:var(--warning-soft);color:var(--warning);font-size:12.5px;">هنوز کلید API فعالی شناسایی نشده یا فهرست مدل‌ها خالی است. ابتدا کلید API خود را در کارت پایین ذخیره کنید یا شناسه مدل را دستی وارد نمایید.</div>';
    }

    html += '<div class="aras-form-grid">';
    html += '<div class="aras-field"><label>شناسه ارائه‌دهنده (Provider ID)</label><input id="aras-manual-provider" class="aras-input ltr" value="' + escapeHtml(snap.defaultModel.provider) + '" placeholder="deepseek-official" /></div>';
    html += '<div class="aras-field"><label>شناسه مدل (Model ID)</label><input id="aras-manual-model" class="aras-input ltr" value="' + escapeHtml(snap.defaultModel.model) + '" placeholder="deepseek-flash" /></div>';
    html += '</div>';
    html += '<div><button type="button" class="aras-btn primary" id="aras-save-model-btn">ذخیره مدل فعال</button></div>';
    html += '</div>';

    /* 2. API Keys Card */
    html += '<div class="aras-card">';
    html += '<div class="aras-card-title">مدیریت کلیدهای API (ذخیره‌سازی امن در Credentials)</div>';
    html += '<div class="aras-card-desc">کلیدهای واردشده در فایل امن <code class="aras-tool-name-code">$DSH_HOME/.credentials.yaml</code> ذخیره می‌شوند و هرگز به مرورگر بازگردانده نمی‌شوند.</div>';

    for (var c = 0; c < snap.credentials.length; c++) {
      var cred = snap.credentials[c];
      html += '<div class="aras-cred-row">';
      html += '<div class="aras-cred-info">';
      html += '<div style="font-weight:700;font-size:13.5px;">' + escapeHtml(cred.label) + ' <code class="aras-tool-name-code">' + escapeHtml(cred.ref) + '</code></div>';
      html += '<div style="font-size:12px;color:var(--text-secondary);">وضعیت: ' + (cred.configured ? ('<span style="color:var(--success);font-weight:700;">تنظیم شده</span>' + (cred.source ? ' (' + escapeHtml(cred.source) + ')' : '')) : '<span style="color:var(--text-muted);">تنظیم نشده</span>') + '</div>';
      html += '</div>';
      html += '<div class="aras-cred-controls">';
      html += '<input type="password" class="aras-input ltr" style="width:230px;" placeholder="sk-..." data-cred-input="' + escapeHtml(cred.ref) + '" />';
      html += '<button type="button" class="aras-btn primary" data-cred-save="' + escapeHtml(cred.ref) + '">ذخیره کلید</button>';
      if (cred.configured && cred.writable) {
        html += '<button type="button" class="aras-btn danger" data-cred-unset="' + escapeHtml(cred.ref) + '">حذف</button>';
      }
      html += '</div></div>';
    }

    html += '<div style="border-top:1px solid var(--border-subtle);padding-top:12px;margin-top:4px;">';
    html += '<div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">افزودن متغیر کلید سفارشی جدید</div>';
    html += '<div class="aras-form-grid">';
    html += '<input id="aras-custom-cred-ref" class="aras-input ltr" placeholder="MY_CUSTOM_API_KEY" />';
    html += '<input id="aras-custom-cred-val" type="password" class="aras-input ltr" placeholder="مقدار کلید مخفی..." />';
    html += '</div>';
    html += '<div style="margin-top:8px;"><button type="button" class="aras-btn" id="aras-add-custom-cred-btn">ثبت کلید سفارشی</button></div>';
    html += '</div></div>';

    /* 3. DeepSeek Endpoint & Custom Providers (llm-pi-ai) */
    html += '<div class="aras-card">';
    html += '<div class="aras-card-title">تنظیمات درگاه دیپ‌سیک و ارائه‌دهندگان سفارشی (OpenAI / Anthropic / Ollama / vLLM)</div>';
    html += '<div class="aras-form-grid">';
    html += '<div class="aras-field"><label>نشانی پایه دیپ‌سیک (DeepSeek Base URL)</label><input id="aras-ds-baseurl" class="aras-input ltr" value="' + escapeHtml(snap.deepseekConfig.baseURL) + '" placeholder="https://api.deepseek.com" /></div>';
    html += '<div class="aras-field"><label>متغیر کلید دیپ‌سیک</label><input id="aras-ds-keyenv" class="aras-input ltr" value="' + escapeHtml(snap.deepseekConfig.apiKeyEnv) + '" placeholder="DEEPSEEK_API_KEY" /></div>';
    html += '</div>';
    html += '<div><button type="button" class="aras-btn" id="aras-save-ds-btn">بروزرسانی درگاه دیپ‌سیک</button></div>';

    if (snap.customProviders && snap.customProviders.length > 0) {
      html += '<div style="margin-top:8px;display:flex;flex-direction:column;gap:8px;">';
      html += '<div style="font-weight:700;font-size:13px;">ارائه‌دهندگان چندگانه ثبت‌شده (pi-ai):</div>';
      for (var p = 0; p < snap.customProviders.length; p++) {
        var cp = snap.customProviders[p];
        var modelNames = (cp.models || []).map(function (x) { return x.id; }).join(', ');
        html += '<div class="aras-cred-row">';
        html += '<div><strong>' + escapeHtml(cp.displayName) + '</strong> <code class="aras-tool-name-code">' + escapeHtml(cp.id) + '</code><div style="font-size:12px;color:var(--text-secondary);direction:ltr;text-align:right;">' + escapeHtml(cp.api) + (cp.baseURL ? ' • ' + escapeHtml(cp.baseURL) : '') + (modelNames ? ' • models: ' + escapeHtml(modelNames) : '') + '</div></div>';
        html += '<button type="button" class="aras-btn danger" data-remove-provider="' + escapeHtml(cp.id) + '">حذف درگاه</button>';
        html += '</div>';
      }
      html += '</div>';
    }

    html += '<div style="border-top:1px solid var(--border-subtle);padding-top:12px;margin-top:6px;">';
    html += '<div style="font-weight:700;font-size:13px;margin-bottom:8px;">افزودن یا ویرایش ارائه‌دهنده جدید (OpenAI / Anthropic / OpenRouter / Local LLM)</div>';
    html += '<div class="aras-form-grid">';
    html += '<div class="aras-field"><label>شناسه مسیر (مثلاً openai، anthropic یا local-vllm)</label><input id="aras-cp-id" class="aras-input ltr" placeholder="openai" /></div>';
    html += '<div class="aras-field"><label>نام نمایشی</label><input id="aras-cp-name" class="aras-input" placeholder="OpenAI / درگاه سازمانی" /></div>';
    html += '<div class="aras-field"><label>پروتکل API</label><select id="aras-cp-api" class="aras-select ltr"><option value="openai-completions">openai-completions</option><option value="openai-responses">openai-responses</option><option value="anthropic-messages">anthropic-messages</option></select></div>';
    html += '<div class="aras-field"><label>نشانی Base URL (اختیاری برای ارائه‌دهندگان استاندارد)</label><input id="aras-cp-url" class="aras-input ltr" placeholder="https://api.openai.com/v1" /></div>';
    html += '<div class="aras-field"><label>نام متغیر کلید API</label><input id="aras-cp-keyenv" class="aras-input ltr" placeholder="OPENAI_API_KEY" /></div>';
    html += '<div class="aras-field"><label>فهرست مدل‌ها با کاما (اختیاری — مثلاً gpt-4o,o3-mini)</label><input id="aras-cp-models" class="aras-input ltr" placeholder="gpt-4o, gpt-4.1-mini" /></div>';
    html += '</div>';
    html += '<div style="margin-top:10px;"><button type="button" class="aras-btn primary" id="aras-save-cp-btn">ثبت ارائه‌دهنده</button></div>';
    html += '</div></div>';

    /* 4. Permissions & Workspace Directory Card */
    html += '<div class="aras-card">';
    html += '<div class="aras-card-title">سیاست مجوز اجرای ابزارها و پوشه کاری</div>';
    html += '<div class="aras-form-grid">';
    html += '<div class="aras-field"><label>نحوه تایید ابزارهای حساس</label><select id="aras-pref-approval" class="aras-select">';
    html += '<option value="ask"' + (snap.preferences.approvalMode === 'ask' ? ' selected' : '') + '>پرسش تعاملی از کاربر داخل گفتگو (پیشنهادی)</option>';
    html += '<option value="auto-allow"' + (snap.preferences.approvalMode === 'auto-allow' ? ' selected' : '') + '>تایید خودکار درخواست‌های مجوز در این رابط</option>';
    html += '<option value="never"' + (snap.preferences.approvalMode === 'never' ? ' selected' : '') + '>رد خودکار عملیات نیازمند ارتقای سطح دسترسی</option>';
    html += '</select></div>';
    html += '<div class="aras-field"><label>مسیر پوشه کاری پیش‌فرض (Workspace CWD)</label><input id="aras-pref-cwd" class="aras-input ltr" value="' + escapeHtml(snap.preferences.defaultCwd) + '" /></div>';
    html += '</div>';
    html += '<div><button type="button" class="aras-btn primary" id="aras-save-pref-btn">ذخیره تنظیمات اجرایی</button></div>';
    html += '</div>';

    root.innerHTML = html;
  }

  /* ── SSE Live Event Stream ────────────────────────────────────────────── */
  function connectEventStream() {
    var es = new EventSource('/aras-api/stream');
    es.onmessage = function (ev) {
      var data;
      try { data = JSON.parse(ev.data); } catch (_e) { return; }
      handleServerEvent(data);
    };
    es.onerror = function () {
      es.close();
      setTimeout(connectEventStream, 2000);
    };
  }

  function handleServerEvent(ev) {
    if (!ev || !ev.type) return;

    if (ev.type === 'session.updated' && ev.session) {
      if (state.currentSessionId === ev.session.id) {
        state.currentSessionTitle = ev.session.title;
        renderChatSurface(false);
      }
      return;
    }

    if (!state.currentSessionId || ev.sessionId !== state.currentSessionId) {
      if (ev.type === 'approval.requested' && ev.approval && ev.approval.sessionId === state.currentSessionId) {
        state.pendingApprovals.push(ev.approval);
        renderChatSurface(true);
      } else if (ev.type === 'question.requested' && ev.question && ev.question.sessionId === state.currentSessionId) {
        state.pendingQuestions.push(ev.question);
        renderChatSurface(true);
      }
      return;
    }

    switch (ev.type) {
      case 'session.status':
        state.sessionStatus = ev.status;
        renderChatSurface(false);
        break;
      case 'session.error':
        state.items.push({ kind: 'error', id: 'err-' + Date.now(), message: ev.message });
        renderChatSurface(true);
        break;
      case 'stream.start':
        state.liveStream = {
          attemptId: ev.attemptId,
          turn: ev.turn,
          step: ev.step,
          reasoning: '',
          text: '',
          toolCalls: []
        };
        renderChatSurface(true);
        break;
      case 'stream.delta':
        if (!state.liveStream || state.liveStream.attemptId !== ev.attemptId) {
          state.liveStream = { attemptId: ev.attemptId, turn: 0, step: 0, reasoning: '', text: '', toolCalls: [] };
        }
        if (ev.deltaKind === 'text' && ev.text) {
          state.liveStream.text += ev.text;
        } else if (ev.deltaKind === 'reasoning' && ev.text) {
          state.liveStream.reasoning += ev.text;
        } else if (ev.deltaKind === 'tool-call' && ev.toolCallId) {
          var existingTc = null;
          for (var i = 0; i < state.liveStream.toolCalls.length; i++) {
            if (state.liveStream.toolCalls[i].id === ev.toolCallId) { existingTc = state.liveStream.toolCalls[i]; break; }
          }
          if (!existingTc) {
            existingTc = { id: ev.toolCallId, name: ev.toolName || '', argumentsText: '' };
            state.liveStream.toolCalls.push(existingTc);
          }
          if (ev.toolName) existingTc.name = ev.toolName;
          if (ev.argumentsDelta) existingTc.argumentsText += ev.argumentsDelta;
        }
        renderChatSurface(true);
        break;
      case 'stream.end':
        state.liveStream = null;
        renderChatSurface(false);
        break;
      case 'transcript.item':
        var dup = false;
        for (var k = 0; k < state.items.length; k++) {
          if (state.items[k].id === ev.item.id) { state.items[k] = ev.item; dup = true; break; }
        }
        if (!dup) state.items.push(ev.item);
        renderChatSurface(true);
        break;
      case 'tool.call':
        attachOrUpdateTool(ev.turn, ev.step, ev.tool);
        renderChatSurface(true);
        break;
      case 'tool.result':
        updateToolResult(ev.callId, ev.status, ev.resultText, ev.errorReason);
        renderChatSurface(false);
        break;
      case 'approval.requested':
        state.pendingApprovals.push(ev.approval);
        renderChatSurface(true);
        break;
      case 'approval.resolved':
        state.pendingApprovals = state.pendingApprovals.filter(function (x) { return x.requestId !== ev.requestId; });
        renderChatSurface(false);
        break;
      case 'question.requested':
        state.pendingQuestions.push(ev.question);
        renderChatSurface(true);
        break;
      case 'question.resolved':
        state.pendingQuestions = state.pendingQuestions.filter(function (x) { return x.requestId !== ev.requestId; });
        renderChatSurface(false);
        break;
    }
  }

  function attachOrUpdateTool(turn, step, tool) {
    for (var i = state.items.length - 1; i >= 0; i--) {
      var item = state.items[i];
      if (item.kind === 'assistant' && item.turn === turn && item.step === step) {
        var found = false;
        var nextTools = (item.tools || []).map(function (t) {
          if (t.callId === tool.callId) { found = true; return tool; }
          return t;
        });
        if (!found) nextTools.push(tool);
        state.items[i] = Object.assign({}, item, { tools: nextTools });
        return;
      }
    }
  }

  function updateToolResult(callId, status, resultText, errorReason) {
    for (var i = state.items.length - 1; i >= 0; i--) {
      var item = state.items[i];
      if (item.kind !== 'assistant' || !item.tools) continue;
      for (var j = 0; j < item.tools.length; j++) {
        if (item.tools[j].callId === callId) {
          var copy = item.tools.slice();
          copy[j] = Object.assign({}, copy[j], {
            status: status,
            resultText: resultText,
            errorReason: errorReason
          });
          state.items[i] = Object.assign({}, item, { tools: copy });
          return;
        }
      }
    }
  }

  /* ── Delegated DOM Event Wiring ───────────────────────────────────────── */
  document.addEventListener('click', async function (ev) {
    var target = ev.target;
    if (!(target instanceof Element)) return;

    var menuBtn = target.closest('#aras-sidebar-toggle');
    if (menuBtn) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      var sb = document.getElementById('aras-sidebar');
      if (sb) sb.classList.toggle('collapsed', state.sidebarCollapsed);
      return;
    }

    var navBtn = target.closest('[data-nav-tab]');
    if (navBtn) {
      var tab = navBtn.getAttribute('data-nav-tab');
      if (tab === 'logout') {
        startFreshChatView();
        showToast('نشست فعلی بسته شد.');
      } else if (tab) {
        switchTab(tab);
      }
      return;
    }

    var themeBtn = target.closest('[data-theme-btn]');
    if (themeBtn) {
      applyTheme(themeBtn.getAttribute('data-theme-btn') || 'auto');
      return;
    }

    var disabledMode = target.closest('.aras-mode-pill.disabled');
    if (disabledMode) {
      showToast('در این نسخه تنها حالت «خودکار» (متصل به ارکستریتور هوشمند DSH) فعال است.');
      return;
    }

    var pdfBtn = target.closest('#aras-pdf-btn');
    if (pdfBtn) {
      window.print();
      return;
    }

    var modelPill = target.closest('#aras-active-model-pill');
    if (modelPill) {
      switchTab('settings');
      return;
    }

    var sendBtn = target.closest('#aras-send-btn');
    if (sendBtn) {
      handleSendOrStop();
      return;
    }

    var attachBtn = target.closest('#aras-attach-btn');
    if (attachBtn) {
      var fileInput = document.getElementById('aras-file-input');
      if (fileInput) fileInput.click();
      return;
    }

    var removeImgBtn = target.closest('[data-remove-img]');
    if (removeImgBtn) {
      var idx = Number(removeImgBtn.getAttribute('data-remove-img'));
      state.stagedImages.splice(idx, 1);
      renderAttachmentStrip();
      return;
    }

    var toggleCard = target.closest('[data-toggle-card]');
    if (toggleCard) {
      var cKey = toggleCard.getAttribute('data-toggle-card');
      state.openCards[cKey] = !state.openCards[cKey];
      var cardEl = toggleCard.closest('.aras-collapse-card');
      if (cardEl) cardEl.classList.toggle('open', !!state.openCards[cKey]);
      return;
    }

    var toggleReasoning = target.closest('[data-toggle-reasoning]');
    if (toggleReasoning) {
      var rKey = toggleReasoning.getAttribute('data-toggle-reasoning');
      var rCard = toggleReasoning.closest('.aras-collapse-card');
      var nextOpen = rCard ? !rCard.classList.contains('open') : true;
      state.userToggledReasoning[rKey] = nextOpen;
      if (rCard) rCard.classList.toggle('open', nextOpen);
      return;
    }

    var approvalBtn = target.closest('[data-approval-action]');
    if (approvalBtn) {
      var outcome = approvalBtn.getAttribute('data-approval-action');
      var reqId = approvalBtn.getAttribute('data-req-id');
      try {
        await apiFetch('/aras-api/approvals/' + encodeURIComponent(reqId), {
          method: 'POST',
          body: { outcome: outcome }
        });
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    var qCancelBtn = target.closest('[data-question-cancel]');
    if (qCancelBtn) {
      var qReqId = qCancelBtn.getAttribute('data-question-cancel');
      try {
        await apiFetch('/aras-api/questions/' + encodeURIComponent(qReqId), {
          method: 'POST',
          body: { cancelled: true }
        });
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    var openSess = target.closest('[data-open-session]');
    if (openSess) {
      openExistingSession(openSess.getAttribute('data-open-session'));
      return;
    }

    /* Settings buttons */
    if (target.closest('#aras-refresh-settings-btn')) {
      await loadSettings();
      showToast('فهرست مدل‌ها بروزرسانی شد.');
      return;
    }

    if (target.closest('#aras-save-model-btn')) {
      var pEl = document.getElementById('aras-manual-provider');
      var mEl = document.getElementById('aras-manual-model');
      var eEl = document.getElementById('aras-model-effort');
      try {
        await apiFetch('/aras-api/settings/model', {
          method: 'POST',
          body: {
            provider: pEl ? pEl.value : '',
            model: mEl ? mEl.value : '',
            reasoningEffort: eEl ? eEl.value : '',
            sessionId: state.currentSessionId || undefined
          }
        });
        showToast('مدل پیش‌فرض ذخیره شد.');
        await loadSettings();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    var credSaveBtn = target.closest('[data-cred-save]');
    if (credSaveBtn) {
      var ref = credSaveBtn.getAttribute('data-cred-save');
      var inp = document.querySelector('[data-cred-input="' + ref + '"]');
      var val = inp ? inp.value : '';
      try {
        await apiFetch('/aras-api/settings/credentials', {
          method: 'POST',
          body: { ref: ref, value: val }
        });
        showToast('کلید ' + ref + ' با موفقیت ذخیره شد.');
        await loadSettings();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    var credUnsetBtn = target.closest('[data-cred-unset]');
    if (credUnsetBtn) {
      var uRef = credUnsetBtn.getAttribute('data-cred-unset');
      try {
        await apiFetch('/aras-api/settings/credentials', {
          method: 'POST',
          body: { ref: uRef, unset: true }
        });
        showToast('کلید ' + uRef + ' حذف شد.');
        await loadSettings();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    if (target.closest('#aras-add-custom-cred-btn')) {
      var cRefEl = document.getElementById('aras-custom-cred-ref');
      var cValEl = document.getElementById('aras-custom-cred-val');
      try {
        await apiFetch('/aras-api/settings/credentials', {
          method: 'POST',
          body: { ref: cRefEl ? cRefEl.value.trim() : '', value: cValEl ? cValEl.value : '' }
        });
        showToast('کلید سفارشی ثبت شد.');
        await loadSettings();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    if (target.closest('#aras-save-ds-btn')) {
      var dsUrl = document.getElementById('aras-ds-baseurl');
      var dsKey = document.getElementById('aras-ds-keyenv');
      try {
        await apiFetch('/aras-api/settings/providers/deepseek', {
          method: 'POST',
          body: {
            baseURL: dsUrl ? dsUrl.value : '',
            apiKeyEnv: dsKey ? dsKey.value : ''
          }
        });
        showToast('تنظیمات دیپ‌سیک ذخیره شد.');
        await loadSettings();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    if (target.closest('#aras-save-cp-btn')) {
      var cpId = document.getElementById('aras-cp-id');
      var cpName = document.getElementById('aras-cp-name');
      var cpApi = document.getElementById('aras-cp-api');
      var cpUrl = document.getElementById('aras-cp-url');
      var cpKey = document.getElementById('aras-cp-keyenv');
      var cpModels = document.getElementById('aras-cp-models');
      var modelList = [];
      if (cpModels && cpModels.value.trim()) {
        var parts = cpModels.value.split(',');
        for (var mi = 0; mi < parts.length; mi++) {
          var mid = parts[mi].trim();
          if (mid) modelList.push({ id: mid, name: mid });
        }
      }
      try {
        await apiFetch('/aras-api/settings/providers/custom', {
          method: 'POST',
          body: {
            id: cpId ? cpId.value : '',
            displayName: cpName ? cpName.value : '',
            api: cpApi ? cpApi.value : 'openai-completions',
            baseURL: cpUrl ? cpUrl.value : '',
            apiKeyEnv: cpKey ? cpKey.value : '',
            models: modelList
          }
        });
        showToast('ارائه‌دهنده جدید ثبت شد.');
        await loadSettings();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    var remProv = target.closest('[data-remove-provider]');
    if (remProv) {
      var pid = remProv.getAttribute('data-remove-provider');
      try {
        await apiFetch('/aras-api/settings/providers/custom', {
          method: 'POST',
          body: { id: pid, remove: true }
        });
        showToast('ارائه‌دهنده حذف شد.');
        await loadSettings();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    if (target.closest('#aras-save-pref-btn')) {
      var appSel = document.getElementById('aras-pref-approval');
      var cwdInp = document.getElementById('aras-pref-cwd');
      try {
        await apiFetch('/aras-api/settings/preferences', {
          method: 'POST',
          body: {
            approvalMode: appSel ? appSel.value : 'ask',
            defaultCwd: cwdInp ? cwdInp.value : ''
          }
        });
        showToast('تنظیمات اجرایی ذخیره شد.');
        await loadSettings();
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  document.addEventListener('change', function (ev) {
    var target = ev.target;
    if (!(target instanceof Element)) return;

    if (target.id === 'aras-catalog-select') {
      var val = target.value || '';
      var idx = val.indexOf('::');
      if (idx > 0) {
        var prov = val.slice(0, idx);
        var mod = val.slice(idx + 2);
        var pInp = document.getElementById('aras-manual-provider');
        var mInp = document.getElementById('aras-manual-model');
        if (pInp) pInp.value = prov;
        if (mInp) mInp.value = mod;
      }
      return;
    }

    if (target.id === 'aras-file-input' && target.files) {
      var files = Array.prototype.slice.call(target.files);
      target.value = '';
      files.forEach(function (file) {
        if (!file.type || file.type.indexOf('image/') !== 0) {
          showToast('فقط فایل‌های تصویری (PNG / JPEG / WebP / GIF) پشتیبانی می‌شوند.');
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var res = String(reader.result || '');
          var comma = res.indexOf(',');
          if (comma > 0) {
            state.stagedImages.push({
              data: res.slice(comma + 1),
              mediaType: file.type,
              name: file.name
            });
            renderAttachmentStrip();
          }
        };
        reader.readAsDataURL(file);
      });
    }
  });

  document.addEventListener('submit', async function (ev) {
    var form = ev.target;
    if (!(form instanceof HTMLFormElement)) return;
    var qReqId = form.getAttribute('data-question-form');
    if (!qReqId) return;
    ev.preventDefault();

    var blocks = form.querySelectorAll('[data-qid]');
    var answers = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var qid = b.getAttribute('data-qid');
      var checked = b.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked');
      var selected = [];
      for (var c = 0; c < checked.length; c++) {
        selected.push(checked[c].value);
      }
      var customEl = b.querySelector('input[name="custom_' + qid + '"]');
      var customVal = customEl ? customEl.value.trim() : '';
      var item = { id: qid, selected: selected };
      if (customVal) item.custom = customVal;
      answers.push(item);
    }

    try {
      await apiFetch('/aras-api/questions/' + encodeURIComponent(qReqId), {
        method: 'POST',
        body: { answers: answers }
      });
    } catch (err) {
      showToast(err.message);
    }
  });

  /* ── Initialize Boot ──────────────────────────────────────────────────── */
  function init() {
    applyTheme(state.themeMode);
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
        if (state.themeMode === 'auto') applyTheme('auto');
      });
    }

    var input = document.getElementById('aras-composer-input');
    if (input) {
      input.addEventListener('input', syncComposerButtonState);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          handleSendOrStop();
        }
      });
    }

    syncNavigationUI();
    renderChatSurface(false);
    connectEventStream();

    apiFetch('/aras-api/settings').then(function (snap) {
      state.settings = snap;
      updateModelBadge(snap.defaultModel);
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`
