/* ============================================================
   仵星 · 个人作品集  main.js
   四件事：移动端右滑侧边栏 / 滚动渐显 / 导航高亮 + 滚动收缩 + 进度条 / 回到顶部
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

// ── 2. 滚动渐显（IntersectionObserver，仅触发一次） ────────
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = document.querySelectorAll('.reveal');
if (reduceMotion) {
  reveals.forEach(el => el.classList.add('in'));            // 减少动画：直接显示
} else {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }  // 只触发一次
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
const vh        = () => window.innerHeight;

function onScroll() {
  const y = window.scrollY || document.documentElement.scrollTop;

  // 导航栏滚动收缩（背景加深、高度收缩、阴影）
  nav.classList.toggle('scrolled', y > 30);

  // 阅读进度条
  const doc = document.documentElement;
  const p = doc.scrollTop / (doc.scrollHeight - doc.clientHeight) * 100;
  progress.style.width = (isFinite(p) ? p : 0) + '%';

  // 当前栏目高亮（取视口顶部的 section）
  let cur = sections[0].id;
  for (const s of sections) { if (s.getBoundingClientRect().top <= 120) cur = s.id; }
  links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + cur));

  // 回到顶部按钮：滚动超过一屏后淡入
  toTop.classList.toggle('show', y > vh());
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// 回到顶部：平滑滚动（尊重减少动画）
toTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
});
