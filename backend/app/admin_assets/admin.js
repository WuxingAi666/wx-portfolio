/* Private console: HttpOnly sessions, text-only rendering, no token in storage. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = new URL('../api/v1/admin/', location.href);
  const labels = { active: '回答中', ok: '已完成', error: '回答失败', cancelled: '访客停止', interrupted: '服务中断' };
  const state = { authenticated: false, epoch: 0, version: 0, revision: -1, page: 1, visitorPage: 1, visitor: '', selected: '', current: null, profile: null, attention: '', filters: {}, busy: false, mutation: false, timer: null, controller: null };
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
  const when = (value, compact = false) => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', ...(compact ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—';
  const number = n => Number(n || 0).toLocaleString('zh-CN');
  const chip = status => node('span', labels[status] || status, 'status-chip status-' + status);
  function button(text, callback, cls = '') { const el = node('button', text, cls); el.type = 'button'; el.addEventListener('click', () => Promise.resolve().then(callback).catch(error)); return el; }
  function message(text = '') { $('workspace-message').textContent = text; }
  function error(exc) { if (exc.name !== 'AbortError' && state.authenticated) message(exc.message || '请求失败，请稍后重试。'); }
  function empty(title, text) { const el = node('div', null, 'empty-state'); el.append(node('h2', title), node('p', text)); return el; }
  function resetDetail() { state.selected = ''; state.current = null; $('path-detail').disabled = true; $('conversation-detail').replaceChildren(empty('选择一段对话', '从访客或会话列表开始，查看完整问题、回答与引用。')); }
  function step(value) {
    $('inbox').dataset.step = value;
    for (const name of ['visitors', 'conversations', 'detail']) $('path-' + name).setAttribute('aria-current', name === value ? 'step' : 'false');
    if (state.authenticated && matchMedia('(max-width:700px)').matches) requestAnimationFrame(() => document.querySelector('.mobile-path').scrollIntoView({ block: 'start' }));
  }
  function loggedOut(text = '') {
    state.authenticated = false; ++state.epoch; ++state.version;
    state.controller?.abort(); clearTimeout(state.timer);
    state.current = state.profile = null; state.selected = state.visitor = ''; state.filters = {}; state.page = state.visitorPage = 1; state.attention = ''; state.revision = -1;
    $('filters').reset(); $('custom-dates').hidden = true;
    document.querySelectorAll('[data-attention]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.attention === '')));
    for (const id of ['profile-dialog', 'delete-dialog']) if ($(id).open) $(id).close();
    for (const id of ['visitor-list', 'conversation-list', 'visitor-context', 'conversation-detail', 'trend', 'top-questions']) $(id).replaceChildren();
    for (const el of document.querySelectorAll('[id^=metric-]')) el.textContent = '—';
    $('filter-context').textContent = ''; $('profile-label').textContent = ''; message();
    $('profile-form').reset(); $('workspace').hidden = true; $('login-view').hidden = false; $('admin-token').value = '';
    $('login-message').textContent = text || '密码仅用于登录，不保存在浏览器存储中。';
    $('login-message').classList.toggle('is-error', Boolean(text));
    step('visitors');
  }
  async function request(path, options = {}, raw = false) {
    const epoch = state.epoch;
    const headers = { ...options.headers };
    if (options.method && options.method !== 'GET') { headers['X-Admin-Request'] = '1'; headers['Content-Type'] = 'application/json'; }
    const response = await fetch(new URL(path, api), { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
    if (epoch !== state.epoch) throw new DOMException('Session changed', 'AbortError');
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 && state.authenticated) loggedOut('登录已过期，请重新输入管理员口令。');
      const exc = new Error(typeof data.detail === 'string' ? data.detail : '请求未完成，请检查输入后重试。'); exc.status = response.status; throw exc;
    }
    return raw ? response : response.json();
  }
  function query(withVisitor = true) {
    const q = new URLSearchParams(state.filters);
    if (state.attention) q.set('attention', state.attention);
    if (withVisitor && state.visitor) q.set('visitor', state.visitor);
    return q;
  }
  function health(data) {
    const badge = $('recording-badge');
    badge.textContent = !data.recording_healthy ? '记录服务待检查' : !data.recording_enabled ? '记录服务已关闭' : '记录服务正常';
    badge.classList.toggle('is-warning', !data.recording_healthy || !data.recording_enabled);
    badge.title = `本次服务启动后累计记录异常 ${data.recording_failures || 0} 次`;
    $('footer-state').textContent = !data.recording_healthy ? '问答仍可使用；请检查服务端记录日志。' : '首段回答即时保存，后续约每秒保存；面板每 5 秒同步。';
  }
  function renderMetrics(data) {
    for (const key of ['visitors', 'conversations', 'turns', 'active', 'tokens']) $('metric-' + key).textContent = number(data[key]);
    $('metric-rate').textContent = data.turns ? (100 * data.completed / data.turns).toFixed(0) + '%' : '—';
    $('metric-completed').textContent = `${number(data.completed)} 完成 / ${number(data.failed)} 失败或中断 / ${number(data.cancelled)} 停止`;
    $('metric-latency').textContent = data.completed ? (data.avg_elapsed_ms / 1000).toFixed(1) + ' s' : '—';
    const max = Math.max(1, ...data.trend.map(item => item.count));
    const bars = data.trend.map(item => { const col = node('div', null, 'trend-column'); col.setAttribute('aria-label', `${item.date}：${item.count} 次提问`); const bar = node('div', null, 'trend-bar'); bar.style.height = (65 * item.count / max + 3) + 'px'; col.append(node('span', number(item.count)), bar, node('span', item.date.slice(5))); return col; });
    $('trend').replaceChildren(...bars);
    $('top-questions').replaceChildren(...data.top_questions.map(item => { const b = button('', () => { $('search').value = item.question.slice(0, 100); applyFilters(); }); b.append(node('span', item.question), node('b', '× ' + item.count)); b.title = item.question; return b; }));
    if (!data.top_questions.length) $('top-questions').append(node('p', '当前范围暂无提问', 'muted'));
  }
  function pagination(prefix, data) {
    const pages = Math.max(1, Math.ceil(data.total / data.page_size));
    const names = prefix ? ['visitor-page', 'visitor-previous', 'visitor-next'] : ['page-note', 'previous', 'next'];
    $(names[0]).textContent = `${data.page} / ${pages}`; $(names[1]).disabled = data.page <= 1; $(names[2]).disabled = data.page >= pages;
  }
  // Replacing a list must not reset its scroll position or keyboard focus.
  function replaceList(id, items) {
    const list = $(id), scroll = list.scrollTop;
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.id : null;
    list.replaceChildren(...items); list.scrollTop = scroll;
    if (focused) Array.from(list.children).find(el => el.dataset.id === focused)?.focus({ preventScroll: true });
  }
  function renderVisitors(data) {
    $('visitor-count').textContent = number(data.total) + ' 位'; pagination('visitor', data);
    $('all-visitors').setAttribute('aria-pressed', String(!state.visitor));
    const items = data.items.map(item => {
      const b = button('', () => selectVisitor(item.id), 'visitor-item'); b.dataset.id = item.id; b.setAttribute('aria-current', String(item.id === state.visitor));
      const row = node('div', null, 'visitor-line'), title = node('div', null, 'visitor-title');
      title.append(node('strong', item.display_name || item.label), node('small', item.display_name ? item.label : '匿名浏览器'));
      row.append(node('span', item.display_name ? item.display_name.slice(0, 1) : item.id.slice(0, 2).toUpperCase(), 'avatar'), title);
      if (item.unread) { const dot = node('span', null, 'unread-dot'); dot.title = item.unread + ' 段未读会话'; row.append(dot); }
      const meta = node('div', null, 'item-meta'); meta.append(node('span', `${item.conversations} 段会话 · ${item.turns} 次提问`), node('span', item.active ? '回答中' : ''));
      b.append(row, meta, node('div', '最近 ' + when(item.last_seen, true), 'item-time')); return b;
    });
    replaceList('visitor-list', items.length ? items : [empty('暂无访客', '新提问会在这里自动出现。')]);
  }
  function renderProfile(profile) {
    const area = $('visitor-context');
    if (!profile) { area.replaceChildren(node('p', '全部匹配会话 · 每段展示完整问答')); return; }
    const title = node('strong', profile.display_name || profile.label);
    const content = [title];
    if (profile.display_name) content.push(node('div', profile.label));
    content.push(node('div', `共 ${profile.conversations} 段会话 · ${profile.turns} 次提问`), node('div', '首次 ' + when(profile.first_seen, true)));
    if (profile.notes) content.push(node('p', profile.notes));
    content.push(button('编辑访客备注', () => editProfile(profile.id)));
    area.replaceChildren(...content);
  }
  function renderSessions(data) {
    $('result-count').textContent = number(data.total) + ' 段'; pagination('', data);
    const items = data.items.map(item => {
      const b = button('', () => selectSession(item.id), 'conversation-item'); b.dataset.id = item.id; b.setAttribute('aria-current', String(item.id === state.selected));
      const top = node('div', null, 'session-top');
      if (item.unread) top.append(node('span', null, 'unread-dot'), node('span', '未读'));
      if (item.favorite) top.append(node('span', '★ 已收藏'));
      if (top.childNodes.length) b.append(top);
      const meta = node('div', null, 'item-meta'); meta.append(node('span', `${item.turn_count} 次提问`), chip(item.status));
      b.append(node('strong', item.title), node('div', item.display_name || item.visitor, 'item-time'), meta, node('div', when(item.updated_at), 'item-time')); return b;
    });
    replaceList('conversation-list', items.length ? items : [empty('暂无匹配会话', '调整搜索、日期或关注分类后重试。')]);
  }
  function answerContent(text) {
    const body = node('div', null, 'turn-answer');
    // A small display subset: create DOM nodes, never parse model output as HTML.
    function inline(target, value) {
      const tokens = value.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
      for (const token of tokens) {
        if (token.startsWith('**') && token.endsWith('**')) target.append(node('strong', token.slice(2, -2)));
        else if (token.startsWith('`') && token.endsWith('`')) target.append(node('code', token.slice(1, -1)));
        else target.append(document.createTextNode(token));
      }
    }
    let list = null, paragraph = null, code = null;
    for (const line of text.split('\n')) {
      if (line.trimStart().startsWith('```')) {
        if (code) code = null;
        else { const pre = node('pre'); code = node('code'); pre.append(code); body.append(pre); }
        list = paragraph = null; continue;
      }
      if (code) { code.append(document.createTextNode(line + '\n')); continue; }
      if (!line.trim()) { list = paragraph = null; continue; }
      const heading = line.match(/^#{1,6}\s+(.+)$/), bullet = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.+)$/);
      if (heading) { const h = node('h3'); inline(h, heading[1]); body.append(h); list = paragraph = null; }
      else if (bullet) {
        if (!list) { list = node('ul'); body.append(list); }
        const item = node('li'); inline(item, bullet[1]); list.append(item); paragraph = null;
      } else {
        if (!paragraph) { paragraph = node('p'); body.append(paragraph); }
        else paragraph.append(document.createTextNode('\n'));
        inline(paragraph, line); list = null;
      }
    }
    return body;
  }
  function renderDetail(data) {
    const area = $('conversation-detail');
    const selection = window.getSelection();
    // Let the owner finish selecting/copying text before replacing a live answer.
    if (selection && !selection.isCollapsed && area.contains(selection.anchorNode) && state.current?.id === data.id) { state.deferred = true; return; }
    state.deferred = false;
    if (state.current && JSON.stringify(state.current) === JSON.stringify(data)) return;
    const same = state.current?.id === data.id, scroll = same ? area.scrollTop : 0;
    const opened = new Set(same ? Array.from(area.querySelectorAll('details[open]')).map(el => el.dataset.turn) : []);
    const focused = same && area.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    state.current = data;
    const header = node('header', null, 'detail-header'), identity = node('div', null, 'detail-eyebrow');
    identity.append(node('span', data.display_name ? `${data.display_name} · ${data.visitor}` : data.visitor), button('访客备注', () => editProfile(data.visitor_id)));
    header.append(identity, node('h2', data.turns[0]?.question || '会话详情'), node('p', `${data.turns.length} 次提问 · 开始于 ${when(data.created_at)} · 完整会话`, 'detail-meta'));
    if (data.notes) { const note = node('div', null, 'profile-note'); note.append(node('strong', '管理员备注'), node('span', data.notes)); header.append(note); }
    const actions = node('div', null, 'detail-actions');
    const favorite = button(data.favorite ? '★ 已收藏' : '☆ 收藏会话', () => annotate({ favorite: !state.current.favorite }), data.favorite ? 'is-active' : ''); favorite.dataset.action = 'favorite'; favorite.setAttribute('aria-pressed', String(data.favorite));
    const reviewed = button(data.unread ? '标为已读' : '标为未读', () => annotate({ reviewed: state.current.unread })); reviewed.dataset.action = 'reviewed';
    const remove = button('删除', () => { $('delete-message').textContent = ''; $('delete-dialog').dataset.cid = state.selected; $('delete-dialog').showModal(); }, 'danger'); remove.disabled = data.turns.some(t => t.status === 'active'); remove.title = remove.disabled ? '回答结束后可删除' : '删除整段会话'; remove.dataset.action = 'delete';
    actions.append(favorite, reviewed, button('导出 JSON', () => exportCurrent('json')), button('导出 Markdown', () => exportCurrent('md')), remove); header.append(actions);
    const body = node('div', null, 'turns');
    data.turns.forEach((turn, i) => {
      const article = node('article', null, 'turn'), label = node('div', null, 'turn-label');
      label.append(node('strong', `提问 ${String(i + 1).padStart(2, '0')}`), node('span', when(turn.created_at)), chip(turn.status));
      article.append(label, node('p', turn.question, 'turn-question'), node('span', '助手回答', 'answer-label'), answerContent(turn.answer || (turn.status === 'active' ? '正在生成，内容会自动同步…' : '本次未生成可保存的回答。')));
      const meta = node('div', null, 'turn-note');
      meta.append(node('span', (turn.elapsed_ms / 1000).toFixed(1) + ' 秒'), node('span', number(turn.tokens) + ' Token'), node('span', turn.grounded === true ? '已召回资料' : turn.grounded === false ? '未召回资料' : '召回状态待确认'));
      article.append(meta);
      const sources = node('details', null, 'turn-sources'); sources.dataset.turn = turn.id; sources.open = opened.has(turn.id);
      sources.append(node('summary', turn.sources.length ? `检索依据 · ${turn.sources.length} 条引用` : '查看请求标识'));
      turn.sources.forEach(source => { const item = node('div', null, 'source-item'); item.append(node('strong', `[${source.id}] ${source.title}`), node('p', source.excerpt)); sources.append(item); });
      sources.append(node('p', 'Request ID: ' + turn.id, 'request-id')); article.append(sources); body.append(article);
    });
    area.replaceChildren(header, body); area.scrollTop = scroll;
    if (focused) Array.from(area.querySelectorAll('[data-action]')).find(el => el.dataset.action === focused)?.focus({ preventScroll: true });
  }
  async function refresh() {
    if (!state.authenticated || state.mutation) return;
    const version = ++state.version; state.controller?.abort();
    const controller = new AbortController(); state.controller = controller; state.busy = true;
    const options = { signal: controller.signal };
    const visitor = state.visitor, selected = state.selected;
    try {
      // Read the watermark first: changes occurring during the fetch stay pending.
      const changes = await request('changes', options);
      const q = query(), vq = query(false); vq.set('page', state.visitorPage); vq.set('page_size', '20');
      const cq = new URLSearchParams(q); cq.set('page', state.page); cq.set('page_size', '20');
      const [metrics, visitors, sessions, profile, detail] = await Promise.all([
        request('conversations/overview?' + q, options), request('visitors?' + vq, options), request('conversations?' + cq, options),
        visitor ? request('visitors/' + visitor, options).catch(exc => { if (exc.status !== 404) throw exc; return null; }) : null,
        selected ? request('conversations/' + selected, options).catch(exc => { if (exc.status !== 404) throw exc; return null; }) : null
      ]);
      if (version !== state.version || !state.authenticated) return;
      if (state.page > Math.max(1, Math.ceil(sessions.total / 20))) { state.page = Math.max(1, Math.ceil(sessions.total / 20)); return refresh(); }
      if (state.visitorPage > Math.max(1, Math.ceil(visitors.total / 20))) { state.visitorPage = Math.max(1, Math.ceil(visitors.total / 20)); return refresh(); }
      if (visitor && !profile) { state.visitor = ''; resetDetail(); return refresh(); }
      state.profile = profile;
      health(changes); renderMetrics(metrics); renderVisitors(visitors); renderSessions(sessions); renderProfile(profile);
      if (detail) renderDetail(detail); else if (selected) resetDetail();
      state.revision = changes.revision;
      $('filter-context').textContent = (profile ? (profile.display_name || profile.label) + ' · ' : '') + '统计/导出为匹配问答；详情保留完整会话';
      $('last-updated').textContent = '已同步 ' + new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
      $('path-detail').disabled = !state.selected;
    } finally { if (version === state.version) state.busy = false; }
  }
  async function selectVisitor(id = '') { state.visitor = id; state.page = 1; resetDetail(); step('conversations'); message(); await refresh(); }
  async function selectSession(id) { state.selected = id; $('path-detail').disabled = false; step('detail'); message(); await refresh(); }
  function day(offset = 0) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const map = Object.fromEntries(parts.map(p => [p.type, p.value])); const date = new Date(`${map.year}-${map.month}-${map.day}T00:00:00+08:00`); date.setTime(date.getTime() + offset * 86400000); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
  function applyFilters() {
    const period = $('period').value;
    $('custom-dates').hidden = period !== 'custom';
    let from = '', to = '';
    if (period === 'custom') { from = $('date-from').value; to = $('date-to').value; }
    else if (period) { from = day(period === 'today' ? 0 : 1 - Number(period)); to = day(); }
    if (from && to && from > to) { message('起始日期不能晚于结束日期。'); return; }
    state.filters = {};
    for (const [key, value] of [['search', $('search').value.trim()], ['status', $('filter-status').value], ['date_from', from], ['date_to', to]]) if (value) state.filters[key] = value;
    state.page = state.visitorPage = 1; resetDetail(); message(); refresh().catch(error);
  }
  async function annotate(values) {
    if (!state.selected || state.mutation) return;
    await mutate(() => request('conversations/' + state.selected, { method: 'PATCH', body: JSON.stringify(values) }));
  }
  async function mutate(operation) {
    state.mutation = true; state.controller?.abort(); ++state.version; state.busy = false;
    try { await operation(); } finally { state.mutation = false; }
    await refresh();
  }
  async function editProfile(id) {
    const data = await request('visitors/' + id);
    $('profile-dialog').dataset.visitor = id; $('profile-label').textContent = data.label;
    $('profile-name').value = data.display_name; $('profile-notes').value = data.notes; $('profile-message').textContent = '';
    $('profile-dialog').showModal();
  }
  function download(blob, name) { const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async function exportCurrent(format) {
    const id = state.selected; if (!id) return;
    const data = await request('conversations/' + id + '?export=true');
    if (format === 'json') download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'conversation-' + id + '.json');
    else {
      const text = [`# ${data.display_name || data.visitor} · 对话记录`, `开始时间：${when(data.created_at)}（北京时间）`, '以下为原始问答文本。', ...data.turns.map((t, i) => `\n## 提问 ${i + 1}\n\n${t.question}\n\n### 助手回答\n\n${t.answer}\n\n状态：${labels[t.status]} · ${when(t.created_at)}\n\n${t.sources.map(s => `[${s.id}] ${s.title}\n${s.excerpt}`).join('\n\n')}`)].join('\n\n');
      download(new Blob([text], { type: 'text/markdown;charset=utf-8' }), 'conversation-' + id + '.md');
    }
  }
  async function exportFiltered(format) {
    const q = query(); q.set('format', format);
    const response = await request('conversations/export?' + q, {}, true);
    download(await response.blob(), 'conversations-' + day() + '.' + format);
    document.querySelector('.export-menu').open = false; message('已导出当前筛选范围内的匹配问答。');
  }
  function schedule() { clearTimeout(state.timer); if (state.authenticated) state.timer = setTimeout(poll, 5000); }
  async function poll() {
    try {
      if (!state.authenticated || !$('auto-refresh').checked || document.hidden || state.busy || state.mutation || document.querySelector('dialog[open]')) return;
      const version = state.version, epoch = state.epoch;
      const changes = await request('changes');
      if (version !== state.version || epoch !== state.epoch || !state.authenticated) return;
      health(changes);
      // Also retry a detail update deferred while the owner selected text.
      if (changes.revision !== state.revision || state.deferred) await refresh();
    } catch (exc) { error(exc); } finally { schedule(); }
  }
  async function enter() {
    const session = await request('session');
    if (!session.authenticated) { loggedOut(); return; }
    state.authenticated = true; $('login-view').hidden = true; $('workspace').hidden = false; message();
    if (!state.selected) resetDetail();
    $('retention-note').textContent = `保留最近 ${session.retention_days} 天；时间显示与日期筛选均为北京时间。匿名编号不代表真实身份。`;
    health(session); await refresh(); schedule();
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); const b = event.submitter; b.disabled = true;
    try { await request('session', { method: 'POST', body: JSON.stringify({ token: $('admin-token').value.trim() }) }); $('admin-token').value = ''; await enter(); }
    catch (exc) { if (exc.name !== 'AbortError') { $('login-message').textContent = exc.message; $('login-message').classList.add('is-error'); } }
    finally { b.disabled = false; }
  });
  $('logout').addEventListener('click', async () => {
    clearTimeout(state.timer); state.controller?.abort(); ++state.version;
    try { await request('session', { method: 'DELETE' }); loggedOut(); } catch (exc) { error(exc); schedule(); }
  });
  $('filters').addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
  for (const id of ['filter-status', 'period', 'date-from', 'date-to']) $(id).addEventListener('change', applyFilters);
  $('reset-filters').addEventListener('click', () => { $('filters').reset(); state.attention = ''; state.visitor = ''; document.querySelectorAll('[data-attention]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.attention === ''))); applyFilters(); step('visitors'); });
  $('attention-tabs').addEventListener('click', event => { const b = event.target.closest('[data-attention]'); if (!b) return; state.attention = b.dataset.attention; document.querySelectorAll('[data-attention]').forEach(el => el.setAttribute('aria-pressed', String(el === b))); state.page = state.visitorPage = 1; resetDetail(); message(); refresh().catch(error); });
  $('all-visitors').addEventListener('click', () => selectVisitor().catch(error));
  for (const [id, key, delta] of [['previous', 'page', -1], ['next', 'page', 1], ['visitor-previous', 'visitorPage', -1], ['visitor-next', 'visitorPage', 1]]) $(id).addEventListener('click', () => { state[key] = Math.max(1, state[key] + delta); refresh().catch(error); });
  for (const name of ['visitors', 'conversations', 'detail']) $('path-' + name).addEventListener('click', () => step(name));
  $('refresh').addEventListener('click', async () => { $('refresh').disabled = true; message(); try { await refresh(); } catch (exc) { error(exc); } finally { $('refresh').disabled = false; } });
  for (const format of ['json', 'csv']) $('export-' + format).addEventListener('click', () => exportFiltered(format).catch(error));
  for (const id of ['profile-close', 'profile-cancel']) $(id).addEventListener('click', () => $('profile-dialog').close());
  $('profile-form').addEventListener('submit', async event => {
    event.preventDefault(); $('profile-save').disabled = true;
    try { await mutate(async () => { await request('visitors/' + $('profile-dialog').dataset.visitor, { method: 'PATCH', body: JSON.stringify({ display_name: $('profile-name').value.trim(), notes: $('profile-notes').value.trim() }) }); $('profile-dialog').close(); }); message('访客备注已保存，仅在后台显示。'); }
    catch (exc) { $('profile-message').textContent = exc.message; } finally { $('profile-save').disabled = false; }
  });
  $('delete-cancel').addEventListener('click', () => $('delete-dialog').close());
  $('delete-confirm').addEventListener('click', async () => {
    $('delete-confirm').disabled = true;
    try { await mutate(async () => { await request('conversations/' + $('delete-dialog').dataset.cid, { method: 'DELETE' }); $('delete-dialog').close(); resetDetail(); step('conversations'); }); message('会话已删除，其他会话和用量账本保持独立。'); }
    catch (exc) { $('delete-message').textContent = exc.message; } finally { $('delete-confirm').disabled = false; }
  });
  $('auto-refresh').addEventListener('change', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearTimeout(state.timer); poll(); } });
  enter().catch(exc => loggedOut(exc.name === 'AbortError' ? '' : exc.message));
})();
