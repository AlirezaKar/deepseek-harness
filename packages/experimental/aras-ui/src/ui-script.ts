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

  function parsePersianDigitsToAscii(str) {
    return String(str || '').replace(/[۰-۹]/g, function (ch) {
      var idx = PERSIAN_DIGITS.indexOf(ch);
      return idx >= 0 ? String(idx) : ch;
    });
  }

  function splitTableCells(line) {
    var s = String(line || '').trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.length > 0 && s.charAt(s.length - 1) === '|' && s.charAt(s.length - 2) !== '\\\\') {
      s = s.slice(0, -1);
    }
    var cells = [];
    var cur = '';
    var inCode = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '\\\\' && i + 1 < s.length) {
        var next = s.charAt(i + 1);
        if (next === '|' || next === '\\\\' || next === '\`') {
          cur += next;
          i++;
          continue;
        }
      }
      if (ch === '\`') {
        inCode = !inCode;
        cur += ch;
        continue;
      }
      if (ch === '|' && !inCode) {
        cells.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  function parseTableDelimiter(line, expectedCols) {
    var raw = String(line || '').trim();
    if (!raw || raw.indexOf('|') < 0 || raw.indexOf('-') < 0) return null;
    var cells = splitTableCells(raw);
    if (cells.length === 0 || cells.length !== expectedCols) return null;
    var aligns = [];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i].trim();
      if (!/^:?-{2,}:?$/.test(c)) return null;
      var leftColon = c.charAt(0) === ':';
      var rightColon = c.charAt(c.length - 1) === ':';
      if (leftColon && rightColon) aligns.push('center');
      else if (rightColon) aligns.push('right');
      else if (leftColon) aligns.push('left');
      else aligns.push('');
    }
    return aligns;
  }

  function formatInline(str) {
    if (!str) return '';
    var inlineTokens = [];
    function stashToken(htmlFragment) {
      var idx = inlineTokens.length;
      inlineTokens.push(htmlFragment);
      return '\\u0000ARAS_INL_' + idx + '\\u0000';
    }

    var working = String(str);

    /* 1. Protect inline code spans first so *, _, |, and URLs inside backticks stay untouched */
    working = working.replace(/\`([^\`\\n]+)\`/g, function (_m, codeContent) {
      return stashToken('<code class="inline">' + escapeHtml(codeContent) + '</code>');
    });

    /* 2. Escape remaining HTML before applying inline emphasis/link rules */
    var s = escapeHtml(working);

    /* 3. Protect Markdown links [label](url) so underscores in URLs are never turned into <em> */
    s = s.replace(/\\[([^\\]\\n]+)\\]\\(((?:https?:\\/\\/|mailto:)[^\\s)]+)\\)/g, function (_m, label, href) {
      return stashToken('<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
    });

    /* 4. Bold+Italic, Bold, Strikethrough, and word-bounded Italic */
    s = s.replace(/\\*\\*\\*([^\\s*](?:[\\s\\S]*?[^\\s*])?)\\*\\*\\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\\*\\*([^\\s*](?:[\\s\\S]*?[^\\s*])?)\\*\\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\\s(«\\[>])__([^\\s_](?:[\\s\\S]*?[^\\s_])?)__(?=$|[\\s).,!?:;،؛»\\]<])/g, '$1<strong>$2</strong>');
    s = s.replace(/~~([^\\s~](?:[\\s\\S]*?[^\\s~])?)~~/g, '<del>$1</del>');
    s = s.replace(/(^|[^*])\\*([^\\s*](?:[^*]*?[^\\s*])?)\\*(?!\\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[\\s(«\\[>])_([^\\s_](?:[^_]*?[^\\s_])?)_(?=$|[\\s).,!?:;،؛»\\]<])/g, '$1<em>$2</em>');

    /* 5. Restore protected inline code and link tokens */
    s = s.replace(/\\u0000ARAS_INL_(\\d+)\\u0000/g, function (_m, idxStr) {
      return inlineTokens[Number(idxStr)] || '';
    });
    return s;
  }

  function renderMarkdown(raw) {
    if (!raw) return '';
    var text = String(raw).replace(/\\r\\n?/g, '\\n');
    var codeBlocks = [];

    function pushCodeBlock(info, code) {
      var idx = codeBlocks.length;
      var lang = String(info || '').trim().split(/\\s+/)[0] || '';
      var cleanCode = String(code || '').replace(/\\n$/, '');
      var header = '<div class="aras-code-header"><span class="aras-code-lang">' + escapeHtml(lang || 'code') + '</span><button type="button" class="aras-code-copy-btn" data-copy-code="1">کپی</button></div>';
      codeBlocks.push('<div class="aras-code-block">' + header + '<pre class="aras-code-pre"><code>' + escapeHtml(cleanCode) + '</code></pre></div>');
      return '\\n@@ARAS_CODE_' + idx + '@@\\n';
    }

    /* Closed fenced code blocks */
    text = text.replace(/\`\`\`([^\\n\`]*)\\n([\\s\\S]*?)\`\`\`/g, function (_m, info, code) {
      return pushCodeBlock(info, code);
    });
    /* Live-streaming unclosed fenced code block at end of response */
    text = text.replace(/(^|\\n)\`\`\`([^\\n\`]*)\\n([\\s\\S]*)$/g, function (_m, prefix, info, code) {
      return prefix + pushCodeBlock(info, code);
    });

    var lines = text.split('\\n');
    var htmlParts = [];
    var paraLines = [];
    var listType = null;
    var quoteLines = [];

    function flushParagraph() {
      if (paraLines.length > 0) {
        htmlParts.push('<p>' + paraLines.join('<br />') + '</p>');
        paraLines = [];
      }
    }

    function closeList() {
      if (listType) {
        htmlParts.push('</' + listType + '>');
        listType = null;
      }
    }

    function flushBlockquote() {
      if (quoteLines.length > 0) {
        htmlParts.push('<blockquote>' + renderMarkdown(quoteLines.join('\\n')) + '</blockquote>');
        quoteLines = [];
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      /* 1. Fenced code block placeholder */
      var codeMatch = /^@@ARAS_CODE_(\\d+)@@$/.exec(trimmed);
      if (codeMatch) {
        flushParagraph();
        closeList();
        flushBlockquote();
        htmlParts.push(codeBlocks[Number(codeMatch[1])] || '');
        continue;
      }

      /* 2. Blank line */
      if (trimmed === '') {
        flushParagraph();
        closeList();
        flushBlockquote();
        continue;
      }

      /* 3. GFM Table (header row + delimiter row + 0..N body rows, including streaming rows) */
      if (line.indexOf('|') >= 0 && i + 1 < lines.length) {
        var headerCells = splitTableCells(line);
        var aligns = headerCells.length >= 1 ? parseTableDelimiter(lines[i + 1], headerCells.length) : null;
        if (aligns) {
          flushParagraph();
          closeList();
          flushBlockquote();

          var tbl = '<div class="aras-table-wrap"><table><thead><tr>';
          for (var h = 0; h < headerCells.length; h++) {
            var hStyle = aligns[h] ? ' style="text-align:' + aligns[h] + ';"' : '';
            tbl += '<th' + hStyle + '>' + formatInline(headerCells[h]) + '</th>';
          }
          tbl += '</tr></thead><tbody>';

          i += 2;
          while (i < lines.length) {
            var rowLine = lines[i];
            var rowTrim = rowLine.trim();
            if (!rowTrim || rowLine.indexOf('|') < 0 || /^@@ARAS_CODE_\\d+@@$/.test(rowTrim) || /^#{1,6}\\s+/.test(rowTrim)) {
              i--;
              break;
            }
            var rowCells = splitTableCells(rowLine);
            tbl += '<tr>';
            for (var c = 0; c < headerCells.length; c++) {
              var cStyle = aligns[c] ? ' style="text-align:' + aligns[c] + ';"' : '';
              var cellVal = c < rowCells.length ? formatInline(rowCells[c]) : '';
              tbl += '<td' + cStyle + '>' + cellVal + '</td>';
            }
            tbl += '</tr>';
            i++;
          }

          tbl += '</tbody></table></div>';
          htmlParts.push(tbl);
          continue;
        }
      }

      /* 4. Blockquote (> ...) */
      var quoteMatch = /^\\s*>\\s?(.*)$/.exec(line);
      if (quoteMatch) {
        flushParagraph();
        closeList();
        quoteLines.push(quoteMatch[1]);
        continue;
      }
      flushBlockquote();

      /* 5. Headings (# to ######) */
      var headingMatch = /^\\s*(#{1,6})\\s+(.+)$/.exec(line);
      if (headingMatch) {
        flushParagraph();
        closeList();
        var hLevel = headingMatch[1].length;
        htmlParts.push('<h' + hLevel + '>' + formatInline(headingMatch[2].trim()) + '</h' + hLevel + '>');
        continue;
      }

      /* 6. Horizontal rule (---, ***, ___) */
      if (/^\\s*(?:\\*{3,}|-{3,}|_{3,})\\s*$/.test(line)) {
        flushParagraph();
        closeList();
        htmlParts.push('<hr class="aras-hr" />');
        continue;
      }

      /* 7. Unordered list & GFM task list (-, *, +, •) */
      var ulMatch = /^\\s*[-*+•]\\s+(.+)$/.exec(line);
      if (ulMatch) {
        flushParagraph();
        if (listType !== 'ul') {
          closeList();
          htmlParts.push('<ul>');
          listType = 'ul';
        }
        var taskMatch = /^\\[([ xX])\\]\\s+(.+)$/.exec(ulMatch[1]);
        if (taskMatch) {
          var isChecked = taskMatch[1].toLowerCase() === 'x';
          htmlParts.push('<li class="aras-task-item"><input type="checkbox" disabled' + (isChecked ? ' checked' : '') + ' /><span>' + formatInline(taskMatch[2]) + '</span></li>');
        } else {
          htmlParts.push('<li>' + formatInline(ulMatch[1]) + '</li>');
        }
        continue;
      }

      /* 8. Ordered list (1. / 1) / ۱.) */
      var olMatch = /^\\s*(\\d+|[۰-۹]+)[.)]\\s+(.+)$/.exec(line);
      if (olMatch) {
        flushParagraph();
        if (listType !== 'ol') {
          closeList();
          var startNum = Number(parsePersianDigitsToAscii(olMatch[1])) || 1;
          htmlParts.push('<ol' + (startNum > 1 ? ' start="' + startNum + '"' : '') + '>');
          listType = 'ol';
        }
        htmlParts.push('<li>' + formatInline(olMatch[2]) + '</li>');
        continue;
      }

      /* 9. Standard paragraph line */
      closeList();
      paraLines.push(formatInline(line));
    }

    flushParagraph();
    closeList();
    flushBlockquote();

    var joined = htmlParts.join('');
    joined = joined.replace(/@@ARAS_CODE_(\\d+)@@/g, function (_m, n) {
      return codeBlocks[Number(n)] || '';
    });
    return joined;
  }

  if (typeof window !== 'undefined') {
    window.__arasRenderMarkdown = renderMarkdown;
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
    pill.title = label + ' — کلیک برای تغییر مدل هوش مصنوعی';
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

  function isScrolledNearBottom(el) {
    if (!el) return true;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) <= 110;
  }

  function syncChatHeaderAndHero() {
    var titleEl = document.getElementById('aras-chat-title');
    var nextTitle = state.currentSessionTitle || 'گفتگوی جدید';
    if (titleEl && titleEl.textContent !== nextTitle) {
      titleEl.textContent = nextTitle;
      titleEl.title = nextTitle;
    }

    var hero = document.getElementById('aras-welcome-hero');
    if (hero) {
      var hasActivity = state.items.length > 0 || !!state.liveStream || state.sessionStatus === 'running' || state.pendingApprovals.length > 0 || state.pendingQuestions.length > 0;
      hero.classList.toggle('hidden', hasActivity);
    }
  }

  function renderSingleSettledItemHtml(item) {
    var parts = [];
    if (item.kind === 'user') {
      parts.push('<div class="aras-msg-row"><div class="aras-msg-user">');
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
    return parts.join('');
  }

  function quickHash(str) {
    var s = String(str || '');
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return s.length + ':' + h;
  }

  function computeSettledItemSig(item) {
    var toolState = '';
    if (item.tools && item.tools.length > 0) {
      for (var i = 0; i < item.tools.length; i++) {
        var tl = item.tools[i];
        toolState += tl.callId + ':' + tl.status + ':' + quickHash(tl.resultText) + ':' + (tl.errorReason || '') + ':' + (state.openCards['tool-' + tl.callId] ? '1' : '0') + ';';
      }
    }
    var rState = state.userToggledReasoning['settled-' + item.id];
    return [
      item.kind,
      item.id,
      quickHash(item.text),
      quickHash(item.reasoning),
      item.interrupted ? '1' : '0',
      item.message || '',
      rState === undefined ? 'u' : (rState ? '1' : '0'),
      toolState
    ].join('|');
  }

  function syncSettledItems() {
    var settledList = document.getElementById('aras-settled-list');
    if (!settledList) return;

    var existingById = {};
    var children = Array.prototype.slice.call(settledList.children);
    for (var c = 0; c < children.length; c++) {
      var k = children[c].getAttribute('data-item-id');
      if (k) existingById[k] = children[c];
    }

    var seenIds = {};
    for (var i = 0; i < state.items.length; i++) {
      var item = state.items[i];
      var itemId = String(item.id || ('idx-' + i));
      seenIds[itemId] = true;
      var sig = computeSettledItemSig(item);
      var node = existingById[itemId];
      if (!node) {
        node = document.createElement('div');
        node.className = 'aras-settled-entry';
        node.setAttribute('data-item-id', itemId);
        node.setAttribute('data-sig', sig);
        node.innerHTML = renderSingleSettledItemHtml(item);
      } else if (node.getAttribute('data-sig') !== sig) {
        node.setAttribute('data-sig', sig);
        node.innerHTML = renderSingleSettledItemHtml(item);
      }

      var currentAtPos = settledList.children[i] || null;
      if (currentAtPos !== node) {
        settledList.insertBefore(node, currentAtPos);
      }
    }

    for (var oldKey in existingById) {
      if (Object.prototype.hasOwnProperty.call(existingById, oldKey) && !seenIds[oldKey]) {
        var stale = existingById[oldKey];
        if (stale && stale.parentNode === settledList) {
          settledList.removeChild(stale);
        }
      }
    }
  }

  function syncLiveSlotNow() {
    var liveSlot = document.getElementById('aras-live-slot');
    if (!liveSlot) return;

    if (state.liveStream) {
      var ls = state.liveStream;
      var attemptId = String(ls.attemptId || 'live');
      var card = liveSlot.querySelector('.aras-live-card');
      if (!card || card.getAttribute('data-attempt-id') !== attemptId) {
        liveSlot.innerHTML =
          '<div class="aras-msg-row aras-live-card" data-attempt-id="' + escapeHtml(attemptId) + '">' +
            '<div class="aras-msg-assistant">' +
              '<div class="aras-msg-meta">' +
                '<span style="display:inline-flex;align-items:center;gap:6px;"><span class="aras-pulse-dot"></span><span>در حال تولید پاسخ...</span></span>' +
                '<span class="aras-live-step"></span>' +
              '</div>' +
              '<div class="aras-live-reasoning-wrap" style="display:none;"></div>' +
              '<div class="aras-live-tools-wrap" style="display:none;"></div>' +
              '<div class="aras-md aras-live-md" style="display:none;"></div>' +
            '</div>' +
          '</div>';
        card = liveSlot.querySelector('.aras-live-card');
      }
      if (!card) return;

      var stepEl = card.querySelector('.aras-live-step');
      var stepText = 'گام ' + toPersianNumber((ls.step || 0) + 1);
      if (stepEl && stepEl.textContent !== stepText) {
        stepEl.textContent = stepText;
      }

      /* In-place Reasoning update without destroying the collapsible card */
      var rWrap = card.querySelector('.aras-live-reasoning-wrap');
      if (rWrap) {
        if (ls.reasoning && ls.reasoning.trim()) {
          rWrap.style.display = '';
          var rKey = 'live-' + attemptId;
          var rCard = rWrap.querySelector('.aras-collapse-card.reasoning');
          if (!rCard) {
            rWrap.innerHTML = renderReasoningCardHtml(ls.reasoning, rKey, !ls.text);
            rCard = rWrap.querySelector('.aras-collapse-card.reasoning');
          } else {
            var rTextEl = rCard.querySelector('.aras-reasoning-text');
            if (rTextEl && rTextEl.textContent !== ls.reasoning) {
              rTextEl.textContent = ls.reasoning;
            }
            var userToggled = state.userToggledReasoning[rKey];
            var shouldOpen = userToggled !== undefined ? userToggled : !ls.text;
            rCard.classList.toggle('open', shouldOpen);
          }
        } else {
          rWrap.style.display = 'none';
        }
      }

      /* In-place Live Tool Calls update only when toolCalls signature changes */
      var tWrap = card.querySelector('.aras-live-tools-wrap');
      if (tWrap) {
        if (ls.toolCalls && ls.toolCalls.length > 0) {
          var tSig = '';
          for (var tc = 0; tc < ls.toolCalls.length; tc++) {
            var lt = ls.toolCalls[tc];
            tSig += lt.id + ':' + (lt.name || '') + ':' + (lt.argumentsText || '').length + ':' + (state.openCards['tool-' + lt.id] ? '1' : '0') + ';';
          }
          tWrap.style.display = 'flex';
          tWrap.style.flexDirection = 'column';
          tWrap.style.gap = '8px';
          if (tWrap.getAttribute('data-tools-sig') !== tSig) {
            tWrap.setAttribute('data-tools-sig', tSig);
            var tHtml = '';
            for (var ti = 0; ti < ls.toolCalls.length; ti++) {
              var liveTool = ls.toolCalls[ti];
              tHtml += renderToolCardHtml({
                callId: liveTool.id,
                name: liveTool.name || 'tool',
                argumentsText: liveTool.argumentsText || '',
                status: 'running'
              }, 'tool-' + liveTool.id);
            }
            tWrap.innerHTML = tHtml;
          }
        } else {
          tWrap.style.display = 'none';
        }
      }

      /* In-place Live Markdown update only when text changed */
      var mdEl = card.querySelector('.aras-live-md');
      if (mdEl) {
        if (ls.text) {
          if (mdEl._lastRawText !== ls.text) {
            mdEl.style.display = '';
            mdEl._lastRawText = ls.text;
            mdEl.innerHTML = renderMarkdown(ls.text);
          }
        } else {
          mdEl.style.display = 'none';
          mdEl._lastRawText = '';
        }
      }
      return;
    }

    if (state.sessionStatus === 'running') {
      if (!liveSlot.querySelector('[data-orchestrator-idle="1"]')) {
        liveSlot.innerHTML = '<div class="aras-msg-row" data-orchestrator-idle="1"><div class="aras-msg-assistant"><div style="display:inline-flex;align-items:center;gap:8px;color:var(--text-secondary);font-size:13px;"><span class="aras-pulse-dot"></span><span>ارکستریتور در حال پردازش است...</span></div></div></div>';
      }
      return;
    }

    if (liveSlot.innerHTML !== '') {
      liveSlot.innerHTML = '';
    }
  }

  function syncInteractiveSlot() {
    var slot = document.getElementById('aras-interactive-slot');
    if (!slot) return;
    var sigParts = [];
    for (var a = 0; a < state.pendingApprovals.length; a++) {
      sigParts.push('a:' + state.pendingApprovals[a].requestId);
    }
    for (var q = 0; q < state.pendingQuestions.length; q++) {
      sigParts.push('q:' + state.pendingQuestions[q].requestId);
    }
    var sig = sigParts.join('|');
    if (slot.getAttribute('data-sig') === sig) return;
    slot.setAttribute('data-sig', sig);

    var html = '';
    for (var ai = 0; ai < state.pendingApprovals.length; ai++) {
      html += renderApprovalCardHtml(state.pendingApprovals[ai]);
    }
    for (var qi = 0; qi < state.pendingQuestions.length; qi++) {
      html += renderQuestionCardHtml(state.pendingQuestions[qi]);
    }
    slot.innerHTML = html;
  }

  var liveRafId = 0;
  var pendingLiveAutoScroll = false;

  function scheduleLiveSlotSync(autoScroll) {
    if (autoScroll) pendingLiveAutoScroll = true;
    if (liveRafId) return;
    var scheduleFn = (typeof window !== 'undefined' && window.requestAnimationFrame)
      ? window.requestAnimationFrame
      : function (cb) { return setTimeout(cb, 16); };
    liveRafId = scheduleFn(function () {
      liveRafId = 0;
      var wantScroll = pendingLiveAutoScroll;
      pendingLiveAutoScroll = false;
      var scrollContainer = document.getElementById('aras-chat-scroll');
      var stick = wantScroll && isScrolledNearBottom(scrollContainer);
      syncChatHeaderAndHero();
      syncLiveSlotNow();
      if (stick && scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    });
  }

  function renderChatSurface(scrollToBottom) {
    var scrollContainer = document.getElementById('aras-chat-scroll');
    var wasNearBottom = isScrolledNearBottom(scrollContainer);

    syncChatHeaderAndHero();
    syncSettledItems();
    syncLiveSlotNow();
    syncInteractiveSlot();
    syncComposerButtonState();

    if (scrollContainer && (scrollToBottom === 'force' || (scrollToBottom && wasNearBottom))) {
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
      if (btn.getAttribute('data-btn-mode') !== 'stop') {
        btn.setAttribute('data-btn-mode', 'stop');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
      }
    } else {
      var hasContent = input.value.trim().length > 0 || state.stagedImages.length > 0;
      btn.className = 'aras-send-btn' + (hasContent ? ' ready' : '');
      btn.title = 'ارسال پیام';
      if (btn.getAttribute('data-btn-mode') !== 'send') {
        btn.setAttribute('data-btn-mode', 'send');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>';
      }
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
          var defEff = mod.defaultEffort || '';
          html += '<option value="' + escapeHtml(val) + '" data-default-effort="' + escapeHtml(defEff) + '"' + selected + '>' + escapeHtml(mod.name + ' (' + mod.id + ')') + '</option>';
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
    html += '<div style="font-weight:700;font-size:13px;margin-bottom:8px;">فعال‌سازی سریع ارائه‌دهندگان استاندارد (یک کلیک):</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">';
    html += '<button type="button" class="aras-btn" data-quick-provider="openrouter" data-quick-name="OpenRouter" data-quick-key="OPENROUTER_API_KEY">+ فعال‌سازی OpenRouter</button>';
    html += '<button type="button" class="aras-btn" data-quick-provider="google" data-quick-name="Google Gemini" data-quick-key="GEMINI_API_KEY">+ فعال‌سازی Google Gemini</button>';
    html += '<button type="button" class="aras-btn" data-quick-provider="groq" data-quick-name="Groq" data-quick-key="GROQ_API_KEY">+ فعال‌سازی Groq</button>';
    html += '<button type="button" class="aras-btn" data-quick-provider="openai" data-quick-name="OpenAI" data-quick-key="OPENAI_API_KEY">+ فعال‌سازی OpenAI</button>';
    html += '<button type="button" class="aras-btn" data-quick-provider="anthropic" data-quick-name="Anthropic Claude" data-quick-key="ANTHROPIC_API_KEY">+ فعال‌سازی Anthropic</button>';
    html += '</div>';
    html += '<div style="font-weight:700;font-size:13px;margin-bottom:8px;">افزودن یا ویرایش ارائه‌دهنده سفارشی (OpenRouter / Gemini / Groq / Local LLM)</div>';
    html += '<div class="aras-form-grid">';
    html += '<div class="aras-field"><label>شناسه مسیر (مثلاً openrouter، google، groq، openai یا local-vllm)</label><input id="aras-cp-id" class="aras-input ltr" placeholder="openrouter" /></div>';
    html += '<div class="aras-field"><label>نام نمایشی</label><input id="aras-cp-name" class="aras-input" placeholder="OpenRouter / درگاه سازمانی" /></div>';
    html += '<div class="aras-field"><label>پروتکل API</label><select id="aras-cp-api" class="aras-select ltr"><option value="">خودکار از کاتالوگ (برای openrouter / google / groq / openai)</option><option value="openai-completions">openai-completions</option><option value="openai-responses">openai-responses</option><option value="anthropic-messages">anthropic-messages</option></select></div>';
    html += '<div class="aras-field"><label>نشانی Base URL (خالی بگذارید تا پیش‌فرض استاندارد استفاده شود)</label><input id="aras-cp-url" class="aras-input ltr" placeholder="اختیاری برای ارائه‌دهندگان استاندارد" /></div>';
    html += '<div class="aras-field"><label>نام متغیر کلید API</label><input id="aras-cp-keyenv" class="aras-input ltr" placeholder="OPENROUTER_API_KEY" /></div>';
    html += '<div class="aras-field"><label>فهرست مدل‌ها با کاما (خالی = دریافت کل کاتالوگ مدل‌ها)</label><input id="aras-cp-models" class="aras-input ltr" placeholder="اختیاری — خالی بگذارید تا همه مدل‌ها اضافه شوند" /></div>';
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
        syncChatHeaderAndHero();
      }
      return;
    }

    if (!state.currentSessionId || ev.sessionId !== state.currentSessionId) {
      if (ev.type === 'approval.requested' && ev.approval && ev.approval.sessionId === state.currentSessionId) {
        state.pendingApprovals.push(ev.approval);
        syncInteractiveSlot();
      } else if (ev.type === 'question.requested' && ev.question && ev.question.sessionId === state.currentSessionId) {
        state.pendingQuestions.push(ev.question);
        syncInteractiveSlot();
      }
      return;
    }

    switch (ev.type) {
      case 'session.status':
        state.sessionStatus = ev.status;
        syncChatHeaderAndHero();
        syncLiveSlotNow();
        syncComposerButtonState();
        break;
      case 'session.error':
        clearTimeout(state._streamEndTimer);
        state.liveStream = null;
        state.items.push({ kind: 'error', id: 'err-' + Date.now(), message: ev.message });
        renderChatSurface(true);
        break;
      case 'stream.start':
        clearTimeout(state._streamEndTimer);
        state.liveStream = {
          attemptId: ev.attemptId,
          turn: ev.turn,
          step: ev.step,
          reasoning: '',
          text: '',
          toolCalls: []
        };
        scheduleLiveSlotSync(true);
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
        scheduleLiveSlotSync(true);
        break;
      case 'stream.end':
        if (ev.committed && state.liveStream && state.liveStream.attemptId === ev.attemptId) {
          /* Hold live card briefly until transcript.item arrives so there is zero blank frame */
          var endedAttempt = ev.attemptId;
          clearTimeout(state._streamEndTimer);
          state._streamEndTimer = setTimeout(function () {
            if (state.liveStream && state.liveStream.attemptId === endedAttempt) {
              state.liveStream = null;
              syncLiveSlotNow();
            }
          }, 400);
        } else {
          clearTimeout(state._streamEndTimer);
          state.liveStream = null;
          syncLiveSlotNow();
        }
        break;
      case 'transcript.item':
        clearTimeout(state._streamEndTimer);
        if (ev.item && ev.item.kind === 'assistant') {
          state.liveStream = null;
        }
        var dup = false;
        for (var k = 0; k < state.items.length; k++) {
          if (state.items[k].id === ev.item.id) { state.items[k] = ev.item; dup = true; break; }
        }
        if (!dup) state.items.push(ev.item);
        renderChatSurface(ev.item && ev.item.kind === 'user' ? 'force' : true);
        break;
      case 'tool.call':
        attachOrUpdateTool(ev.turn, ev.step, ev.tool);
        syncSettledItems();
        break;
      case 'tool.result':
        updateToolResult(ev.callId, ev.status, ev.resultText, ev.errorReason);
        syncSettledItems();
        break;
      case 'approval.requested':
        state.pendingApprovals.push(ev.approval);
        syncInteractiveSlot();
        renderChatSurface(true);
        break;
      case 'approval.resolved':
        state.pendingApprovals = state.pendingApprovals.filter(function (x) { return x.requestId !== ev.requestId; });
        syncInteractiveSlot();
        break;
      case 'question.requested':
        state.pendingQuestions.push(ev.question);
        syncInteractiveSlot();
        renderChatSurface(true);
        break;
      case 'question.resolved':
        state.pendingQuestions = state.pendingQuestions.filter(function (x) { return x.requestId !== ev.requestId; });
        syncInteractiveSlot();
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

    var copyCodeBtn = target.closest('[data-copy-code]');
    if (copyCodeBtn) {
      var codeWrap = copyCodeBtn.closest('.aras-code-block');
      var codeNode = codeWrap ? codeWrap.querySelector('code') : null;
      var rawCode = codeNode ? (codeNode.textContent || '') : '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(rawCode).then(function () {
          showToast('کد در حافظه کپی شد.');
        }).catch(function () {});
      }
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

    var quickProv = target.closest('[data-quick-provider]');
    if (quickProv) {
      var qId = quickProv.getAttribute('data-quick-provider') || '';
      var qName = quickProv.getAttribute('data-quick-name') || qId;
      var qKey = quickProv.getAttribute('data-quick-key') || '';
      try {
        await apiFetch('/aras-api/settings/providers/custom', {
          method: 'POST',
          body: {
            id: qId,
            displayName: qName,
            apiKeyEnv: qKey
          }
        });
        showToast('ارائه‌دهنده ' + qName + ' فعال شد و مدل‌های آن به فهرست اضافه شدند.');
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
            api: cpApi ? cpApi.value : '',
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
        var eInp = document.getElementById('aras-model-effort');
        if (pInp) pInp.value = prov;
        if (mInp) mInp.value = mod;
        var selOpt = target.selectedOptions && target.selectedOptions[0];
        if (eInp && selOpt) {
          eInp.value = selOpt.getAttribute('data-default-effort') || '';
        }
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
