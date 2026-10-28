/* ============================================================
   仵星 · 个人作品集  main.js
   横滑导航 / 清晰正文 / 图片轻透视 / 导航高亮与进度 / 平滑定位 / 简历打印
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

// ── 2. 正文始终清晰可见，避免滚动时文字渐隐造成阅读跳变 ──
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = motionPreference.matches;
const reveals = document.querySelectorAll('.reveal');
function showAllContent() {
  reveals.forEach(el => el.classList.remove('reveal', 'in'));
}
showAllContent();

// ── 图片空间感：不变换文字卡片，不在滚动时持续计算 ───────────
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const resetMediaEffects = [];
document.querySelectorAll('.proj-media').forEach(media => {
  let frame = 0;
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    media.classList.remove('is-tracking');
    media.style.removeProperty('--tilt-x');
    media.style.removeProperty('--tilt-y');
  };
  resetMediaEffects.push(reset);
  media.addEventListener('pointermove', event => {
    if (reduceMotion || !finePointer.matches || event.pointerType !== 'mouse') return;
    cancelAnimationFrame(frame);
    const { clientX, clientY } = event;
    frame = requestAnimationFrame(() => {
      const box = media.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((clientX - box.left) / box.width - .5) * 2));
      const y = Math.max(-1, Math.min(1, ((clientY - box.top) / box.height - .5) * 2));
      media.style.setProperty('--tilt-x', (-y * 1.4).toFixed(2) + 'deg');
      media.style.setProperty('--tilt-y', (x * 1.4).toFixed(2) + 'deg');
      media.classList.add('is-tracking');
      frame = 0;
    });
  }, { passive: true });
  media.addEventListener('pointerleave', reset);
  media.addEventListener('pointercancel', reset);
});
motionPreference.addEventListener('change', event => {
  reduceMotion = event.matches;
  if (reduceMotion) {
    showAllContent();
    resetMediaEffects.forEach(reset => reset());
  }
});
finePointer.addEventListener('change', () => resetMediaEffects.forEach(reset => reset()));

// ── 3. 导航高亮当前栏目 + 滚动收缩 + 阅读进度 + 回到顶部 ──
const nav       = document.getElementById('nav');
const sections  = [...document.querySelectorAll('section[id]')];
const links     = [...navLinks.querySelectorAll('a')];
const progress  = document.getElementById('progress');
const toTop     = document.getElementById('toTop');

function onScroll() {
  const y = window.scrollY || document.documentElement.scrollTop;

  // 导航栏保持不透明白底与固定高度，滚动时只更新状态和当前栏目。
  nav.classList.toggle('scrolled', y > 80);

  // 阅读进度条
  const doc = document.documentElement;
  const p = doc.scrollTop / (doc.scrollHeight - doc.clientHeight) * 100;
  progress.style.width = (isFinite(p) ? p : 0) + '%';

  // 当前栏目高亮（取视口顶部的 section）
  const sectionThreshold = nav.offsetHeight + Math.min(150, innerHeight * .16);
  let cur = sections[0].id;
  for (const s of sections) { if (s.getBoundingClientRect().top <= sectionThreshold) cur = s.id; }
  links.forEach(link => {
    const active = link.getAttribute('href') === '#' + cur;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });

  // 移动端导航条：当前项自动横向滚到中间（仅滚动导航条自身，不干扰页面）
  if (window.innerWidth <= 768) {
    const act = links.find(l => l.classList.contains('active'));
    if (act) {
      const nr = navLinks.getBoundingClientRect();
      const ar = act.getBoundingClientRect();
      const target = navLinks.scrollLeft + (ar.left + ar.width / 2) - (nr.left + nr.width / 2);
      if (Math.abs(navLinks.scrollLeft - target) > 24)
        navLinks.scrollTo({ left: Math.max(0, target), behavior: reduceMotion ? 'instant' : 'smooth' });
    }
  }

  // 回到顶部按钮：滚动超过 800px 后淡入
  toTop.classList.toggle('show', y > 800);
}
let scrollFrame = 0;
window.addEventListener('scroll', () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; onScroll(); });
}, { passive: true });
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
    const y = target.getBoundingClientRect().top + window.scrollY - navH - 16;
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
