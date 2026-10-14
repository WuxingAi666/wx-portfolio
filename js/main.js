/* ============================================================
   仵星 · 个人作品集  main.js
   五件事：移动端右滑侧边栏 / 滚动渐显（板块内 100ms 错落）/ 导航高亮 + 滚动收缩 + 进度条 / 回到顶部 / 锚点平滑滚动（500ms）
   纯原生 JS，无依赖；尊重 prefers-reduced-motion
   ============================================================ */

// ── 1. 移动端右滑侧边栏 ────────────────────────────────────
const menuBtn   = document.getElementById('menuBtn');
const navLinks  = document.getElementById('navLinks');
const navOverlay= document.getElementById('navOverlay');

// 打开 / 关闭侧边栏（统一入口，便于多处调用）
function setMenu(open) {
  navLinks.classList.toggle('open', open);
  navOverlay.classList.toggle('show', open);
  menuBtn.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';   // 打开时锁定背景滚动
}
menuBtn.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
navOverlay.addEventListener('click', () => setMenu(false));
navLinks.querySelectorAll('a').forEach(a =>
  a.addEventListener('click', () => setMenu(false)));      // 点击菜单项后自动收回
document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

// 视口放大到桌面端（>768px）时，若侧边栏仍处于打开态则自动收起，避免旋转 / 缩放后卡在打开态
window.addEventListener('resize', () => {
  if (window.innerWidth > 768 && navLinks.classList.contains('open')) setMenu(false);
});

// ── 2. 滚动渐显（按板块内元素顺序 100ms 错落；仅触发一次） ────────
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = document.querySelectorAll('.reveal');

if (reduceMotion) {
  // 减少动画：不做渐显，直接移除 reveal 类呈现内容
  // （同样是为了解绑 .reveal.in{transform:none} 对悬停位移的压制）
  reveals.forEach(el => el.classList.remove('reveal', 'in'));
} else {
  // 预先计算每个板块内 .reveal 的错落延迟（同板块第 i 个 → i×100ms）
  document.querySelectorAll('section').forEach(sec => {
    [...sec.querySelectorAll('.reveal')].forEach((el, i) => { el.dataset.delay = i * 100; });
  });
  // 入场动画结束后移除 reveal / in 类（关键修复）：
  // .reveal.in{transform:none} 与 .proj-card:hover{transform:translateY(-4px)} 特异度相同（0,2,0），
  // 且 .reveal.in 写在 CSS 后面 —— 会永久压制项目卡 / 信息卡 / 技能卡的悬停位移，
  // 同时把卡片过渡时长从 250ms 顶成 350ms。移除后彻底解绑，悬停与时长均回归设计值。
  function finishReveal(el) {
    const delay = parseInt(el.dataset.delay || 0, 10);
    setTimeout(() => {
      el.classList.remove('reveal', 'in');
      el.style.transitionDelay = '';
    }, delay + 450);
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.style.transitionDelay = (el.dataset.delay || 0) + 'ms';   // 注入错落延迟
      el.classList.add('in');
      io.unobserve(el);                                     // 只触发一次
      finishReveal(el);
    });
  }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
  // 延后两帧再开始观察：先让元素以 opacity:0 完成首帧绘制，
  // 避免移动端首屏下方已在视口内的元素被同步加 .in 而跳过 transition（导致“无动画”）
  requestAnimationFrame(() => requestAnimationFrame(() => {
    reveals.forEach(el => io.observe(el));
  }));
}

// ── 3. 导航高亮当前栏目 + 滚动收缩 + 阅读进度 + 回到顶部 ──
const nav       = document.getElementById('nav');
const sections  = [...document.querySelectorAll('section[id]')];
const links     = [...navLinks.querySelectorAll('a')];
const progress  = document.getElementById('progress');
const toTop     = document.getElementById('toTop');

function onScroll() {
  const y = window.scrollY || document.documentElement.scrollTop;

  // 导航栏：滚动超过 80px 后收缩为半透明白色悬浮栏（背景加深、高度收缩、阴影）
  nav.classList.toggle('scrolled', y > 80);

  // 阅读进度条
  const doc = document.documentElement;
  const p = doc.scrollTop / (doc.scrollHeight - doc.clientHeight) * 100;
  progress.style.width = (isFinite(p) ? p : 0) + '%';

  // 当前栏目高亮（取视口顶部的 section）
  let cur = sections[0].id;
  for (const s of sections) { if (s.getBoundingClientRect().top <= 120) cur = s.id; }
  links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + cur));

  // 移动端导航条：当前项自动横向滚到中间（仅滚动导航条自身，不干扰页面）
  if (window.innerWidth <= 768) {
    const act = links.find(l => l.classList.contains('active'));
    if (act) {
      const nr = navLinks.getBoundingClientRect();
      const ar = act.getBoundingClientRect();
      const target = navLinks.scrollLeft + (ar.left + ar.width / 2) - (nr.left + nr.width / 2);
      if (Math.abs(navLinks.scrollLeft - target) > 24)
        navLinks.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
  }

  // 回到顶部按钮：滚动超过 800px 后淡入
  toTop.classList.toggle('show', y > 800);
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ── 4. 平滑滚动（锚点跳转 500ms / 回到顶部） ───────────────
// ease-out cubic，时长 500ms；尊重减少动画时直接跳
function smoothScrollTo(targetY, duration = 500) {
  if (reduceMotion) { window.scrollTo(0, targetY); return; }
  const startY = window.scrollY;
  const dist   = targetY - startY;
  const start  = performance.now();
  (function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);                 // ease-out：先快后慢
    window.scrollTo(0, startY + dist * eased);
    if (t < 1) requestAnimationFrame(step);
  })(performance.now());
}

// 锚点跳转：全局平滑滚动 500ms（偏移按导航栏实际高度动态取，避免改了导航高度后标题被盖住）
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1);
    const target = id ? document.getElementById(id) : null;
    if (!target) return;                                  // 空锚点（#）放行默认
    e.preventDefault();
    const navH = nav.offsetHeight || 64;                  // 顶部 64px，滚动后收缩为 56px
    const y = target.getBoundingClientRect().top + window.scrollY - navH;
    smoothScrollTo(Math.max(0, y), 500);
  });
});

// 回到顶部
toTop.addEventListener('click', () => smoothScrollTo(0, 500));

/* ── 在线简历：只打印该区块（替代静态 PDF 下载，输出永远与网页同步，杜绝版本漂移） ── */
(function () {
  const btn = document.getElementById('printResume');
  if (!btn) return;
  const reset = () => document.body.classList.remove('print-only-resume');

  btn.addEventListener('click', () => {
    document.body.classList.add('print-only-resume');
    window.print();
    setTimeout(reset, 1200);          // 兜底：部分浏览器 print() 非阻塞
  });
  window.addEventListener('afterprint', reset);
})();
