/* ============================================================
   仵星 · 个人作品集  main.js
   三件事：移动端菜单 / 滚动渐显 / 导航高亮 + 阅读进度条
   ============================================================ */

// ── 1. 移动端菜单 ──────────────────────────────────────────
const menuBtn = document.getElementById('menuBtn');
const navLinks = document.getElementById('navLinks');
menuBtn.addEventListener('click', () => navLinks.classList.toggle('open'));
// 点击任意导航项后自动收起菜单
navLinks.querySelectorAll('a').forEach(a =>
  a.addEventListener('click', () => navLinks.classList.remove('open'))
);

// ── 2. 滚动渐显（IntersectionObserver，性能友好） ──────────
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
}, { threshold: .15 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// ── 3. 导航高亮当前栏目 + 顶部阅读进度条 ──────────────────
const secs = [...document.querySelectorAll('section[id]')];
const links = [...navLinks.querySelectorAll('a')];
const progress = document.getElementById('progress');

function onScroll() {
  // 当前栏目高亮
  let cur = secs[0].id;
  secs.forEach(s => { if (s.getBoundingClientRect().top <= 120) cur = s.id; });
  links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + cur));
  // 阅读进度条
  const h = document.documentElement;
  const p = h.scrollTop / (h.scrollHeight - h.clientHeight) * 100;
  progress.style.width = p + '%';
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
