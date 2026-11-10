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
    rawTextById: {},
    reasoningByKey: {},
    pendingApprovals: [],
    pendingQuestions: [],
    stagedImages: [],
    sessionsList: [],
    settings: null,
    editingProvider: null,
    sending: false,
    _eventSource: null,
    _sseConnectedOnce: false
  };

  var COPY_ICON_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>';
  var CHECK_ICON_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var TRASH_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"></path></svg>';
  var SPARK_ICON_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"></path></svg>';
  var BRAIN_ICON_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>';

  function detectBlockDir(str) {
    var s = String(str || '').replace(/<[^>]*>/g, '').replace(/\`[^\`]*\`/g, '');
    for (var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i);
      if ((code >= 0x0590 && code <= 0x08FF) || (code >= 0xFB1D && code <= 0xFDFF) || (code >= 0xFE70 && code <= 0xFEFF)) {
        return 'rtl';
      }
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
        return 'ltr';
      }
    }
    return 'auto';
  }

  function fallbackCopyText(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_e) {
      return false;
    }
  }

  function copyTextWithFeedback(rawText, btnEl, copiedLabel) {
    var text = String(rawText == null ? '' : rawText);
    if (!text) return;

    function markCopied() {
      if (!btnEl) {
        showToast('در حافظه کپی شد.');
        return;
      }
      if (!btnEl._origHtml) {
        btnEl._origHtml = btnEl.innerHTML;
      }
      clearTimeout(btnEl._copyTimer);
      btnEl.classList.add('copied');
      btnEl.innerHTML = CHECK_ICON_SVG + (copiedLabel ? ('<span>' + escapeHtml(copiedLabel) + '</span>') : '');
      btnEl._copyTimer = setTimeout(function () {
        btnEl.classList.remove('copied');
        if (btnEl._origHtml) btnEl.innerHTML = btnEl._origHtml;
      }, 1800);
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(markCopied).catch(function () {
        if (fallbackCopyText(text)) markCopied();
        else showToast('امکان دسترسی به حافظه کلیپ‌بورد وجود ندارد.');
      });
    } else if (fallbackCopyText(text)) {
      markCopied();
    }
  }

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
        htmlParts.push('<p dir="auto">' + paraLines.join('<br />') + '</p>');
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
        htmlParts.push('<blockquote dir="auto">' + renderMarkdown(quoteLines.join('\\n')) + '</blockquote>');
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
        htmlParts.push('<h' + hLevel + ' dir="auto">' + formatInline(headingMatch[2].trim()) + '</h' + hLevel + '>');
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
          htmlParts.push('<ul dir="' + detectBlockDir(ulMatch[1]) + '">');
          listType = 'ul';
        }
        var taskMatch = /^\\[([ xX])\\]\\s+(.+)$/.exec(ulMatch[1]);
        if (taskMatch) {
          var isChecked = taskMatch[1].toLowerCase() === 'x';
          htmlParts.push('<li class="aras-task-item" dir="auto"><input type="checkbox" disabled' + (isChecked ? ' checked' : '') + ' /><span>' + formatInline(taskMatch[2]) + '</span></li>');
        } else {
          htmlParts.push('<li dir="auto">' + formatInline(ulMatch[1]) + '</li>');
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
          htmlParts.push('<ol dir="' + detectBlockDir(olMatch[2]) + '"' + (startNum > 1 ? ' start="' + startNum + '"' : '') + '>');
          listType = 'ol';
        }
        htmlParts.push('<li dir="auto">' + formatInline(olMatch[2]) + '</li>');
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

  function summarizeReasoningSnippet(raw) {
    var lines = String(raw || '').split(/\\r?\\n/);
    for (var i = lines.length - 1; i >= 0; i--) {
      var clean = lines[i]
        .replace(/^\\s*#{1,6}\\s+/, '')
        .replace(/^\\s*[-*+•>]+\\s+/, '')
        .replace(/[*_\`~]/g, '')
        .trim();
      if (clean.length > 0) {
        return clean.length > 90 ? (clean.slice(0, 90) + '…') : clean;
      }
    }
    return '';
  }

  function countWordsApprox(raw) {
    var trimmed = String(raw || '').trim();
    if (!trimmed) return 0;
    return trimmed.split(/\\s+/).length;
  }

  function renderReasoningCardHtml(reasoningText, cardKey, isLiveThinking) {
    if (!reasoningText || !reasoningText.trim()) return '';
    state.reasoningByKey[cardKey] = reasoningText;
    var toggled = state.userToggledReasoning[cardKey];
    var isOpen = toggled !== undefined ? toggled : !!isLiveThinking;
    var snippet = summarizeReasoningSnippet(reasoningText);
    var wordCount = countWordsApprox(reasoningText);
    var titleText = isLiveThinking ? 'در حال تفکر و استدلال...' : 'فرآیند تفکر و استدلال مدل';

    var html = '<div class="aras-collapse-card reasoning' + (isOpen ? ' open' : '') + '" data-reasoning-key="' + escapeHtml(cardKey) + '">';
    html += '<button type="button" class="aras-collapse-header" data-toggle-reasoning="' + escapeHtml(cardKey) + '">';
    html += '<span class="aras-reasoning-header-main">';
    html += '<span class="aras-thinking-icon' + (isLiveThinking ? ' active' : '') + '">' + BRAIN_ICON_SVG + '</span>';
    html += '<span class="aras-collapse-title"><span class="aras-reasoning-title-label">' + titleText + '</span></span>';
    html += '<span class="aras-reasoning-preview" dir="auto">' + (snippet ? ('— ' + escapeHtml(snippet)) : '') + '</span>';
    html += '</span>';
    html += '<span class="aras-reasoning-meta-chips">';
    html += '<span class="aras-reasoning-chip">' + toPersianNumber(wordCount) + ' واژه</span>';
    html += '<span class="aras-collapse-chevron">▾</span>';
    html += '</span>';
    html += '</button>';
    html += '<div class="aras-collapse-body">';
    html += '<div class="aras-reasoning-toolbar"><button type="button" class="aras-copy-msg-btn" data-copy-reasoning="' + escapeHtml(cardKey) + '" title="کپی متن تفکر مدل">' + COPY_ICON_SVG + '<span>کپی تفکر</span></button></div>';
    html += '<div class="aras-reasoning-scroll"><div class="aras-md aras-reasoning-md">' + renderMarkdown(reasoningText) + '</div></div>';
    html += '</div>';
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

    var delActiveBtn = document.getElementById('aras-delete-active-chat-btn');
    if (delActiveBtn) {
      delActiveBtn.style.display = state.currentSessionId ? 'inline-flex' : 'none';
      if (!state.currentSessionId && delActiveBtn.classList.contains('confirming')) {
        delActiveBtn.classList.remove('confirming');
        var lbl = delActiveBtn.querySelector('[data-del-label]');
        if (lbl) lbl.textContent = 'حذف';
      }
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
      state.rawTextById[item.id] = item.text || '';
      parts.push('<div class="aras-msg-row"><div class="aras-msg-user-wrap">');
      parts.push('<div class="aras-msg-user">');
      if (item.images && item.images.length > 0) {
        parts.push('<div class="aras-msg-images">');
        for (var im = 0; im < item.images.length; im++) {
          parts.push('<img src="' + escapeHtml(item.images[im].url) + '" alt="پیوست" />');
        }
        parts.push('</div>');
      }
      if (item.text) {
        parts.push('<div class="aras-msg-user-text" dir="auto">' + escapeHtml(item.text) + '</div>');
      }
      parts.push('</div>');
      if (item.text && item.text.trim()) {
        parts.push('<div class="aras-msg-user-actions"><button type="button" class="aras-copy-msg-btn" data-copy-msg="' + escapeHtml(item.id) + '" title="کپی متن پیام شما" aria-label="کپی متن پیام">' + COPY_ICON_SVG + '<span>کپی پیام</span></button></div>');
      }
      parts.push('</div></div>');
    } else if (item.kind === 'assistant') {
      state.rawTextById[item.id] = item.text || '';
      var modelLabel = (item.provider && item.model) ? (item.provider + ' / ' + item.model) : '';
      parts.push('<div class="aras-msg-row"><div class="aras-msg-assistant">');
      parts.push('<div class="aras-msg-meta"><span class="aras-msg-author"><span class="aras-msg-author-badge">' + SPARK_ICON_SVG + '</span><span>پاسخ دستیار ارس</span></span>' + (modelLabel ? ('<span class="aras-msg-meta-model">' + escapeHtml(modelLabel) + '</span>') : '') + '</div>');
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
      if (item.text && item.text.trim()) {
        parts.push('<div class="aras-msg-actions"><button type="button" class="aras-copy-msg-btn" data-copy-msg="' + escapeHtml(item.id) + '" title="کپی پاسخ دستیار" aria-label="کپی پاسخ دستیار">' + COPY_ICON_SVG + '<span>کپی پاسخ</span></button></div>');
      }
      parts.push('</div></div>');
    } else if (item.kind === 'error') {
      parts.push('<div class="aras-interactive-card" style="border-color:var(--danger);"><div class="aras-interactive-title" style="color:var(--danger);">خطا در اجرای درخواست</div><div style="font-size:13px;white-space:pre-wrap;unicode-bidi:plaintext;text-align:start;" dir="auto">' + escapeHtml(item.message) + '</div></div>');
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
          var activelyThinking = !ls.text;
          state.reasoningByKey[rKey] = ls.reasoning;
          var rCard = rWrap.querySelector('.aras-collapse-card.reasoning');
          if (!rCard) {
            rWrap.innerHTML = renderReasoningCardHtml(ls.reasoning, rKey, activelyThinking);
            rCard = rWrap.querySelector('.aras-collapse-card.reasoning');
          } else {
            var rMdEl = rCard.querySelector('.aras-reasoning-md');
            if (rMdEl && rMdEl._lastRawReasoning !== ls.reasoning) {
              rMdEl._lastRawReasoning = ls.reasoning;
              rMdEl.innerHTML = renderMarkdown(ls.reasoning);
              var rScrollEl = rCard.querySelector('.aras-reasoning-scroll');
              if (rScrollEl && activelyThinking) {
                rScrollEl.scrollTop = rScrollEl.scrollHeight;
              }
            }
            var prevEl = rCard.querySelector('.aras-reasoning-preview');
            if (prevEl) {
              var snip = summarizeReasoningSnippet(ls.reasoning);
              prevEl.textContent = snip ? ('— ' + snip) : '';
            }
            var chipEl = rCard.querySelector('.aras-reasoning-chip');
            if (chipEl) {
              chipEl.textContent = toPersianNumber(countWordsApprox(ls.reasoning)) + ' واژه';
            }
            var lblEl = rCard.querySelector('.aras-reasoning-title-label');
            if (lblEl) {
              lblEl.textContent = activelyThinking ? 'در حال تفکر و استدلال...' : 'فرآیند تفکر و استدلال مدل';
            }
            var iconEl = rCard.querySelector('.aras-thinking-icon');
            if (iconEl) {
              iconEl.classList.toggle('active', activelyThinking);
            }
            var userToggled = state.userToggledReasoning[rKey];
            var shouldOpen = userToggled !== undefined ? userToggled : activelyThinking;
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
    var delAllBtn = document.getElementById('aras-delete-all-sessions-btn');
    if (!box) return;
    try {
      var res = await apiFetch('/aras-api/sessions');
      state.sessionsList = res.sessions || [];
      if (delAllBtn) {
        delAllBtn.style.display = state.sessionsList.length > 0 ? 'inline-flex' : 'none';
        delAllBtn.removeAttribute('data-confirming');
        delAllBtn.textContent = 'حذف همه گفتگوها';
      }
      if (state.sessionsList.length === 0) {
        box.innerHTML = '<div style="color:var(--text-secondary);padding:24px;text-align:center;">هنوز گفتگویی ثبت نشده است. از بخش «گفتگوی جدید» شروع کنید.</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < state.sessionsList.length; i++) {
        var s = state.sessionsList[i];
        var dateStr = new Date(s.createdAt).toLocaleString('fa-IR');
        html += '<div class="aras-session-item" data-open-session="' + escapeHtml(s.id) + '">';
        html += '<div class="aras-session-item-info"><div class="aras-session-item-title" dir="auto">' + escapeHtml(s.title) + '</div><div style="font-size:12px;color:var(--text-muted);">' + escapeHtml(dateStr) + ' • <span style="direction:ltr;unicode-bidi:isolate;">' + escapeHtml(s.cwd) + '</span></div></div>';
        html += '<div class="aras-session-actions">';
        html += '<span class="aras-badge ' + (s.status === 'running' ? 'running' : 'completed') + '">' + (s.status === 'running' ? 'در حال اجرا' : 'آماده') + '</span>';
        html += '<button type="button" class="aras-session-delete-btn" data-delete-session="' + escapeHtml(s.id) + '" title="حذف این گفتگو" aria-label="حذف این گفتگو">' + TRASH_ICON_SVG + '</button>';
        html += '</div></div>';
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
      html += '<div style="font-weight:700;font-size:13px;">ارائه‌دهندگان ثبت‌شده (هر درگاهی با هر Base URL):</div>';
      for (var p = 0; p < snap.customProviders.length; p++) {
        var cp = snap.customProviders[p];
        var modelNames = (cp.models || []).map(function (x) { return x.id; }).join(', ');
        var endpointText = cp.baseURL || 'پیش‌فرض کاتالوگ';
        var healthBadge = cp.serviceable
          ? '<span class="aras-provider-badge ok" title="مدل‌های این مسیر در فهرست مدل‌ها فعال است">فعال</span>'
          : '<span class="aras-provider-badge bad" title="' + escapeHtml(cp.problem || 'هیچ مدلی برای این مسیر بارگذاری نشد') + '">بدون مدل</span>';
        html += '<div class="aras-cred-row">';
        html += '<div style="min-width:0;">';
        html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><strong>' + escapeHtml(cp.displayName) + '</strong> <code class="aras-tool-name-code">' + escapeHtml(cp.id) + '</code> ' + healthBadge + '</div>';
        html += '<div style="font-size:12px;color:var(--text-secondary);direction:ltr;text-align:right;word-break:break-all;">' + escapeHtml(cp.api || 'catalog-default') + ' • ' + escapeHtml(endpointText) + (modelNames ? ' • models: ' + escapeHtml(modelNames) : '') + '</div>';
        if (cp.problem) {
          html += '<div style="font-size:11.5px;color:var(--warning);margin-top:2px;" dir="auto">' + escapeHtml(cp.problem) + '</div>';
        }
        html += '</div>';
        html += '<div style="display:flex;gap:6px;flex-shrink:0;">';
        html += '<button type="button" class="aras-btn" data-edit-provider="' + escapeHtml(cp.id) + '">ویرایش</button>';
        html += '<button type="button" class="aras-btn danger" data-remove-provider="' + escapeHtml(cp.id) + '">حذف درگاه</button>';
        html += '</div>';
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
    html += '<div style="font-weight:700;font-size:13px;margin-bottom:4px;">افزودن یا ویرایش ارائه‌دهنده با Base URL دلخواه</div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;" dir="auto">هر درگاهی که با پروتکل OpenAI/Anthropic سازگار باشد پذیرفته می‌شود: Ollama یا vLLM روی شبکه محلی، درگاه سازمانی، Azure، OpenRouter، یا آینه منطقه‌ای. ';
    html += 'برای مسیرهای استاندارد (openrouter / openai / google / anthropic / groq / xai / mistral / together) می‌توانید پروتکل و Base URL را خالی بگذارید تا از کاتالوگ نصب‌شده استفاده شود؛ ';
    html += 'برای هر نام دلخواه دیگر، پروتکل، Base URL و فهرست مدل‌ها الزامی است.</div>';

    var pt = snap.supportedProtocols || ['openai-completions', 'openai-responses', 'anthropic-messages'];
    html += '<div class="aras-form-grid">';
    html += '<div class="aras-field"><label>شناسه مسیر (حروف کوچک، عدد، خط تیره)</label><input id="aras-cp-id" class="aras-input ltr" placeholder="my-gateway" autocomplete="off" /></div>';
    html += '<div class="aras-field"><label>نام نمایشی</label><input id="aras-cp-name" class="aras-input" placeholder="درگاه سازمانی / Ollama محلی" /></div>';
    html += '<div class="aras-field"><label>پروتکل API</label><select id="aras-cp-api" class="aras-select ltr"><option value="">خودکار از کاتالوگ (فقط مسیرهای استاندارد)</option>';
    for (var pi = 0; pi < pt.length; pi++) {
      html += '<option value="' + escapeHtml(pt[pi]) + '">' + escapeHtml(pt[pi]) + '</option>';
    }
    html += '</select></div>';
    html += '<div class="aras-field"><label>نشانی Base URL (هر میزبان و پورتی)</label>';
    html += '<input id="aras-cp-url" class="aras-input ltr" placeholder="http://192.168.1.50:8000/v1" list="aras-cp-url-presets" autocomplete="off" />';
    html += '<datalist id="aras-cp-url-presets">';
    html += '<option value="http://127.0.0.1:11434/v1">Ollama (محلی)</option>';
    html += '<option value="http://127.0.0.1:8000/v1">vLLM / LM Studio (محلی)</option>';
    html += '<option value="https://openrouter.ai/api/v1">OpenRouter</option>';
    html += '<option value="https://api.openai.com/v1">OpenAI</option>';
    html += '<option value="https://api.anthropic.com">Anthropic</option>';
    html += '<option value="https://api.groq.com/openai/v1">Groq</option>';
    html += '<option value="https://generativelanguage.googleapis.com/v1beta/openai">Google Gemini (سازگار با OpenAI)</option>';
    html += '<option value="https://api.deepseek.com">DeepSeek</option>';
    html += '</datalist></div>';
    html += '<div class="aras-field"><label>نام متغیر کلید API</label><input id="aras-cp-keyenv" class="aras-input ltr" placeholder="MY_GATEWAY_API_KEY" autocomplete="off" /></div>';
    html += '<div class="aras-field"><label>فهرست مدل‌ها با کاما (برای مسیر دلخواه الزامی)</label><input id="aras-cp-models" class="aras-input ltr" placeholder="qwen2.5-72b, llama-3.3-70b" autocomplete="off" /></div>';
    html += '<div class="aras-field"><label>هدایتگرهای سفارشی HTTP به‌صورت JSON (اختیاری)</label><input id="aras-cp-headers" class="aras-input ltr" placeholder="{&quot;X-Title&quot;:&quot;Aras&quot;}" autocomplete="off" /></div>';
    html += '</div>';

    html += '<details class="aras-cp-advanced"><summary>تنظیمات پیشرفته مسیر (پنجره زمینه، سقف خروجی، ورودی‌های تصویری)</summary>';
    html += '<div class="aras-form-grid">';
    html += '<div class="aras-field"><label>پنجره زمینه پیش‌فرض (توکن)</label><input id="aras-cp-ctx" class="aras-input ltr" placeholder="مثلاً 32768" inputmode="numeric" /></div>';
    html += '<div class="aras-field"><label>سقف توکن خروجی پیش‌فرض</label><input id="aras-cp-maxtok" class="aras-input ltr" placeholder="مثلاً 4096" inputmode="numeric" /></div>';
    html += '<div class="aras-field"><label>ورودی مدل‌ها</label><select id="aras-cp-input" class="aras-select"><option value="">پیش‌فرض (فقط متن)</option><option value="text,image">متن و تصویر (مدل‌های بینایی)</option></select></div>';
    html += '</div></details>';

    html += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">';
    html += '<button type="button" class="aras-btn primary" id="aras-save-cp-btn">ثبت ارائه‌دهنده</button>';
    html += '<button type="button" class="aras-btn" id="aras-reset-cp-btn" style="display:none;">انصراف از ویرایش</button>';
    html += '</div>';
    html += '</div></div>';

    /* 4. Outbound Network, Proxy & 403 Diagnostics Card */
    var net = snap.network || { mode: 'auto', customProxyUrl: '', noProxy: 'localhost,127.0.0.1,::1,[::1]', effectiveProxyUrl: null, effectiveSource: 'none' };
    var sourceLabel = net.effectiveSource === 'custom'
      ? 'پراکسی دستی'
      : net.effectiveSource === 'windows-registry'
        ? 'پراکسی سیستم ویندوز (VPN)'
        : net.effectiveSource === 'env'
          ? 'متغیر محیطی سیستم'
          : 'اتصال مستقیم (بدون پراکسی)';
    html += '<div class="aras-card">';
    html += '<div class="aras-card-title">شبکه، پراکسی خروجی و رفع خطای ۴۰۳</div>';
    html += '<div class="aras-card-desc">در صورت مشاهده خطای <code class="aras-tool-name-code">403 Forbidden</code> (تحریم IP و نیاز به پورت VPN) یا <code class="aras-tool-name-code">403 Access denied by security policy</code> (پراکسی سازمانی محدودکننده)، نحوه اتصال خروجی Node.js را بدون نیاز به ری‌استارت تنظیم کنید.</div>';
    html += '<div style="padding:10px 13px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--border-subtle);font-size:12.5px;display:flex;flex-direction:column;gap:4px;">';
    html += '<div><strong>مسیر فعال فعلی:</strong> ' + escapeHtml(sourceLabel) + (net.effectiveProxyUrl ? (' — <code class="aras-tool-name-code">' + escapeHtml(net.effectiveProxyUrl) + '</code>') : '') + '</div>';
    if (net.windowsSystemProxy) {
      html += '<div style="color:var(--text-secondary);">پراکسی تشخیص‌داده‌شده در ویندوز: <code class="aras-tool-name-code">' + escapeHtml(net.windowsSystemProxy) + '</code></div>';
    }
    if (net.warning) {
      html += '<div style="color:var(--warning);">' + escapeHtml(net.warning) + '</div>';
    }
    html += '</div>';
    html += '<div class="aras-form-grid">';
    html += '<div class="aras-field"><label>حالت مسیردهی شبکه خروجی</label><select id="aras-net-mode" class="aras-select">';
    html += '<option value="auto"' + (net.mode === 'auto' ? ' selected' : '') + '>تشخیص خودکار (پراکسی محیطی / VPN سیستم ویندوز)</option>';
    html += '<option value="direct"' + (net.mode === 'direct' ? ' selected' : '') + '>اتصال مستقیم بدون پراکسی (رفع ۴۰۳ پراکسی سازمانی)</option>';
    html += '<option value="custom"' + (net.mode === 'custom' ? ' selected' : '') + '>پراکسی دستی HTTP/HTTPS (پورت VPN محلی)</option>';
    html += '</select></div>';
    html += '<div class="aras-field"><label>نشانی پراکسی دستی (مثال: 127.0.0.1:10809 یا http://127.0.0.1:7890)</label><input id="aras-net-proxy" class="aras-input ltr" value="' + escapeHtml(net.customProxyUrl || '') + '" placeholder="http://127.0.0.1:10809" /></div>';
    html += '<div class="aras-field"><label>استثناهای بدون پراکسی (NO_PROXY)</label><input id="aras-net-noproxy" class="aras-input ltr" value="' + escapeHtml(net.noProxy || 'localhost,127.0.0.1,::1,[::1]') + '" /></div>';
    html += '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
    html += '<button type="button" class="aras-btn primary" id="aras-save-network-btn">ذخیره و اعمال آنی شبکه</button>';
    html += '</div>';
    html += '<div style="border-top:1px solid var(--border-subtle);padding-top:12px;margin-top:4px;display:flex;flex-direction:column;gap:8px;">';
    html += '<div style="font-size:12.5px;font-weight:700;">تست زنده اتصال به درگاه‌های هوش مصنوعی (بررسی ۴۰۳ و پینگ)</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">';
    html += '<select id="aras-net-test-target" class="aras-select ltr" style="flex:1;min-width:240px;">';
    html += '<option value="https://api.deepseek.com/models">DeepSeek Official (https://api.deepseek.com/models)</option>';
    html += '<option value="https://openrouter.ai/api/v1/models">OpenRouter (https://openrouter.ai/api/v1/models)</option>';
    html += '<option value="https://generativelanguage.googleapis.com/">Google Gemini (https://generativelanguage.googleapis.com/)</option>';
    html += '<option value="https://api.openai.com/v1/models">OpenAI (https://api.openai.com/v1/models)</option>';
    html += '<option value="https://api.groq.com/openai/v1/models">Groq (https://api.groq.com/openai/v1/models)</option>';
    html += '</select>';
    html += '<button type="button" class="aras-btn" id="aras-test-network-btn">تست اتصال اکنون</button>';
    html += '</div>';
    html += '<div id="aras-net-test-output" style="display:none;padding:10px 12px;border-radius:9px;font-size:12.5px;" dir="auto"></div>';
    html += '</div></div>';

    /* 5. Permissions & Workspace Directory Card */
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
    if (state._eventSource) {
      try { state._eventSource.close(); } catch (_e) {}
      state._eventSource = null;
    }
    var es = new EventSource('/aras-api/stream');
    state._eventSource = es;
    es.onmessage = function (ev) {
      if (state._eventSource !== es) return;
      var data;
      try { data = JSON.parse(ev.data); } catch (_e) { return; }
      handleServerEvent(data);
    };
    es.onerror = function () {
      if (state._eventSource !== es) return;
      es.close();
      state._eventSource = null;
      setTimeout(connectEventStream, 2000);
    };
  }

  function handleServerEvent(ev) {
    if (!ev || !ev.type) return;

    if (ev.type === 'ready') {
      if (state._sseConnectedOnce && state.currentSessionId) {
        /* Resync active session after a transient SSE reconnect so zero chunks/items drift */
        apiFetch('/aras-api/sessions/' + encodeURIComponent(state.currentSessionId)).then(function (detail) {
          if (state.currentSessionId === detail.session.id) {
            state.currentSessionTitle = detail.session.title || state.currentSessionTitle;
            state.sessionStatus = detail.session.status || 'idle';
            state.items = detail.items || [];
            state.liveStream = detail.liveStream || null;
            state.pendingApprovals = detail.pendingApprovals || [];
            state.pendingQuestions = detail.pendingQuestions || [];
            renderChatSurface(false);
          }
        }).catch(function () {});
      }
      state._sseConnectedOnce = true;
      return;
    }

    if (ev.type === 'session.deleted' && ev.sessionId) {
      state.sessionsList = state.sessionsList.filter(function (s) { return s.id !== ev.sessionId; });
      if (state.currentSessionId === ev.sessionId) {
        startFreshChatView();
      } else if (state.activeTab === 'chats') {
        loadSessionsList();
      }
      return;
    }

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

    var copyMsgBtn = target.closest('[data-copy-msg]');
    if (copyMsgBtn) {
      var msgId = copyMsgBtn.getAttribute('data-copy-msg') || '';
      var msgRaw = state.rawTextById[msgId] || '';
      copyTextWithFeedback(msgRaw, copyMsgBtn, 'کپی شد');
      return;
    }

    var copyReasoningBtn = target.closest('[data-copy-reasoning]');
    if (copyReasoningBtn) {
      ev.stopPropagation();
      var rCopyKey = copyReasoningBtn.getAttribute('data-copy-reasoning') || '';
      var rRaw = state.reasoningByKey[rCopyKey] || '';
      copyTextWithFeedback(rRaw, copyReasoningBtn, 'کپی شد');
      return;
    }

    var copyCodeBtn = target.closest('[data-copy-code]');
    if (copyCodeBtn) {
      var codeWrap = copyCodeBtn.closest('.aras-code-block');
      var codeNode = codeWrap ? codeWrap.querySelector('code') : null;
      var rawCode = codeNode ? (codeNode.textContent || '') : '';
      copyTextWithFeedback(rawCode, copyCodeBtn, 'کپی شد');
      return;
    }

    var delActiveBtn = target.closest('#aras-delete-active-chat-btn');
    if (delActiveBtn && state.currentSessionId) {
      var delLbl = delActiveBtn.querySelector('[data-del-label]');
      if (!delActiveBtn.classList.contains('confirming')) {
        delActiveBtn.classList.add('confirming');
        if (delLbl) delLbl.textContent = 'تأیید حذف؟';
        clearTimeout(delActiveBtn._confirmTimer);
        delActiveBtn._confirmTimer = setTimeout(function () {
          delActiveBtn.classList.remove('confirming');
          if (delLbl) delLbl.textContent = 'حذف';
        }, 3500);
        return;
      }
      clearTimeout(delActiveBtn._confirmTimer);
      delActiveBtn.classList.remove('confirming');
      if (delLbl) delLbl.textContent = 'حذف';
      var activeIdToDel = state.currentSessionId;
      try {
        await apiFetch('/aras-api/sessions/' + encodeURIComponent(activeIdToDel), { method: 'DELETE' });
        startFreshChatView();
        showToast('گفتگو با موفقیت حذف شد.');
      } catch (err) {
        showToast(err.message || 'خطا در حذف گفتگو');
      }
      return;
    }

    var delSessBtn = target.closest('[data-delete-session]');
    if (delSessBtn) {
      ev.stopPropagation();
      var delId = delSessBtn.getAttribute('data-delete-session');
      if (!delId) return;
      try {
        await apiFetch('/aras-api/sessions/' + encodeURIComponent(delId), { method: 'DELETE' });
        if (state.currentSessionId === delId) {
          startFreshChatView();
        }
        await loadSessionsList();
        showToast('گفتگو حذف شد.');
      } catch (err) {
        showToast(err.message || 'خطا در حذف گفتگو');
      }
      return;
    }

    var delAllBtn = target.closest('#aras-delete-all-sessions-btn');
    if (delAllBtn) {
      if (delAllBtn.getAttribute('data-confirming') !== '1') {
        delAllBtn.setAttribute('data-confirming', '1');
        delAllBtn.textContent = 'تأیید حذف همه گفتگوها؟';
        clearTimeout(delAllBtn._confirmTimer);
        delAllBtn._confirmTimer = setTimeout(function () {
          delAllBtn.removeAttribute('data-confirming');
          delAllBtn.textContent = 'حذف همه گفتگوها';
        }, 4000);
        return;
      }
      clearTimeout(delAllBtn._confirmTimer);
      delAllBtn.removeAttribute('data-confirming');
      delAllBtn.textContent = 'حذف همه گفتگوها';
      try {
        await apiFetch('/aras-api/sessions', { method: 'DELETE' });
        if (state.currentSessionId) {
          startFreshChatView();
          state.activeTab = 'chats';
          syncNavigationUI();
        }
        await loadSessionsList();
        showToast('تمام گفتگوهای پیشین حذف شدند.');
      } catch (err) {
        showToast(err.message || 'خطا در حذف گفتگوها');
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
      var cpHeaders = document.getElementById('aras-cp-headers');
      var cpCtx = document.getElementById('aras-cp-ctx');
      var cpMaxTok = document.getElementById('aras-cp-maxtok');
      var cpInput = document.getElementById('aras-cp-input');

      var modelList = [];
      if (cpModels && cpModels.value.trim()) {
        var parts = cpModels.value.split(',');
        for (var mi = 0; mi < parts.length; mi++) {
          var mid = parts[mi].trim();
          if (mid && modelList.indexOf(mid) === -1) modelList.push(mid);
        }
      }

      var headerMap = null;
      if (cpHeaders && cpHeaders.value.trim()) {
        try {
          var parsedHeaders = JSON.parse(cpHeaders.value);
          if (!parsedHeaders || typeof parsedHeaders !== 'object' || Array.isArray(parsedHeaders)) {
            throw new Error('bad shape');
          }
          headerMap = parsedHeaders;
        } catch (_e) {
          showToast('هدایتگرها باید یک شیء JSON معتبر باشند، مثلاً {"X-Title":"Aras"}');
          return;
        }
      }

      var ctxNum = cpCtx && cpCtx.value.trim() ? Number(cpCtx.value.trim()) : 0;
      var maxTokNum = cpMaxTok && cpMaxTok.value.trim() ? Number(cpMaxTok.value.trim()) : 0;
      var inputList = cpInput && cpInput.value.trim()
        ? cpInput.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean)
        : [];

      var payload = {
        id: cpId ? cpId.value.trim() : '',
        displayName: cpName ? cpName.value.trim() : '',
        api: cpApi ? cpApi.value : '',
        baseURL: cpUrl ? cpUrl.value.trim() : '',
        apiKeyEnv: cpKey ? cpKey.value.trim() : '',
        models: modelList
      };
      if (headerMap) payload.headers = headerMap;
      if (ctxNum > 0) payload.defaultContextWindow = ctxNum;
      if (maxTokNum > 0) payload.defaultMaxTokens = maxTokNum;
      if (inputList.length > 0) payload.defaultInput = inputList;

      try {
        await apiFetch('/aras-api/settings/providers/custom', { method: 'POST', body: payload });
        showToast('ارائه‌دهنده با موفقیت ذخیره و اعمال شد.');
        state.editingProvider = null;
        await loadSettings();
      } catch (err) {
        showToast(err.message || 'ثبت ارائه‌دهنده انجام نشد.');
      }
      return;
    }

    if (target.closest('#aras-reset-cp-btn')) {
      state.editingProvider = null;
      await loadSettings();
      return;
    }

    var editProv = target.closest('[data-edit-provider]');
    if (editProv) {
      var editId = editProv.getAttribute('data-edit-provider') || '';
      var snapTarget = state.settings;
      var profile = null;
      if (snapTarget && snapTarget.customProviders) {
        for (var spi = 0; spi < snapTarget.customProviders.length; spi++) {
          if (snapTarget.customProviders[spi].id === editId) { profile = snapTarget.customProviders[spi]; break; }
        }
      }
      if (!profile) return;
      state.editingProvider = editId;
      var setVal = function (id, value) {
        var el = document.getElementById(id);
        if (el) el.value = value;
      };
      setVal('aras-cp-id', profile.id);
      setVal('aras-cp-name', profile.displayName || '');
      setVal('aras-cp-api', profile.api || '');
      setVal('aras-cp-url', profile.baseURL || '');
      setVal('aras-cp-keyenv', profile.apiKeyEnv || '');
      setVal('aras-cp-models', (profile.models || []).map(function (m) { return m.id; }).join(', '));
      setVal('aras-cp-headers', profile.headers && Object.keys(profile.headers).length
        ? JSON.stringify(profile.headers)
        : '');
      setVal('aras-cp-ctx', profile.defaultContextWindow ? String(profile.defaultContextWindow) : '');
      setVal('aras-cp-maxtok', profile.defaultMaxTokens ? String(profile.defaultMaxTokens) : '');
      setVal('aras-cp-input', profile.defaultInput && profile.defaultInput.length
        ? profile.defaultInput.join(',')
        : '');
      var resetBtn = document.getElementById('aras-reset-cp-btn');
      if (resetBtn) resetBtn.style.display = '';
      var idField = document.getElementById('aras-cp-id');
      if (idField) idField.readOnly = true;
      showToast('فیلدها برای ویرایش ارائه‌دهنده «' + (profile.displayName || editId) + '» بارگذاری شد.');
      var card = document.getElementById('aras-cp-id');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

    if (target.closest('#aras-save-network-btn')) {
      var netModeEl = document.getElementById('aras-net-mode');
      var netProxyEl = document.getElementById('aras-net-proxy');
      var netNoProxyEl = document.getElementById('aras-net-noproxy');
      try {
        await apiFetch('/aras-api/settings/network', {
          method: 'POST',
          body: {
            mode: netModeEl ? netModeEl.value : 'auto',
            customProxyUrl: netProxyEl ? netProxyEl.value.trim() : '',
            noProxy: netNoProxyEl ? netNoProxyEl.value.trim() : ''
          }
        });
        showToast('تنظیمات شبکه و پراکسی ذخیره و بلافاصله اعمال شد.');
        await loadSettings();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }

    var testNetBtn = target.closest('#aras-test-network-btn');
    if (testNetBtn) {
      var targetSel = document.getElementById('aras-net-test-target');
      var outBox = document.getElementById('aras-net-test-output');
      var origLabel = testNetBtn.textContent;
      testNetBtn.textContent = 'در حال بررسی...';
      testNetBtn.disabled = true;
      if (outBox) {
        outBox.style.display = 'block';
        outBox.style.background = 'var(--bg-elevated)';
        outBox.style.color = 'var(--text-secondary)';
        outBox.textContent = 'در حال تست اتصال به سرور مقصد...';
      }
      try {
        var diag = await apiFetch('/aras-api/settings/network/test', {
          method: 'POST',
          body: { targetUrl: targetSel ? targetSel.value : '' }
        });
        if (outBox) {
          outBox.style.display = 'block';
          outBox.style.background = diag.reachable ? 'var(--success-soft)' : 'var(--danger-soft)';
          outBox.style.color = diag.reachable ? 'var(--success)' : 'var(--danger)';
          outBox.textContent = diag.summary;
        }
      } catch (err) {
        if (outBox) {
          outBox.style.display = 'block';
          outBox.style.background = 'var(--danger-soft)';
          outBox.style.color = 'var(--danger)';
          outBox.textContent = err.message || 'خطا در تست اتصال';
        }
      } finally {
        testNetBtn.textContent = origLabel;
        testNetBtn.disabled = false;
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
    /* Unregister any leftover Service Workers from other apps previously run on the same port */
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        for (var i = 0; i < regs.length; i++) {
          regs[i].unregister().catch(function () {});
        }
      }).catch(function () {});
    }

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
