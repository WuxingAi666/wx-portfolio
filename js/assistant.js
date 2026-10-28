/* Streaming portfolio assistant. All visitor/model text uses DOM text nodes.
 * Model secrets live exclusively in the backend environment.
 */
(function () {
  "use strict";
  const config = window.PORTFOLIO_ASSISTANT_CONFIG || {};
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const github = location.hostname.endsWith(".github.io");
  const base = (config.apiBase || (local ? "http://127.0.0.1:8010" : github ? "" : location.origin)).replace(/\/+$/, "");
  const storageKey = "wx-portfolio-chat-v2";
  const assistantName = "仵星的RAG问答助手";
  const launcherName = "问问仵星的RAG问答助手";
  const compactScreen = matchMedia("(max-width:600px)");
  const robot = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 3v4M8 12h1m6 0h1M8 16h8M1 11v5m22-5v5"/><circle cx="12" cy="3" r="1"/></svg>';
  const sendIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v15"/></svg>';
  const launcher = document.createElement("button");
  launcher.className = "pa-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "打开" + launcherName);
  launcher.title = "点击打开，拖动可调整入口位置";
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "pa-panel");
  launcher.innerHTML = robot + '<span class="pa-launcher-copy"><strong>' + launcherName + '</strong><small>项目、实习、技术方案 · 点此提问</small></span><i class="pa-launcher-dot" aria-hidden="true"></i>';
  const panel = document.createElement("aside");
  panel.id = "pa-panel";
  panel.className = "pa-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", assistantName);
  panel.innerHTML = [
    '<header class="pa-header">',
    '<div class="pa-header-main" title="拖动标题栏移动，双击展开或还原"><div class="pa-avatar" aria-hidden="true">仵</div>',
    '<div class="pa-heading" tabindex="0" aria-label="助手标题栏：方向键移动，Home 键复位，Enter 键展开或还原"><h2>' + assistantName + '</h2><span class="pa-state">基于公开资料 · 回答附来源</span></div>',
    '<div class="pa-window-actions"><button type="button" class="pa-icon-btn pa-expand" aria-label="放大助手窗口" title="放大窗口" aria-pressed="false"></button>',
    '<button type="button" class="pa-icon-btn pa-close" aria-label="最小化助手" title="最小化，保留对话"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 10h12"/></svg></button></div></div></header>',
    '<div class="pa-toolbar"><button type="button" class="pa-inspire" aria-expanded="false">✦ 提问灵感</button><div class="pa-tools">',
    '<button type="button" class="pa-clear" aria-label="开始新对话">＋ 新对话</button>',
    '<details class="pa-menu"><summary aria-label="更多对话设置" title="更多操作">···</summary><div class="pa-menu-content">',
    '<button type="button" class="pa-export">导出已完成对话 .md</button><button type="button" class="pa-font" aria-pressed="false">使用较大字号</button>',
    '<button type="button" class="pa-reset-window">恢复窗口位置与大小</button><button type="button" class="pa-reconnect">重新检查连接</button><p>对话与草稿仅存当前标签页，关闭标签页后不保留。</p></div></details></div></div>',
    '<div class="pa-chat-body"><div class="pa-messages" role="log" aria-label="聊天记录" aria-live="off"></div>',
    '<button type="button" class="pa-jump" hidden>回到最新 ↓</button></div>',
    '<p class="pa-status" role="status" aria-live="polite"></p>',
    '<form class="pa-compose"><div class="pa-input-wrap">',
    '<textarea class="pa-input" rows="1" maxlength="600" aria-label="输入想了解的问题" placeholder="想了解他的项目或实习经历？"></textarea>',
    '<button class="pa-send" type="submit" aria-label="发送问题">' + sendIcon + '</button></div>',
    '<div class="pa-compose-hint"><span class="pa-key-hint">Enter 发送 · Shift+Enter 换行</span><span class="pa-count">0 / 600</span></div>',
    '<div class="pa-foot"><span>AI 回答请结合来源核对</span><a href="#resume">完整简历 ↗</a></div></form>',
    ...["n", "e", "s", "w", "ne", "nw", "se", "sw"].map(edge => '<div class="pa-resize pa-resize-' + edge + '" data-pa-resize="' + edge + '" ' + (edge === "se" ? 'tabindex="0" role="button" aria-label="调整窗口大小：方向键调整，Home 键恢复默认大小"' : 'aria-hidden="true"') + '></div>')
  ].join("");
  document.body.append(launcher, panel);
  const messages = panel.querySelector(".pa-messages");
  const input = panel.querySelector(".pa-input");
  const form = panel.querySelector("form");
  const send = panel.querySelector(".pa-send");
  const state = panel.querySelector(".pa-state");
  const status = panel.querySelector(".pa-status");
  let entries = [], busy = false, controller = null, version = 0;
  let previousFocus = null;
  let expanded = false, expandedPosition = null;
  const panelSize = { width: 420, height: 680 };
  const expandButton = panel.querySelector(".pa-expand");
  function syncWindowMode() {
    panel.classList.toggle("is-expanded", expanded);
    expandButton.setAttribute("aria-label", expanded ? "还原助手小窗" : "放大助手窗口");
    expandButton.title = expanded ? "还原小窗" : "放大窗口";
    expandButton.setAttribute("aria-pressed", String(expanded));
    expandButton.innerHTML = expanded
      ? '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M7 7V4h9v9h-3"/><rect x="4" y="7" width="9" height="9" rx="1"/></svg>'
      : '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="1.5"/></svg>';
  }
  // Store launcher and window positions separately; mobile chat always fills the screen.
  const floatingPositions = new Map();
  function placeFloating(element, position) {
    if (element.hidden || (element === panel && compactScreen.matches)) return;
    const bounds = element.getBoundingClientRect();
    const inset = 12;
    const x = Math.max(inset, Math.min(position.x, innerWidth - bounds.width - inset));
    const y = Math.max(inset, Math.min(position.y, innerHeight - bounds.height - inset));
    element.style.left = x + "px";
    element.style.top = y + "px";
    element.style.right = "auto";
    element.style.bottom = "auto";
    if (element === panel && expanded) expandedPosition = { x, y };
    else floatingPositions.set(element, { x, y });
  }
  function resetPosition(element) {
    if (element === panel && expanded) expandedPosition = null;
    else floatingPositions.delete(element);
    ["left", "top", "right", "bottom"].forEach(name => element.style.removeProperty(name));
  }
  function layoutFloating() {
    if (compactScreen.matches) {
      ["left", "top", "right", "bottom", "width", "height"].forEach(name => panel.style.removeProperty(name));
    } else if (!panel.hidden) {
      const width = Math.min(expanded ? 960 : panelSize.width, innerWidth - 24);
      const height = Math.min(expanded ? 800 : panelSize.height, innerHeight - 24);
      panel.style.width = width + "px";
      panel.style.height = height + "px";
      if (expanded) placeFloating(panel, expandedPosition || { x: (innerWidth - width) / 2, y: (innerHeight - height) / 2 });
      else if (floatingPositions.has(panel)) placeFloating(panel, floatingPositions.get(panel));
      else ["left", "top", "right", "bottom"].forEach(name => panel.style.removeProperty(name));
    }
    if (floatingPositions.has(launcher)) placeFloating(launcher, floatingPositions.get(launcher));
  }
  function toggleExpanded() {
    if (compactScreen.matches) return;
    expanded = !expanded;
    expandedPosition = null;
    syncWindowMode(); layoutFloating();
  }
  function enableDrag(element, handle) {
    let gesture = null, suppressClickUntil = 0;
    function finish(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (gesture.moved) suppressClickUntil = performance.now() + 400;
      gesture = null;
      element.classList.remove("pa-is-dragging");
      document.documentElement.classList.remove("pa-drag-active");
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    }
    handle.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0 || (element === panel && compactScreen.matches)) return;
      // A new deliberate click must work immediately after a completed drag.
      suppressClickUntil = 0;
      if (element === panel && event.target.closest("button,a,input,textarea")) return;
      const bounds = element.getBoundingClientRect();
      gesture = { id: event.pointerId, startX: event.clientX, startY: event.clientY,
        x: bounds.x, y: bounds.y, moved: false };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", event => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY;
      if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
      gesture.moved = true;
      element.classList.add("pa-is-dragging");
      document.documentElement.classList.add("pa-drag-active");
      placeFloating(element, { x: gesture.x + dx, y: gesture.y + dy });
      event.preventDefault();
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => handle.addEventListener(name, finish));
    // Releasing a drag also fires click: suppress it so moving the launcher does not open it.
    handle.addEventListener("click", event => {
      if (event.detail > 0 && performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    return () => { if (gesture) finish({ pointerId: gesture.id }); };
  }
  const dragHandle = panel.querySelector(".pa-header-main");
  const cancelLauncherDrag = enableDrag(launcher, launcher);
  const cancelPanelDrag = enableDrag(panel, dragHandle);
  dragHandle.addEventListener("dblclick", event => {
    if (!event.target.closest("button")) toggleExpanded();
  });
  panel.querySelector(".pa-heading").addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleExpanded(); return; }
    if (event.key === "Home") {
      event.preventDefault(); resetPosition(panel); layoutFloating(); return;
    }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const bounds = panel.getBoundingClientRect(), step = event.shiftKey ? 40 : 16;
    placeFloating(panel, { x: bounds.x + direction[0] * step, y: bounds.y + direction[1] * step });
  });
  // Resize all eight edges; the opposite edge remains fixed and the window stays visible.
  let resizeGesture = null;
  function finishResize(event) {
    if (!resizeGesture || (event && event.pointerId !== resizeGesture.id)) return;
    const active = resizeGesture; resizeGesture = null;
    document.documentElement.classList.remove("pa-resize-active");
    panel.classList.remove("pa-is-resizing");
    if (active.handle.hasPointerCapture(active.id)) active.handle.releasePointerCapture(active.id);
  }
  panel.querySelectorAll("[data-pa-resize]").forEach(handle => {
    handle.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0 || compactScreen.matches || expanded) return;
      event.preventDefault();
      if (handle.tabIndex >= 0) handle.focus({ preventScroll: true });
      resizeGesture = { id: event.pointerId, handle, edge: handle.dataset.paResize,
        x: event.clientX, y: event.clientY, rect: panel.getBoundingClientRect() };
      handle.setPointerCapture(event.pointerId);
      document.documentElement.classList.add("pa-resize-active");
      panel.classList.add("pa-is-resizing");
    });
    handle.addEventListener("pointermove", event => {
      if (!resizeGesture || event.pointerId !== resizeGesture.id) return;
      const { edge, rect } = resizeGesture;
      const dx = event.clientX - resizeGesture.x, dy = event.clientY - resizeGesture.y;
      const minWidth = Math.min(340, innerWidth - 24), minHeight = Math.min(420, innerHeight - 24);
      let { left, right, top, bottom } = rect;
      const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
      if (edge.includes("e")) right = clamp(rect.right + dx, left + minWidth, Math.min(innerWidth - 12, left + 960));
      if (edge.includes("w")) left = clamp(rect.left + dx, Math.max(12, right - 960), right - minWidth);
      if (edge.includes("s")) bottom = clamp(rect.bottom + dy, top + minHeight, Math.min(innerHeight - 12, top + 860));
      if (edge.includes("n")) top = clamp(rect.top + dy, Math.max(12, bottom - 860), bottom - minHeight);
      panelSize.width = right - left; panelSize.height = bottom - top;
      panel.style.width = panelSize.width + "px"; panel.style.height = panelSize.height + "px";
      placeFloating(panel, { x: left, y: top });
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => handle.addEventListener(name, finishResize));
  });
  panel.querySelector(".pa-resize-se").addEventListener("keydown", event => {
    if (event.key === "Home") { event.preventDefault(); panelSize.width = 420; panelSize.height = 680; resetPosition(panel); layoutFloating(); return; }
    const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
    if (!delta) return;
    event.preventDefault();
    panelSize.width = Math.max(340, Math.min(960, panelSize.width + delta[0]));
    panelSize.height = Math.max(420, Math.min(860, panelSize.height + delta[1]));
    layoutFloating();
  });
  expandButton.addEventListener("click", toggleExpanded);
  syncWindowMode();
  window.addEventListener("resize", () => {
    cancelLauncherDrag(); cancelPanelDrag(); finishResize(); layoutFloating();
  });
  // Keep the composer above the on-screen keyboard on mobile browsers.
  function syncMobileViewport() {
    const viewport = window.visualViewport;
    if (viewport && compactScreen.matches) {
      panel.style.setProperty("--pa-viewport-height", viewport.height + "px");
      panel.style.setProperty("--pa-viewport-top", viewport.offsetTop + "px");
    } else {
      panel.style.removeProperty("--pa-viewport-height"); panel.style.removeProperty("--pa-viewport-top");
    }
  }
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", syncMobileViewport);
    visualViewport.addEventListener("scroll", syncMobileViewport);
  }
  window.addEventListener("resize", syncMobileViewport);
  syncMobileViewport();

  const draftKey = storageKey + '-draft';
  const preferencesKey = storageKey + '-preferences';
  const menu = panel.querySelector('.pa-menu');
  const jump = panel.querySelector('.pa-jump');
  const inspire = panel.querySelector('.pa-inspire');
  const exportButton = panel.querySelector('.pa-export');
  const fontButton = panel.querySelector('.pa-font');
  const clearButton = panel.querySelector('.pa-clear');
  const count = panel.querySelector('.pa-count');
  const topics = [
    { name: '快速了解', questions: ['用一分钟介绍仵星的背景、优势和求职方向。', '他有哪些可以体验或查看源码的项目？', '他获得过哪些奖项和奖学金？', '他的求职城市、到岗时间和联系方式是什么？'] },
    { name: '项目技术', questions: ['他的 RAG 项目从文档加载到流式回答如何实现？', '语音情感毕业设计如何融合声音与文本？目前有哪些局限？', 'BOSS 工具为什么改用浏览器用户脚本？遇到过什么困难？', '他的记账本实现了什么？数据保存在哪里？'] },
    { name: '实习交付', questions: ['他在央国企驻场实习中具体做了什么？', '客户提出需求后，他如何分析、复盘确认并推进上线？', '他如何结合 SQL、运行日志和回归测试解决问题？', '他有哪些面向管理层沟通与跨团队协作的经历？'] }
  ];
  let selectedTopic = 0, inspirationsOpen = false, followLatest = true;
  let healthPending = null, clearTimer = 0, clearArmed = false;
  let lastRandom = -1;

  function safeUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value, location.href);
      if (url.origin === 'https://wuxingai666.github.io' && url.pathname === '/wx-portfolio/' && url.hash) {
        return location.origin + location.pathname + url.hash;
      }
      if (['http:', 'https:'].includes(url.protocol) && [location.origin, 'https://wuxingai666.github.io'].includes(url.origin)) return url.href;
    } catch (_) { /* Invalid model URLs remain plain text. */ }
    return null;
  }
  function validSources(value) {
    return Array.isArray(value) ? value.filter(s => s && typeof s.id === 'string' && /^S\d+$/.test(s.id) && typeof s.title === 'string')
      .slice(0, 6).map(s => ({ id: s.id, title: s.title.slice(0, 180), url: safeUrl(s.url) || '', excerpt: typeof s.excerpt === 'string' ? s.excerpt.slice(0, 1000) : '' })) : [];
  }
  function persist() {
    // Keep a bounded transcript; only successful turns enter retrieval history.
    if (entries.length > 40) {
      entries = entries.slice(-40);
      const rows = [...messages.querySelectorAll('.pa-message:not(.is-error)')];
      rows.slice(0, Math.max(0, rows.length - 40)).forEach(row => row.remove());
    }
    try { sessionStorage.setItem(storageKey, JSON.stringify(entries)); } catch (_) { /* Chat still works without storage. */ }
    exportButton.disabled = !entries.some(item => item.role === 'assistant');
  }
  function syncJump() {
    jump.hidden = followLatest || !messages.querySelector('.pa-message');
    jump.textContent = busy ? '有新内容 · 回到最新 ↓' : '回到最新 ↓';
  }
  function scrollDown() {
    followLatest = true;
    messages.scrollTop = messages.scrollHeight;
    syncJump();
  }
  function setStatus(text, loading) {
    status.textContent = text;
    status.classList.toggle('is-busy', Boolean(loading));
  }
  function syncInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 116) + 'px';
    count.textContent = input.value.length + ' / 600';
    count.classList.toggle('is-near-limit', input.value.length >= 540);
    send.disabled = !busy && !input.value.trim();
    try { sessionStorage.setItem(draftKey, input.value); } catch (_) {}
  }
  function setBusy(value) {
    busy = value;
    panel.classList.toggle('is-busy', value);
    send.innerHTML = value ? '<span class="pa-stop-symbol" aria-hidden="true"></span>' : sendIcon;
    send.setAttribute('aria-label', value ? '停止生成' : '发送问题');
    send.title = value ? '停止本次回答' : '发送问题';
    input.setAttribute('aria-description', value ? '正在回答，可以先输入下一条问题；点击停止按钮结束生成。' : '最多600字，Enter发送，Shift加Enter换行。');
    launcher.querySelector('small').textContent = value ? '正在回答 · 点击继续查看' : '项目、实习、技术方案 · 点此提问';
    panel.querySelectorAll('.pa-regenerate,.pa-followup').forEach(button => { button.disabled = value; });
    syncInput();
    syncJump();
  }
  // A small safe text formatter: model output never becomes HTML.
  function renderText(bubble, text, sources) {
    bubble.replaceChildren();
    const rx = /\[S\d+\]|\*\*[^*\n]+\*\*|`[^`\n]+`/g;
    let end = 0, match;
    while ((match = rx.exec(text))) {
      bubble.append(document.createTextNode(text.slice(end, match.index)));
      if (match[0].startsWith('**') || match[0].startsWith('`')) {
        const bold = match[0].startsWith('**');
        const node = document.createElement(bold ? 'strong' : 'code');
        node.textContent = match[0].slice(bold ? 2 : 1, bold ? -2 : -1);
        bubble.append(node);
      } else {
        const source = sources.find(s => '[' + s.id + ']' === match[0]);
        const url = source && safeUrl(source.url);
        if (url) {
          const link = document.createElement('a'); link.href = url; link.textContent = match[0]; link.title = source.title;
          bubble.append(link);
        } else bubble.append(document.createTextNode(match[0]));
      }
      end = rx.lastIndex;
    }
    bubble.append(document.createTextNode(text.slice(end)));
  }
  function addSources(row, sources) {
    if (!sources.length) return;
    const details = document.createElement('details'); details.className = 'pa-sources';
    const summary = document.createElement('summary'); summary.textContent = '查看依据 · ' + sources.length + ' 条资料';
    details.append(summary);
    for (const source of sources) {
      const box = document.createElement('div'); box.className = 'pa-source';
      const href = safeUrl(source.url), title = document.createElement(href ? 'a' : 'span');
      if (href) title.href = href;
      title.textContent = '[' + source.id + '] ' + source.title;
      const excerpt = document.createElement('p'); excerpt.textContent = source.excerpt || '';
      box.append(title, excerpt); details.append(box);
    }
    row.append(details);
  }
  async function copyText(text, button) {
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (_) {
      const field = document.createElement('textarea'); field.value = text; field.className = 'pa-copy-buffer';
      panel.append(field); field.select();
      try { copied = document.execCommand('copy'); } catch (_) {}
      field.remove(); button.focus({ preventScroll: true });
    }
    if (!button.isConnected) return;
    const label = button.textContent;
    button.textContent = copied ? '已复制 ✓' : '复制失败';
    setStatus(copied ? '已复制到剪贴板。' : '浏览器未允许复制，可以选中文字手动复制。', false);
    setTimeout(() => { if (button.isConnected) button.textContent = label; }, 1800);
  }
  function addMessageActions(message, item, question) {
    const actions = document.createElement('div'); actions.className = 'pa-message-actions';
    const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = '复制';
    copy.setAttribute('aria-label', item.role === 'assistant' ? '复制这条回答' : '复制这条问题');
    copy.addEventListener('click', () => copyText(item.content, copy)); actions.append(copy);
    if (item.role === 'user') {
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '编辑问题';
      edit.addEventListener('click', () => { input.value = item.content; syncInput(); input.focus({ preventScroll: true }); }); actions.append(edit);
    } else if (question) {
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'pa-regenerate'; retry.textContent = '重新生成'; retry.disabled = busy;
      retry.addEventListener('click', () => {
        if (busy || entries[entries.length - 1] !== item) return;
        const lastUser = entries[entries.length - 2];
        if (!lastUser || lastUser.role !== 'user') return;
        const rows = [...messages.querySelectorAll('.pa-message:not(.is-error)')];
        rows.slice(-2).forEach(row => row.remove()); entries.splice(-2); persist(); ask(question, true);
      }); actions.append(retry);
    }
    message.row.append(actions);
  }
  function addMessage(role, text, sources) {
    const row = document.createElement('div'); row.className = 'pa-message pa-message-' + role;
    const label = document.createElement('div'); label.className = 'pa-label'; label.textContent = role === 'user' ? '你' : '仵星的 AI 助手';
    const bubble = document.createElement('div'); bubble.className = 'pa-bubble';
    renderText(bubble, text || '', sources || []); row.append(label, bubble); messages.append(row);
    return { row, bubble, label };
  }
  function syncRegenerate() {
    const buttons = [...messages.querySelectorAll('.pa-regenerate')];
    buttons.forEach((button, index) => { button.hidden = index !== buttons.length - 1; button.disabled = busy; });
  }
  function syncInspirations() {
    const welcome = messages.querySelector('.pa-welcome'); if (!welcome) return;
    welcome.hidden = entries.length > 0 && !inspirationsOpen;
    welcome.classList.toggle('is-compact', entries.length > 0);
    inspire.setAttribute('aria-expanded', String(!welcome.hidden));
    const tabs = welcome.querySelector('.pa-topics'); tabs.replaceChildren();
    topics.forEach((topic, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'pa-topic';
      button.textContent = topic.name; button.setAttribute('aria-pressed', String(index === selectedTopic));
      button.addEventListener('click', () => { selectedTopic = index; syncInspirations(); }); tabs.append(button);
    });
    const suggestions = welcome.querySelector('.pa-suggestions'); suggestions.replaceChildren();
    topics[selectedTopic].questions.forEach((question, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'pa-suggestion';
      const number = document.createElement('small'); number.textContent = '0' + (index + 1);
      const text = document.createElement('b'); text.textContent = question;
      const arrow = document.createElement('span'); arrow.textContent = '↗'; button.append(number, text, arrow);
      button.addEventListener('click', () => ask(question)); suggestions.append(button);
    });
  }
  function welcome() {
    messages.replaceChildren();
    const box = document.createElement('div'); box.className = 'pa-welcome';
    box.innerHTML = '<div class="pa-welcome-label">MEET WUXING · 作品集向导</div><h3>从一个问题，了解仵星。<span aria-hidden="true">✦</span></h3><p class="pa-welcome-intro">围绕项目、实习与业务交付，回答附上参考资料。</p><div class="pa-topics" aria-label="选择提问主题"></div><div class="pa-suggestions"></div><button type="button" class="pa-random">↻ 换一个有趣的问题</button><div class="pa-welcome-links"><a href="#proj">浏览项目 ↗</a><a href="#resume">完整简历 ↗</a></div><p class="pa-disclosure">回答由 AI 基于公开资料生成，可能有遗漏。问题和近期对话会交由模型服务处理，请勿提交敏感信息。</p>';
    box.querySelector('.pa-random').addEventListener('click', () => {
      const pool = topics.flatMap(topic => topic.questions);
      let index = Math.floor(Math.random() * pool.length);
      if (index === lastRandom) index = (index + 1) % pool.length;
      lastRandom = index; input.value = pool[index]; syncInput();
      input.focus({ preventScroll: true }); setStatus('已放入输入框，可以改写后发送。', false);
    });
    messages.append(box);
    for (let i = 0; i < entries.length; i++) {
      const item = entries[i], message = addMessage(item.role, item.content, item.sources || []);
      addSources(message.row, item.sources || []);
      addMessageActions(message, item, item.role === 'assistant' && i === entries.length - 1 ? entries[i - 1]?.content : null);
    }
    syncInspirations(); syncRegenerate(); persist();
    if (!base) { state.textContent = '在线问答尚未连接'; setStatus('在线问答准备中，可先浏览项目或完整简历。', false); }
    if (entries.length) scrollDown();
    else { messages.scrollTop = 0; followLatest = true; syncJump(); }
  }
  function history() {
    const selected = []; let length = 0;
    for (let i = entries.length - 1; i >= 0 && selected.length < 8; i--) {
      const item = entries[i], content = item.content.slice(0, 2000);
      if (length + content.length > 6000) break;
      length += content.length; selected.unshift({ role: item.role, content });
    }
    return selected;
  }
  async function readStream(response, onEvent) {
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    const dispatch = frame => {
      let kind = 'message'; const data = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) kind = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) onEvent(kind, JSON.parse(data.join('\n')));
    };
    try {
      for (;;) {
        const next = await reader.read();
        buffer += next.done ? decoder.decode() : decoder.decode(next.value, { stream: true });
        // Normalize after concatenation: CRLF may be split across network chunks.
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          dispatch(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2);
        }
        if (next.done) { if (buffer.trim()) dispatch(buffer); break; }
      }
    } finally { reader.releaseLock(); }
  }
  function addFollowups() {
    messages.querySelector('.pa-followups')?.remove();
    const box = document.createElement('div'); box.className = 'pa-followups';
    const label = document.createElement('span'); label.textContent = '还可以了解'; box.append(label);
    const questions = ['他在项目中如何处理异常和失败情况？', '他有哪些需求沟通与交付实践？', '他的求职方向和到岗安排是什么？'];
    questions.forEach(question => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'pa-followup'; button.textContent = question;
      button.addEventListener('click', () => ask(question)); box.append(button);
    }); messages.append(box);
  }
  async function ask(question, preserveDraft = false) {
    if (busy) return;
    question = question.trim();
    if (!question || question.length > 600) return;
    if (!base) { setStatus('在线问答暂未开放，可先浏览项目和完整简历。', false); return; }
    if (!navigator.onLine) { setStatus('网络已断开。输入草稿会保留，恢复连接后可再发送。', false); return; }
    disarmClear();
    const currentVersion = ++version, previousHistory = history();
    const user = { role: 'user', content: question };
    entries.push(user); inspirationsOpen = false;
    messages.querySelector('.pa-followups')?.remove(); syncInspirations();
    addMessageActions(addMessage('user', question), user);
    if (!preserveDraft) { input.value = ''; syncInput(); }
    const assistant = addMessage('assistant', ''); assistant.row.classList.add('is-streaming');
    assistant.bubble.textContent = '正在查阅公开资料…';
    setBusy(true); setStatus('正在检索参考资料…', true); scrollDown();
    const request = new AbortController(); controller = request;
    const timeout = setTimeout(() => request.abort('timeout'), 90000);
    let text = '', sources = [], completed = false, remoteError = null, elapsed = 0, grounded = false;
    try {
      const response = await fetch(base + '/api/v1/chat/stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: previousHistory }), signal: request.signal, credentials: 'omit'
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(typeof detail.detail === 'string' ? detail.detail : '服务暂时不可用，请稍后重试。');
      }
      if (!response.body) throw new Error('当前浏览器不支持流式回答，请使用新版浏览器。');
      await readStream(response, (kind, data) => {
        if (currentVersion !== version || !data || typeof data !== 'object') return;
        if (kind === 'sources') { sources = validSources(data.sources); setStatus('已找到参考资料，正在组织回答…', true); }
        else if (kind === 'token' && typeof data.text === 'string') {
          text += data.text; assistant.bubble.textContent = text;
          if (followLatest) scrollDown(); else syncJump();
        } else if (kind === 'done') { completed = true; elapsed = Number(data.elapsed_ms) || 0; grounded = Boolean(data.grounded); }
        else if (kind === 'error') remoteError = typeof data.message === 'string' ? data.message : '回答中断，请重试。';
      });
      if (currentVersion !== version) return;
      if (remoteError) throw new Error(remoteError);
      if (!completed || !text.trim()) throw new Error('连接中断，回答未完成，请重试。');
      renderText(assistant.bubble, text, sources); addSources(assistant.row, sources);
      const item = { role: 'assistant', content: text.slice(0, 6000), sources };
      entries.push(item); addMessageActions(assistant, item, question); persist();
      assistant.label.textContent = '仵星的 AI 助手' + (elapsed > 0 ? ' · ' + (elapsed / 1000).toFixed(1) + ' 秒' : '');
      setStatus(grounded ? '回答完成，展开依据可核对原文。' : '资料不足，建议换个具体问题或联系本人。', false);
      addFollowups(); if (followLatest) scrollDown();
    } catch (error) {
      if (currentVersion !== version) return;
      assistant.row.classList.add('is-error'); assistant.label.textContent = request.signal.aborted ? '本次回答已停止' : '本次回答未完成';
      const message = request.signal.aborted ? (request.signal.reason === 'timeout' ? '等待超时，请稍后重试。' : '已停止生成，可继续提问。') :
        (error instanceof TypeError ? '暂时连接不到助手。输入草稿已保留，可稍后重试或先查看简历。' : error.message);
      assistant.bubble.textContent = (text ? text + '\n\n' : '') + message; setStatus(message, false);
      if (!input.value.trim() && request.signal.reason !== 'user') { input.value = question; syncInput(); }
      if (entries[entries.length - 1] === user) entries.pop();
      // Mark the whole failed turn, so retries and transcript trimming stay paired.
      assistant.row.previousElementSibling?.classList.add('is-error');
      persist();
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'pa-retry'; retry.textContent = '重试这个问题';
      retry.addEventListener('click', () => {
        if (busy) return;
        const userRow = assistant.row.previousElementSibling;
        if (userRow?.classList.contains('pa-message-user')) userRow.remove();
        assistant.row.remove(); ask(question, input.value.trim() !== question);
      }); assistant.row.append(retry);
      if (text) {
        const actions = document.createElement('div'); actions.className = 'pa-message-actions';
        const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = '复制已有内容'; copy.addEventListener('click', () => copyText(text, copy)); actions.append(copy); assistant.row.append(actions);
      }
      if (followLatest) scrollDown();
    } finally {
      clearTimeout(timeout);
      if (currentVersion === version) {
        controller = null; assistant.row.classList.remove('is-streaming'); setBusy(false); syncRegenerate();
      }
    }
  }
  function checkHealth() {
    if (!base) return Promise.resolve();
    if (healthPending) return healthPending;
    healthPending = (async () => {
      try {
        const response = await fetch(base + '/health/ready', { signal: AbortSignal.timeout(7000), credentials: 'omit' });
        state.textContent = response.ok ? '已连接 · 基于公开资料回答' : '资料准备中 · 请稍后再试';
        panel.dataset.connection = response.ok ? 'ready' : 'unavailable';
      } catch (_) { state.textContent = '连接暂不可用 · 可查看简历'; panel.dataset.connection = 'unavailable'; }
      finally { healthPending = null; }
    })();
    return healthPending;
  }
  function setOpen(open) {
    if (!open) { cancelPanelDrag(); finishResize(); menu.open = false; }
    panel.hidden = !open; launcher.hidden = open; launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      previousFocus = document.activeElement; layoutFloating(); syncInput();
      (compactScreen.matches ? panel.querySelector('.pa-close') : input).focus({ preventScroll: true });
      if (!entries.length) { messages.scrollTop = 0; followLatest = true; syncJump(); }
      else if (followLatest) scrollDown();
      checkHealth();
    } else {
      layoutFloating(); (previousFocus?.isConnected ? previousFocus : launcher).focus({ preventScroll: true });
    }
  }
  launcher.addEventListener('click', () => setOpen(true));
  let compactFrame = 0;
  const syncLauncher = () => { compactFrame = 0; launcher.classList.toggle('is-compact', compactScreen.matches && window.scrollY > 180); };
  window.addEventListener('scroll', () => { if (!compactFrame) compactFrame = requestAnimationFrame(syncLauncher); }, { passive: true });
  compactScreen.addEventListener('change', syncLauncher); syncLauncher();
  panel.querySelector('.pa-close').addEventListener('click', () => setOpen(false));
  function disarmClear() {
    clearTimeout(clearTimer); clearArmed = false; clearButton.textContent = '＋ 新对话';
  }
  clearButton.addEventListener('click', () => {
    if ((entries.length || busy) && !clearArmed) {
      clearArmed = true; clearButton.textContent = '确认清空'; setStatus('再次点击确认清空；当前生成也会停止。', false);
      clearTimer = setTimeout(disarmClear, 5000); return;
    }
    disarmClear(); version++; controller?.abort(); controller = null; entries = []; input.value = ''; inspirationsOpen = false;
    setBusy(false); persist(); setStatus('', false); welcome(); syncInput(); input.focus({ preventScroll: true });
  });
  inspire.addEventListener('click', () => {
    inspirationsOpen = !inspirationsOpen; syncInspirations();
    if (!messages.querySelector('.pa-welcome').hidden) messages.scrollTop = 0;
  });
  jump.addEventListener('click', scrollDown);
  messages.addEventListener('scroll', () => {
    followLatest = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 64; syncJump();
  }, { passive: true });
  fontButton.addEventListener('click', () => {
    const large = !panel.classList.contains('pa-large-text'); panel.classList.toggle('pa-large-text', large);
    fontButton.setAttribute('aria-pressed', String(large)); fontButton.textContent = large ? '恢复标准字号' : '使用较大字号';
    try { sessionStorage.setItem(preferencesKey, JSON.stringify({ largeText: large })); } catch (_) {}
    menu.open = false; if (entries.length && followLatest) scrollDown();
  });
  panel.querySelector('.pa-reset-window').addEventListener('click', () => {
    expanded = false; panelSize.width = 420; panelSize.height = 680; expandedPosition = null;
    resetPosition(panel); resetPosition(launcher); syncWindowMode(); layoutFloating(); menu.open = false; setStatus('已恢复默认窗口布局。', false);
  });
  panel.querySelector('.pa-reconnect').addEventListener('click', async () => {
    menu.open = false;
    if (!base) { setStatus('公网问答尚未接入，可先浏览项目或完整简历。', false); return; }
    if (!busy) setStatus('正在检查连接…', false);
    await checkHealth();
    if (!busy) setStatus(panel.dataset.connection === 'ready' ? '连接正常，可以继续提问。' : '暂时连接不到助手，请稍后重试。', false);
  });
  exportButton.addEventListener('click', () => {
    if (!entries.some(item => item.role === 'assistant')) return;
    const date = new Date().toISOString().slice(0, 10);
    const lines = ['# 与仵星的 RAG 问答助手对话', '', '导出日期：' + date, 'AI 回答请结合参考来源核对；仅导出当前标签页已完成的对话。', ''];
    entries.forEach((item, index) => {
      // A request in progress has a trailing user entry; it is not a completed turn.
      if (item.role === 'user' && entries[index + 1]?.role !== 'assistant') return;
      // Escaping raw tags also keeps exported Markdown safe in HTML renderers.
      const content = item.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      lines.push('## ' + (item.role === 'user' ? '你' : '仵星的 AI 助手'), '', content, '');
      if (item.role === 'assistant' && item.sources?.length) {
        lines.push('参考资料：', ...item.sources.map(s => '- [' + s.id + '] ' + s.title + (safeUrl(s.url) ? ' ' + safeUrl(s.url) : '')), '');
      }
    });
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = '仵星-RAG对话-' + date + '.md';
    panel.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    menu.open = false; setStatus('已导出本标签页的已完成对话。', false);
  });
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) menu.open = false; });
  panel.addEventListener('click', event => {
    const link = event.target.closest('.pa-source a,.pa-bubble a,.pa-foot a,.pa-welcome-links a');
    if (link && new URL(link.href).origin === location.origin && new URL(link.href).hash) setOpen(false);
  });
  form.addEventListener('submit', event => { event.preventDefault(); if (busy) controller?.abort('user'); else ask(input.value); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault(); if (!busy) ask(input.value);
    }
  });
  input.addEventListener('input', syncInput);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.stopPropagation(); if (menu.open) { menu.open = false; menu.querySelector('summary').focus(); } else setOpen(false);
    }
    if (event.key === 'Tab') {
      const controls = [...panel.querySelectorAll('button:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(control => control.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('offline', () => { state.textContent = '网络已断开 · 输入草稿会保留'; });
  window.addEventListener('online', () => { if (!panel.hidden) checkHealth(); });
  document.querySelectorAll('[data-open-assistant]').forEach(button => button.addEventListener('click', () => setOpen(true)));
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
    if (Array.isArray(saved)) {
      const valid = saved.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string' && item.content.length > 0 && item.content.length <= 6000);
      // Restore only complete user/assistant pairs, including legacy v2 storage.
      for (let i = 0; i < valid.length - 1; i++) {
        if (valid[i].role === 'user' && valid[i + 1].role === 'assistant') {
          entries.push({ role: 'user', content: valid[i].content.slice(0, 600) }, { role: 'assistant', content: valid[i + 1].content, sources: validSources(valid[i + 1].sources) }); i++;
        }
      }
      entries = entries.slice(-40);
    }
    input.value = (sessionStorage.getItem(draftKey) || '').slice(0, 600);
    const prefs = JSON.parse(sessionStorage.getItem(preferencesKey) || '{}');
    if (prefs.largeText) { panel.classList.add('pa-large-text'); fontButton.setAttribute('aria-pressed', 'true'); fontButton.textContent = '恢复标准字号'; }
  } catch (_) { /* Optional storage must not prevent the assistant from opening. */ }
  welcome(); syncInput();
})();
