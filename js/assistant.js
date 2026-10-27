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
    '<div class="pa-toolbar"><span>公开资料问答 · 回答附来源</span><button type="button" class="pa-clear" aria-label="开始新对话">＋ 新对话</button></div>',
    '<div class="pa-messages" role="log" aria-label="聊天记录" aria-live="off"></div>',
    '<p class="pa-status" role="status" aria-live="polite"></p>',
    '<form class="pa-compose"><div class="pa-input-wrap">',
    '<textarea class="pa-input" rows="1" maxlength="600" aria-label="输入想了解的问题" placeholder="想了解他的项目或实习经历？"></textarea>',
    '<button class="pa-send" type="submit" aria-label="发送问题">' + sendIcon + '</button></div>',
    '<div class="pa-foot"><span>仅当前标签页保存对话</span><a href="#resume">查看简历 ↗</a></div></form>',
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
  const panelSize = { width: 400, height: 600 };
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
    if (event.key === "Home") { event.preventDefault(); panelSize.width = 400; panelSize.height = 600; resetPosition(panel); layoutFloating(); return; }
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

  function safeUrl(value) {
    try {
      const url = new URL(value, location.href);
      if (url.origin === "https://wuxingai666.github.io" &&
          url.pathname === "/wx-portfolio/" && url.hash) {
        return location.origin + location.pathname + url.hash;
      }
      if (["http:", "https:"].includes(url.protocol) &&
          [location.origin, "https://wuxingai666.github.io"].includes(url.origin)) return url.href;
    } catch (_) { /* Invalid remote URL: display text without a link. */ }
    return null;
  }
  function persist() {
    try { sessionStorage.setItem(storageKey, JSON.stringify(entries.slice(-8))); } catch (_) {}
  }
  function scrollDown() { messages.scrollTop = messages.scrollHeight; }
  function setStatus(text, loading) {
    status.textContent = text;
    status.classList.toggle("is-busy", Boolean(loading));
  }
  function setBusy(value) {
    busy = value;
    send.innerHTML = value ? "■" : sendIcon;
    send.setAttribute("aria-label", value ? "停止生成" : "发送问题");
    input.disabled = value;
    launcher.querySelector("small").textContent = value ? "正在回答 · 点击继续查看" : "项目、实习、技术方案 · 点此提问";
  }
  function renderText(bubble, text, sources) {
    bubble.replaceChildren();
    const rx = /\[S\d+\]|\*\*[^*\n]+\*\*/g;
    let end = 0, match;
    while ((match = rx.exec(text))) {
      bubble.append(document.createTextNode(text.slice(end, match.index)));
      if (match[0].startsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = match[0].slice(2, -2);
        bubble.append(strong);
        end = rx.lastIndex;
        continue;
      }
      const source = sources.find(s => "[" + s.id + "]" === match[0]);
      const url = source && safeUrl(source.url);
      if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.textContent = match[0];
        link.title = source.title;
        bubble.append(link);
      } else bubble.append(document.createTextNode(match[0]));
      end = rx.lastIndex;
    }
    bubble.append(document.createTextNode(text.slice(end)));
  }
  function addSources(row, sources) {
    if (!sources.length) return;
    const details = document.createElement("details");
    details.className = "pa-sources";
    const summary = document.createElement("summary");
    summary.textContent = "参考资料 · " + sources.length + " 条";
    details.append(summary);
    for (const source of sources) {
      const box = document.createElement("div");
      box.className = "pa-source";
      const href = safeUrl(source.url);
      const title = document.createElement(href ? "a" : "span");
      if (href) title.href = href;
      title.textContent = "[" + source.id + "] " + source.title;
      const excerpt = document.createElement("p");
      excerpt.textContent = source.excerpt || "";
      box.append(title, excerpt);
      details.append(box);
    }
    row.append(details);
  }
  function addMessage(role, text, sources) {
    const row = document.createElement("div");
    row.className = "pa-message pa-message-" + role;
    const label = document.createElement("div");
    label.className = "pa-label";
    label.textContent = role === "user" ? "你" : "AI 助手 · 公开资料问答";
    const bubble = document.createElement("div");
    bubble.className = "pa-bubble";
    renderText(bubble, text || "", sources || []);
    row.append(label, bubble);
    addSources(row, sources || []);
    messages.append(row);
    return { row, bubble };
  }
  function welcome() {
    messages.replaceChildren();
    const box = document.createElement("div");
    box.className = "pa-welcome";
    box.innerHTML = '<div class="pa-welcome-label">MEET WUXING</div><h3>从一个问题，了解仵星。</h3><p>看项目实现，也看业务理解与交付思路。<br>我会检索公开资料，回答附上参考来源。</p>';
    const suggestions = document.createElement("div");
    suggestions.className = "pa-suggestions";
    ["他的全栈项目怎么实现？", "他如何理解和拆解业务需求？", "他如何排查问题并推进交付？", "他的求职方向和到岗时间？"].forEach(question => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pa-suggestion";
      button.append(document.createTextNode(question));
      const arrow = document.createElement("span");
      arrow.textContent = "↗";
      button.append(arrow);
      button.addEventListener("click", () => ask(question));
      suggestions.append(button);
    });
    const disclosure = document.createElement("div");
    disclosure.className = "pa-disclosure";
    disclosure.textContent = "回答由 AI 基于公开资料生成，可能有遗漏。问题及最近对话会发送给模型服务处理，请勿提交个人敏感信息。具体安排请联系本人确认。";
    box.append(suggestions, disclosure);
    messages.append(box);
    for (const item of entries) addMessage(item.role, item.content, item.sources || []);
    if (!base) {
      state.textContent = "在线问答尚未连接";
      setStatus("在线问答准备中，可先浏览下方项目与在线简历。", false);
    }
    scrollDown();
  }
  function history() {
    let selected = [], length = 0;
    for (let i = entries.length - 1; i >= 0 && selected.length < 8; i--) {
      const item = entries[i];
      const content = item.content.slice(0, 2000);
      if (length + content.length > 6000) break;
      length += content.length;
      selected.unshift({ role: item.role, content: content });
    }
    return selected;
  }
  async function readStream(response, onEvent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true }).replace(/\r\n/g, "\n");
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (!frame || frame.startsWith(":")) continue;
          let kind = "message";
          const data = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) kind = line.slice(6).trim();
            if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
          }
          if (data.length) onEvent(kind, JSON.parse(data.join("\n")));
        }
      }
    } finally { reader.releaseLock(); }
  }
  async function ask(question) {
    if (busy) return;
    question = question.trim();
    if (!question || question.length > 600) return;
    if (!base) {
      setStatus("在线问答暂未开放，欢迎先浏览项目源码与在线简历。", false);
      return;
    }
    const currentVersion = ++version;
    const previousHistory = history();
    const user = { role: "user", content: question };
    entries.push(user);
    addMessage("user", question);
    input.value = "";
    input.style.height = "";
    const assistant = addMessage("assistant", "");
    setBusy(true);
    setStatus("正在查阅公开资料…", true);
    scrollDown();
    controller = new AbortController();
    const timeout = setTimeout(() => controller && controller.abort("timeout"), 90000);
    let text = "", sources = [], completed = false, remoteError = null;
    try {
      const response = await fetch(base + "/api/v1/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, history: previousHistory }),
        signal: controller.signal,
        credentials: "omit",
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(typeof detail.detail === "string" ? detail.detail : "服务暂时不可用，请稍后重试。");
      }
      if (!response.body) throw new Error("当前浏览器不支持流式回答，请换用新版浏览器。");
      await readStream(response, (kind, data) => {
        if (currentVersion !== version) return;
        if (kind === "sources") {
          sources = Array.isArray(data.sources) ? data.sources : [];
          setStatus("找到参考资料，正在组织回答…", true);
        } else if (kind === "token") {
          text += data.text || "";
          const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 100;
          assistant.bubble.textContent = text;
          if (nearBottom) scrollDown();
        } else if (kind === "done") {
          completed = true;
          setStatus(data.grounded ? "回答已完成 · 可展开参考资料核对" : "资料不足 · 可以换个具体问题", false);
        } else if (kind === "error") {
          remoteError = data.message || "回答中断，请重试。";
        }
      });
      if (currentVersion !== version) return;
      if (remoteError) throw new Error(remoteError);
      if (!completed || !text.trim()) throw new Error("连接中断，回答未完成，请稍后重试。");
      renderText(assistant.bubble, text, sources);
      addSources(assistant.row, sources);
      entries.push({ role: "assistant", content: text.slice(0, 4000), sources: sources });
      persist();
    } catch (error) {
      if (currentVersion !== version) return;
      assistant.row.classList.add("is-error");
      const aborted = controller && controller.signal.aborted;
      const message = aborted ? (controller.signal.reason === "timeout" ? "等待超时，请稍后重试。" : "已停止生成。") :
        (error instanceof TypeError ? "暂时连接不到助手，请检查网络或先查看在线简历。" : error.message);
      assistant.bubble.textContent = (text ? text + "\n\n" : "") + message;
      setStatus(message, false);
      // Failed turns do not enter the next retrieval context.
      if (entries[entries.length - 1] === user) entries.pop();
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "pa-retry";
      retry.textContent = "重新提问";
      retry.addEventListener("click", () => ask(question));
      assistant.row.append(retry);
    } finally {
      clearTimeout(timeout);
      if (currentVersion === version) {
        controller = null;
        setBusy(false);
        if (!panel.hidden) input.focus({ preventScroll: true });
      }
    }
  }
  async function checkHealth() {
    if (!base) return;
    try {
      const response = await fetch(base + "/health/ready", { signal: AbortSignal.timeout(7000), credentials: "omit" });
      state.textContent = response.ok ? "在线 · 基于公开资料回答" : "资料准备中 · 可稍后再试";
    } catch (_) { state.textContent = "连接暂不可用 · 可查看在线简历"; }
  }
  function setOpen(open) {
    if (!open) { cancelPanelDrag(); finishResize(); }
    panel.hidden = !open;
    launcher.hidden = open;
    launcher.setAttribute("aria-expanded", String(open));
    if (open) {
      previousFocus = document.activeElement;
      layoutFloating();
      input.focus({ preventScroll: true });
      scrollDown();
      checkHealth();
    } else {
      layoutFloating();
      (previousFocus && previousFocus.isConnected ? previousFocus : launcher).focus({ preventScroll: true });
    }
  }
  launcher.addEventListener("click", () => setOpen(true));
  panel.querySelector(".pa-close").addEventListener("click", () => setOpen(false));
  panel.querySelector(".pa-clear").addEventListener("click", () => {
    version++;
    if (controller) controller.abort();
    controller = null;
    entries = [];
    persist();
    setBusy(false);
    setStatus("", false);
    welcome();
    input.focus();
  });
  panel.querySelector(".pa-foot a").addEventListener("click", () => setOpen(false));
  panel.addEventListener("click", event => {
    const link = event.target.closest(".pa-source a,.pa-bubble a");
    if (link && new URL(link.href).origin === location.origin && new URL(link.href).hash) setOpen(false);
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (busy) { if (controller) controller.abort(); }
    else ask(input.value);
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!busy) ask(input.value);
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
    if (event.key === "Tab") {
      const controls = Array.from(panel.querySelectorAll("button:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex='0']"))
        .filter(control => control.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.querySelectorAll("[data-open-assistant]").forEach(button => button.addEventListener("click", () => setOpen(true)));
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
    if (Array.isArray(saved)) entries = saved.filter(item =>
      item && ["user", "assistant"].includes(item.role) && typeof item.content === "string" && item.content.length <= 4000
    ).slice(-8).map(item => ({ role: item.role, content: item.content, sources: Array.isArray(item.sources) ? item.sources : [] }));
  } catch (_) {}
  welcome();
})();
