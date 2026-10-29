/* Streaming portfolio assistant. All visitor/model text uses DOM text nodes.
 * Model secrets live exclusively in the backend environment.
 */
(function () {
  "use strict";
  const config = window.PORTFOLIO_ASSISTANT_CONFIG || {};
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const github = location.hostname.endsWith(".github.io");
  // Resolve the site's mounted directory, including /wx/, before adding API paths.
  const siteRoot = new URL('../', document.currentScript.src);
  const base = (config.apiBase || (local ? "http://127.0.0.1:8010" : github ? "" : siteRoot.href)).replace(/\/+$/, "");
  const storageKey = "wx-portfolio-chat-v2";
  const assistantName = "仵星的RAG问答助手";
  const launcherName = "问问仵星的RAG问答助手";
  const compactScreen = matchMedia('(max-width:600px), (max-height:500px) and (pointer:coarse)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let windowMotion = null, launcherMotion = null, desiredOpen = false;
  // Animate only entry/exit chrome, never the window's drag or resize coordinates.
  function settleWindow() {
    windowMotion?.cancel(); windowMotion = null;
    panel.classList.remove('is-opening');
  }
  function revealWindow() {
    settleWindow();
    if (reducedMotion.matches) return;
    panel.classList.add('is-opening');
    windowMotion = panel.animate([
      { opacity: 0, transform: compactScreen.matches ? 'translateY(16px)' : 'translateY(12px) scale(.975)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 250, easing: 'cubic-bezier(.2,.8,.2,1)' });
    windowMotion.onfinish = () => { windowMotion = null; };
  }
  const mascotUrl = new URL('../assets/assistant-sprout.svg', document.currentScript.src).href;
  const mascot = '<img class="pa-mascot" src="' + mascotUrl + '" alt="" aria-hidden="true" draggable="false" width="48" height="48">';
  const sendIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v15"/></svg>';
  const launcher = document.createElement("button");
  launcher.className = "pa-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "打开" + launcherName);
  launcher.title = "点击打开，拖动可调整入口位置";
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "pa-panel");
  launcher.innerHTML = mascot + '<span class="pa-launcher-copy"><strong>' + launcherName + '</strong><small>项目、实习、技术方案 · 点此提问</small></span><i class="pa-launcher-dot" aria-hidden="true"></i>';
  const panel = document.createElement("aside");
  panel.id = "pa-panel";
  panel.className = "pa-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", assistantName);
  panel.innerHTML = [
    '<header class="pa-header">',
    '<div class="pa-header-main" title="拖动标题栏移动，双击展开或还原"><div class="pa-avatar" aria-hidden="true">' + mascot + '</div>',
    '<div class="pa-heading" tabindex="0" aria-label="助手标题栏：方向键移动，Home 键复位，Enter 键展开或还原"><h2>' + assistantName + '</h2><span class="pa-state">基于公开资料 · 回答附来源</span></div>',
    '<div class="pa-window-actions"><button type="button" class="pa-icon-btn pa-expand" aria-label="放大助手窗口" title="放大窗口" aria-pressed="false"></button>',
    '<button type="button" class="pa-icon-btn pa-close" aria-label="最小化助手" title="最小化，保留对话"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 10h12"/></svg></button></div></div></header>',
    '<nav class="pa-toolbar" aria-label="助手工具"><a class="pa-resume-link" href="#resume">查看简历 ↗</a><div class="pa-tools">',
    '<details class="pa-menu"><summary aria-label="更多对话设置" title="更多操作">···</summary><div class="pa-menu-content">',
    '<button type="button" class="pa-clear" aria-label="开始新对话">＋ 新对话</button>',
    '<button type="button" class="pa-export">导出已完成对话 .md</button><button type="button" class="pa-font" aria-pressed="false">使用较大字号</button>',
    '<button type="button" class="pa-reset-window">恢复窗口位置与大小</button><button type="button" class="pa-reconnect">重新检查连接</button><p>AI 回答请结合来源核对。问题与近期对话会交由模型服务处理，请勿输入敏感信息。对话与草稿仅存当前标签页。</p></div></details></div></nav>',
    '<div class="pa-chat-body"><div class="pa-messages" role="log" tabindex="0" aria-label="聊天记录" aria-live="off"></div>',
    '<button type="button" class="pa-jump" hidden>回到最新 ↓</button>',
    '<div class="pa-discovery-scrim" aria-hidden="true" hidden></div>',
    '<section id="pa-discovery" class="pa-discovery" role="region" aria-labelledby="pa-discovery-title" hidden><div class="pa-discovery-heading"><div><h3 id="pa-discovery-title">提问灵感</h3><p class="pa-discovery-note">点击问题直接提问</p></div><button type="button" class="pa-discovery-close" aria-label="收起提问灵感">×</button></div><div class="pa-discovery-content"><div class="pa-topics" aria-label="选择提问主题"></div><div class="pa-suggestions"></div><button type="button" class="pa-random"><span aria-hidden="true">↻</span> 随机选题，放入输入框</button></div></section></div>',
    '<p class="pa-status" role="status" aria-live="polite"></p>',
    '<form class="pa-compose"><div class="pa-compose-label"><label for="pa-question">你的问题</label><button type="button" class="pa-inspire" aria-expanded="false" aria-controls="pa-discovery"><span aria-hidden="true">✦</span> 提问灵感 <span class="pa-inspire-chevron" aria-hidden="true">⌃</span></button></div><div class="pa-input-wrap">',
    '<textarea id="pa-question" class="pa-input" rows="1" maxlength="600" aria-label="输入想了解的问题" placeholder="输入问题，开始对话…"></textarea>',
    '<button class="pa-send" type="submit" aria-label="发送问题"><span class="pa-send-text">发送</span>' + sendIcon + '</button></div>',
    '<div class="pa-compose-hint"><span class="pa-key-hint"><kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行</span><span class="pa-draft-tools"><button type="button" class="pa-clear-draft" hidden aria-label="清空输入草稿">清空</button><span class="pa-count">0 / 600</span></span></div>',
    '<div class="pa-foot">AI 回答请结合参考来源核对</div></form>',
    ...["n", "e", "s", "w", "ne", "nw", "se", "sw"].map(edge => '<div class="pa-resize pa-resize-' + edge + '" data-pa-resize="' + edge + '" ' + (edge === "se" ? 'tabindex="0" role="button" aria-label="调整窗口大小：方向键调整，Home 键恢复默认大小"' : 'aria-hidden="true"') + '></div>')
  ].join("");
  document.body.append(launcher, panel);
  panel.querySelector('.pa-header').addEventListener('animationend', event => {
    if (event.animationName === 'pa-light') panel.classList.remove('is-opening');
  });
  const messages = panel.querySelector(".pa-messages");
  const input = panel.querySelector(".pa-input");
  const form = panel.querySelector("form");
  const send = panel.querySelector(".pa-send");
  const state = panel.querySelector(".pa-state");
  const status = panel.querySelector(".pa-status");
  let entries = [], busy = false, controller = null, version = 0;
  let previousFocus = null;
  let expanded = false, expandedPosition = null;
  const windowDefaults = { width: 400, height: 560 };
  const panelSize = { ...windowDefaults };
  let customSize = false;
  function resetWindowSize() { Object.assign(panelSize, windowDefaults); customSize = false; }
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
      // Leave room to move a default window on short laptop displays.
      const height = Math.min(expanded ? 800 : customSize ? panelSize.height : Math.min(panelSize.height, Math.round(innerHeight * .8)), innerHeight - 32);
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
    settleWindow();
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
      if (element === panel) settleWindow();
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
      settleWindow();
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
      const minWidth = Math.min(340, innerWidth - 24), minHeight = Math.min(400, innerHeight - 24);
      let { left, right, top, bottom } = rect;
      const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
      if (edge.includes("e")) right = clamp(rect.right + dx, left + minWidth, Math.min(innerWidth - 12, left + 960));
      if (edge.includes("w")) left = clamp(rect.left + dx, Math.max(12, right - 960), right - minWidth);
      if (edge.includes("s")) bottom = clamp(rect.bottom + dy, top + minHeight, Math.min(innerHeight - 12, top + 860));
      if (edge.includes("n")) top = clamp(rect.top + dy, Math.max(12, bottom - 860), bottom - minHeight);
      panelSize.width = right - left; panelSize.height = bottom - top; customSize = true;
      panel.style.width = panelSize.width + "px"; panel.style.height = panelSize.height + "px";
      placeFloating(panel, { x: left, y: top });
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => handle.addEventListener(name, finishResize));
  });
  panel.querySelector(".pa-resize-se").addEventListener("keydown", event => {
    if (event.key === "Home") { event.preventDefault(); resetWindowSize(); resetPosition(panel); layoutFloating(); return; }
    const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const bounds = panel.getBoundingClientRect();
    panelSize.width = Math.max(340, Math.min(960, bounds.width + delta[0]));
    panelSize.height = Math.max(400, Math.min(860, bounds.height + delta[1])); customSize = true;
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
  const clearDraft = panel.querySelector('.pa-clear-draft');
  const discovery = panel.querySelector('.pa-discovery');
  const discoveryScrim = panel.querySelector('.pa-discovery-scrim');
  let discoveryShown = false, discoveryMotions = [];
  const topics = [
    { name: '快速了解', titles: ['一分钟认识仵星', '有哪些真实项目？', '奖项与校园经历', '求职方向与联系'], notes: ['背景、优势与求职方向', '在线体验与源码入口', '奖学金与个人成长', '城市、到岗与联系方式'], questions: ['用一分钟介绍仵星的背景、优势和求职方向。', '他有哪些可以体验或查看源码的项目？', '他获得过哪些奖项和奖学金？', '他的求职城市、到岗时间和联系方式是什么？'] },
    { name: '项目技术', titles: ['RAG 链路怎么做？', '语音情感如何融合？', 'BOSS 工具的取舍', '记账本如何实现？'], notes: ['语义检索到流式回答', '声音、文本与当前局限', '实现路线与遇到的困难', '功能设计与数据保存'], questions: ['他的 RAG 项目从文档加载到流式回答如何实现？', '语音情感毕业设计如何融合声音与文本？目前有哪些局限？', 'BOSS 工具为什么改用浏览器用户脚本？遇到过什么困难？', '他的记账本实现了什么？数据保存在哪里？'] },
    { name: '实习交付', titles: ['央国企驻场做什么？', '需求如何交付上线？', '线上问题怎么排查？', '如何与客户沟通？'], notes: ['参与范围与个人职责', '澄清、确认与验收闭环', 'SQL、日志与回归验证', '管理层沟通与团队协作'], questions: ['他在央国企驻场实习中具体做了什么？', '客户提出需求后，他如何分析、复盘确认并推进上线？', '他如何结合 SQL、运行日志和回归测试解决问题？', '他有哪些面向管理层沟通与跨团队协作的经历？'] }
  ];
  let selectedTopic = 0, inspirationsOpen = false, followLatest = false;
  let readingAnchor = null;
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
    jump.hidden = !messages.querySelector('.pa-message') || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 24;
    jump.textContent = busy ? '有新内容 · 回到最新 ↓' : '回到最新 ↓';
  }
  function scrollDown() {
    readingAnchor = null; followLatest = busy;
    messages.scrollTop = messages.scrollHeight;
    syncJump();
  }
  function alignAnswerStart() {
    if (panel.hidden || panel.inert || !readingAnchor?.isConnected) return;
    const top = readingAnchor.getBoundingClientRect().top - messages.getBoundingClientRect().top + messages.scrollTop - 12;
    messages.scrollTop = Math.max(0, top);
  }
  function setStatus(text, loading) {
    status.textContent = text;
    status.classList.toggle('is-busy', Boolean(loading));
  }
  function syncInput() {
    input.style.height = 'auto';
    const limit = parseFloat(getComputedStyle(input).maxHeight) || 116;
    input.style.height = Math.min(input.scrollHeight, limit) + 'px';
    count.textContent = input.value.length + ' / 600';
    count.classList.toggle('is-near-limit', input.value.length >= 540);
    clearDraft.hidden = !input.value.length;
    form.classList.toggle('has-draft', Boolean(input.value.trim()));
    send.disabled = !busy && !input.value.trim();
    try { sessionStorage.setItem(draftKey, input.value); } catch (_) {}
  }
  function setBusy(value) {
    busy = value;
    panel.classList.toggle('is-busy', value);
    send.innerHTML = value ? '<span class="pa-send-text">停止</span><span class="pa-stop-symbol" aria-hidden="true"></span>' : '<span class="pa-send-text">发送</span>' + sendIcon;
    send.setAttribute('aria-label', value ? '停止生成' : '发送问题');
    send.title = value ? '停止本次回答' : '发送问题';
    input.setAttribute('aria-description', value ? '正在回答，可以先输入下一条问题；点击停止按钮结束生成。' : '最多600字，Enter发送，Shift加Enter换行。');
    launcher.querySelector('small').textContent = value ? '正在回答 · 点击继续查看' : '项目、实习、技术方案 · 点此提问';
    panel.querySelectorAll('.pa-regenerate,.pa-followup,.pa-suggestion,.pa-starter').forEach(button => { button.disabled = value; });
    discovery.querySelector('.pa-discovery-note').textContent = value ? '正在回答，可随机选题起草下一问' : '点击问题直接提问';
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
    const summary = document.createElement('summary'); summary.textContent = '参考来源 · ' + sources.length + ' 条公开资料';
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
    const labelRow = document.createElement('div'); labelRow.className = 'pa-label';
    if (role === 'assistant') {
      const avatar = document.createElement('img'); avatar.src = mascotUrl; avatar.alt = ''; avatar.className = 'pa-message-avatar'; avatar.draggable = false;
      labelRow.append(avatar);
    }
    const label = document.createElement('span'); label.textContent = role === 'user' ? '你' : '仵星的 AI 助手'; labelRow.append(label);
    const bubble = document.createElement('div'); bubble.className = 'pa-bubble';
    renderText(bubble, text || '', sources || []); row.append(labelRow, bubble); messages.append(row);
    return { row, bubble, label };
  }
  function syncRegenerate() {
    const buttons = [...messages.querySelectorAll('.pa-regenerate')];
    buttons.forEach((button, index) => { button.hidden = index !== buttons.length - 1; button.disabled = busy; });
  }
  // Animate the secondary surface without moving the transcript or composer.
  // Cancel transitions before reversing so a stale exit cannot hide a reopened panel.
  function syncDiscovery(immediate = false) {
    const instant = immediate || reducedMotion.matches || panel.hidden;
    if (discoveryShown === inspirationsOpen && !instant) return;
    const visible = !discovery.hidden;
    const current = { opacity: getComputedStyle(discovery).opacity, transform: getComputedStyle(discovery).transform };
    const shadeOpacity = getComputedStyle(discoveryScrim).opacity;
    discoveryMotions.forEach(motion => motion.cancel()); discoveryMotions = [];
    discoveryShown = inspirationsOpen;
    panel.classList.toggle('is-discovering', inspirationsOpen);
    inspire.setAttribute('aria-expanded', String(inspirationsOpen));
    messages.inert = inspirationsOpen;
    discovery.inert = !inspirationsOpen;
    const finish = () => {
      if (discoveryShown) return;
      discovery.hidden = true; discoveryScrim.hidden = true;
    };
    if (inspirationsOpen) {
      discovery.hidden = false; discoveryScrim.hidden = false;
      discovery.scrollTop = 0;
      if (!instant) discoveryMotions = [
        discovery.animate([visible ? current : { opacity: 0, transform: 'translateY(12px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }),
        discoveryScrim.animate([{ opacity: visible ? shadeOpacity : 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })
      ];
    } else if (instant || discovery.hidden) finish();
    else {
      discoveryMotions = [
        discovery.animate([current, { opacity: 0, transform: 'translateY(7px) scale(.99)' }], { duration: 130, easing: 'ease-in' }),
        discoveryScrim.animate([{ opacity: shadeOpacity }, { opacity: 0 }], { duration: 130, easing: 'ease-in' })
      ];
      discoveryMotions[0].onfinish = finish;
    }
  }
  function syncInspirations(immediate = false) {
    const welcome = messages.querySelector('.pa-welcome');
    if (welcome) welcome.hidden = entries.length > 0 || Boolean(messages.querySelector('.pa-message'));
    syncDiscovery(immediate);
    const tabs = discovery.querySelector('.pa-topics');
    // Keep topic buttons mounted so switching themes preserves keyboard focus.
    if (!tabs.children.length) topics.forEach((topic, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'pa-topic';
      button.textContent = topic.name; button.setAttribute('aria-pressed', String(index === selectedTopic));
      button.addEventListener('click', () => { selectedTopic = index; syncInspirations(); }); tabs.append(button);
    });
    [...tabs.children].forEach((button, index) => button.setAttribute('aria-pressed', String(index === selectedTopic)));
    const suggestions = discovery.querySelector('.pa-suggestions'); suggestions.replaceChildren();
    topics[selectedTopic].questions.forEach((question, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'pa-suggestion';
      button.disabled = busy;
      button.title = question; button.setAttribute('aria-label', question);
      const text = document.createElement('b'); text.textContent = topics[selectedTopic].titles[index];
      const note = document.createElement('small'); note.textContent = topics[selectedTopic].notes[index];
      const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); button.append(text, note, arrow);
      button.addEventListener('click', () => ask(question)); suggestions.append(button);
      if (!reducedMotion.matches && inspirationsOpen && !panel.hidden) button.animate([
        { opacity: .5, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }
      ], { duration: 180, delay: index * 25, easing: 'ease-out' });
    });
  }
  function welcome() {
    messages.replaceChildren();
    const box = document.createElement('div'); box.className = 'pa-welcome';
    box.innerHTML = '<div class="pa-welcome-mark" aria-hidden="true">' + mascot + '</div><div class="pa-welcome-label">仵星的作品集向导</div><h3>你好，想了解什么？</h3><p class="pa-welcome-intro">项目实现、实习交付、求职方向，<br>都可以直接问我。</p><div class="pa-starter-label">试着问我</div><div class="pa-starters"></div>';
    [topics[0], topics[1]].forEach(topic => {
      const button = document.createElement('button'); button.className = 'pa-starter'; button.type = 'button';
      const title = document.createElement('span'); title.textContent = topic.titles[0];
      const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
      button.append(title, arrow); button.setAttribute('aria-label', topic.questions[0]);
      button.addEventListener('click', () => ask(topic.questions[0])); box.querySelector('.pa-starters').append(button);
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
    else { messages.scrollTop = 0; followLatest = false; readingAnchor = null; syncJump(); }
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
    const box = document.createElement('details'); box.className = 'pa-followups';
    const label = document.createElement('summary'); label.textContent = '继续了解其他方面'; box.append(label);
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
    // Dismiss optional prompts without scrolling the existing transcript.
    if (discovery.contains(document.activeElement)) (compactScreen.matches ? inspire : input).focus({ preventScroll: true });
    addMessageActions(addMessage('user', question), user);
    if (!preserveDraft) { input.value = ''; syncInput(); }
    const assistant = addMessage('assistant', ''); assistant.row.classList.add('is-streaming', 'is-waiting');
    assistant.bubble.innerHTML = '<span class="pa-thinking" aria-hidden="true"><i></i><i></i><i></i></span><span>正在查阅公开资料…</span>';
    readingAnchor = assistant.row; followLatest = false;
    setBusy(true); setStatus('正在检索参考资料…', true); alignAnswerStart(); syncJump();
    const request = new AbortController(); controller = request;
    const timeout = setTimeout(() => request.abort('timeout'), 90000);
    let text = '', sources = [], completed = false, remoteError = null, elapsed = 0, grounded = false, readingTop = null;
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
          assistant.row.classList.remove('is-waiting');
          text += data.text; assistant.bubble.textContent = text;
          if (followLatest) scrollDown(); else { alignAnswerStart(); syncJump(); }
        } else if (kind === 'done') { completed = true; elapsed = Number(data.elapsed_ms) || 0; grounded = Boolean(data.grounded); }
        else if (kind === 'error') remoteError = typeof data.message === 'string' ? data.message : '回答中断，请重试。';
      });
      if (currentVersion !== version) return;
      if (remoteError) throw new Error(remoteError);
      if (!completed || !text.trim()) throw new Error('连接中断，回答未完成，请重试。');
      // Formatting, references and followups may change height. Keep the reader
      // at the same position instead of jumping to the newly appended footer.
      readingTop = messages.scrollTop; readingAnchor = null; followLatest = false;
      renderText(assistant.bubble, text, sources); addSources(assistant.row, sources);
      const item = { role: 'assistant', content: text.slice(0, 6000), sources };
      entries.push(item); addMessageActions(assistant, item, question); persist();
      assistant.label.textContent = '仵星的 AI 助手' + (elapsed > 0 ? ' · ' + (elapsed / 1000).toFixed(1) + ' 秒' : '');
      setStatus(grounded ? '回答完成，展开依据可核对原文。' : '资料不足，建议换个具体问题或联系本人。', false);
      addFollowups();
    } catch (error) {
      if (currentVersion !== version) return;
      readingTop = messages.scrollTop; readingAnchor = null; followLatest = false;
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
    } finally {
      clearTimeout(timeout);
      if (currentVersion === version) {
        controller = null; assistant.row.classList.remove('is-streaming', 'is-waiting'); setBusy(false); syncRegenerate();
        if (readingTop !== null) messages.scrollTop = readingTop;
        syncJump();
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
  function setOpen(open, immediate = false) {
    desiredOpen = open;
    settleWindow(); launcherMotion?.cancel();
    launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      if (panel.hidden) previousFocus = document.activeElement;
      panel.hidden = false; launcher.hidden = true; layoutFloating(); syncInput(); revealWindow();
      (compactScreen.matches ? panel.querySelector('.pa-close') : input).focus({ preventScroll: true });
      if (!entries.length) { messages.scrollTop = 0; followLatest = false; syncJump(); }
      else if (followLatest) scrollDown();
      checkHealth();
    } else {
      cancelPanelDrag(); finishResize(); menu.open = false;
      inspirationsOpen = false; syncInspirations(true);
      const finish = () => {
        if (desiredOpen) return;
        panel.hidden = true; panel.inert = false; launcher.hidden = false; layoutFloating();
        (previousFocus?.isConnected ? previousFocus : launcher).focus({ preventScroll: true });
        if (!reducedMotion.matches) launcherMotion = launcher.animate([
          { opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }
        ], { duration: 180, easing: 'ease-out' });
      };
      // Make exiting controls non-interactive while the short exit finishes.
      if (!panel.hidden && !reducedMotion.matches && !immediate) {
        panel.inert = true;
        windowMotion = panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(.985)' }], { duration: 130, easing: 'ease-in' });
        windowMotion.onfinish = () => { windowMotion = null; finish(); };
      } else finish();
    }
    if (open) panel.inert = false;
  }
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    // Respect preference changes immediately, including an in-progress exit.
    panel.getAnimations({ subtree: true }).forEach(animation => {
      if (animation.effect?.getTiming().iterations === Infinity) animation.cancel();
      else animation.finish();
    });
    launcherMotion?.finish(); syncDiscovery(true);
  });
  launcher.addEventListener('click', () => setOpen(true));
  let compactFrame = 0;
  const syncLauncher = () => { compactFrame = 0; launcher.classList.toggle('is-compact', compactScreen.matches && window.scrollY > 180); };
  window.addEventListener('scroll', () => { if (!compactFrame) compactFrame = requestAnimationFrame(syncLauncher); }, { passive: true });
  compactScreen.addEventListener('change', syncLauncher); syncLauncher();
  panel.querySelector('.pa-close').addEventListener('click', () => setOpen(false));
  function disarmClear() {
    clearTimeout(clearTimer); clearArmed = false; clearButton.textContent = '＋ 新对话';
    clearButton.removeAttribute('data-confirming');
  }
  clearButton.addEventListener('click', () => {
    if ((entries.length || busy) && !clearArmed) {
      clearArmed = true; clearButton.textContent = '确认清空'; setStatus('再次点击确认清空；当前生成也会停止。', false);
      clearButton.dataset.confirming = 'true';
      clearTimer = setTimeout(disarmClear, 5000); return;
    }
    disarmClear(); version++; controller?.abort(); controller = null; entries = []; input.value = ''; inspirationsOpen = false;
    menu.open = false;
    setBusy(false); persist(); setStatus('', false); welcome(); syncInput(); input.focus({ preventScroll: true });
  });
  inspire.addEventListener('click', () => {
    menu.open = false; inspirationsOpen = !inspirationsOpen; syncInspirations();
    if (inspirationsOpen) discovery.querySelector('.pa-topic[aria-pressed="true"]').focus({ preventScroll: true });
  });
  panel.querySelector('.pa-discovery-close').addEventListener('click', () => {
    inspirationsOpen = false; syncInspirations(); inspire.focus({ preventScroll: true });
  });
  discovery.querySelector('.pa-random').addEventListener('click', () => {
    const pool = topics.flatMap(topic => topic.questions);
    let index = Math.floor(Math.random() * pool.length);
    if (index === lastRandom) index = (index + 1) % pool.length;
    lastRandom = index; input.value = pool[index]; syncInput();
    inspirationsOpen = false; syncInspirations(); input.focus({ preventScroll: true });
    setStatus('灵感已放入输入框，可修改后发送。', false);
  });
  menu.addEventListener('toggle', () => {
    if (menu.open && inspirationsOpen) { inspirationsOpen = false; syncInspirations(); }
  });
  jump.addEventListener('click', scrollDown);
  function takeReadingControl() { readingAnchor = null; followLatest = false; }
  messages.addEventListener('wheel', takeReadingControl, { passive: true });
  messages.addEventListener('touchstart', takeReadingControl, { passive: true });
  messages.addEventListener('pointerdown', takeReadingControl);
  messages.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) takeReadingControl();
  });
  messages.addEventListener('scroll', () => {
    // Scrolling never opts the reader back into automatic following. Only the
    // explicit "latest" action does that; wheel/touch/key interaction pauses it.
    syncJump();
  }, { passive: true });
  function closeTools() {
    menu.open = false;
    menu.querySelector('summary').focus({ preventScroll: true });
  }
  fontButton.addEventListener('click', () => {
    const large = !panel.classList.contains('pa-large-text'); panel.classList.toggle('pa-large-text', large);
    fontButton.setAttribute('aria-pressed', String(large)); fontButton.textContent = large ? '恢复标准字号' : '使用较大字号';
    try { sessionStorage.setItem(preferencesKey, JSON.stringify({ largeText: large })); } catch (_) {}
    closeTools(); if (entries.length && followLatest) scrollDown();
  });
  panel.querySelector('.pa-reset-window').addEventListener('click', () => {
    expanded = false; resetWindowSize(); expandedPosition = null;
    resetPosition(panel); resetPosition(launcher); syncWindowMode(); layoutFloating(); closeTools(); setStatus('已恢复默认窗口布局。', false);
  });
  panel.querySelector('.pa-reconnect').addEventListener('click', async () => {
    closeTools();
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
    closeTools(); setStatus('已导出本标签页的已完成对话。', false);
  });
  document.addEventListener('pointerdown', event => {
    if (!menu.contains(event.target)) menu.open = false;
    if (inspirationsOpen && !discovery.contains(event.target) && !inspire.contains(event.target)) {
      inspirationsOpen = false; syncInspirations();
      if (event.target === discoveryScrim) {
        event.preventDefault(); inspire.focus({ preventScroll: true });
      }
    }
  });
  panel.addEventListener('click', event => {
    const link = event.target.closest('.pa-source a,.pa-bubble a,.pa-resume-link');
    if (link && new URL(link.href).origin === location.origin && new URL(link.href).hash) setOpen(false, true);
  });
  form.addEventListener('submit', event => { event.preventDefault(); if (busy) controller?.abort('user'); else ask(input.value); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault(); if (!busy) ask(input.value);
    }
  });
  input.addEventListener('input', syncInput);
  clearDraft.addEventListener('click', () => { input.value = ''; syncInput(); input.focus({ preventScroll: true }); });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (inspirationsOpen) { inspirationsOpen = false; syncInspirations(); inspire.focus({ preventScroll: true }); }
      else if (menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
      else setOpen(false);
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
  // React to the actual panel size (drag handles, rotation and mobile keyboard),
  // not just the browser width. Never scroll the transcript as a side effect.
  new ResizeObserver(() => { if (!panel.hidden) { syncInput(); syncJump(); } }).observe(panel);
  welcome(); syncInput();
})();
