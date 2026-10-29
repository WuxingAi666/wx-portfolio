/* A complete, shareable resume dialog. The original details remain usable without JS.
 * Printing uses a temporary document-level copy so dialog scrolling cannot clip pages.
 */
(function () {
  'use strict';
  const source = document.getElementById('resume');
  const resume = source && source.querySelector('.rsm');
  if (!resume) return;
  const supportsDialog = typeof HTMLDialogElement !== 'undefined' && HTMLDialogElement.prototype.showModal;
  const printButton = document.getElementById('printResume');
  let dialog, content, closeButton;
  let trigger = null;
  let closing = false;
  let restoreFocus = true;

  function preparePrint() {
    if (!document.body.classList.contains('print-only-resume') && !(dialog && dialog.open)) return;
    document.body.classList.add('print-only-resume');
    if (document.getElementById('resume-print-root')) return;
    const root = document.createElement('div');
    root.id = 'resume-print-root';
    const copy = resume.cloneNode(true);
    copy.querySelectorAll('.rsm-foot,button').forEach(element => element.remove());
    copy.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
    root.append(copy);
    document.body.append(root);
  }
  function resetPrint() {
    document.getElementById('resume-print-root')?.remove();
    document.body.classList.remove('print-only-resume');
  }
  printButton?.addEventListener('click', () => {
    document.body.classList.add('print-only-resume');
    preparePrint();
    try { window.print(); } catch (error) { resetPrint(); throw error; }
  });
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', resetPrint);
  if (!supportsDialog) return;

  dialog = document.createElement('dialog');
  dialog.id = 'resume-dialog';
  dialog.className = 'resume-dialog';
  dialog.setAttribute('aria-labelledby', 'resume-dialog-title');
  dialog.innerHTML = '<header class="resume-dialog-header"><div class="resume-dialog-heading"><p>RESUME / 仵星</p><h2 id="resume-dialog-title">完整简历</h2></div><div class="resume-dialog-actions"><button class="resume-dialog-close" type="button" aria-label="关闭简历">×</button></div></header><div class="resume-dialog-content" tabindex="0" aria-label="简历正文，可滚动阅读"></div>';
  content = dialog.querySelector('.resume-dialog-content');
  closeButton = dialog.querySelector('.resume-dialog-close');
  if (printButton) dialog.querySelector('.resume-dialog-actions').prepend(printButton);
  document.body.append(dialog);
  source.classList.add('is-enhanced');

  function openResume(opener) {
    if (dialog.open) return;
    trigger = opener || (document.activeElement !== document.body ? document.activeElement : null);
    restoreFocus = true;
    closing = false;
    document.dispatchEvent(new CustomEvent('portfolio:open-modal', { detail: { type: 'resume' } }));
    content.replaceChildren(resume);
    document.body.classList.add('has-resume-dialog');
    source.querySelector('summary').setAttribute('aria-expanded', 'true');
    dialog.showModal();
    content.scrollTop = 0;
    closeButton.focus({ preventScroll: true });
  }
  function closeResume() {
    if (!dialog.open || closing) return;
    if (history.state && history.state.portfolioResume) {
      closing = true;
      history.back();
    } else {
      const url = new URL(location.href);
      url.hash = 'home';
      history.replaceState(history.state, '', url);
      dialog.close();
    }
  }
  function syncLocation() {
    closing = false;
    if (location.hash === '#resume') openResume();
    else if (dialog.open) {
      if (location.hash.startsWith('#details-')) restoreFocus = false;
      dialog.close();
    }
  }
  document.querySelectorAll('[data-resume-open]').forEach(element => {
    element.setAttribute('aria-haspopup', 'dialog');
    element.setAttribute('aria-controls', dialog.id);
  });
  // Delegation also covers the assistant's dynamically created resume link.
  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-resume-open],a[href="#resume"]');
    if (!opener || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = new URL(location.href);
    url.hash = 'resume';
    if (location.hash !== '#resume') history.pushState({ portfolioResume: true }, '', url);
    openResume(opener);
  });
  closeButton.addEventListener('click', closeResume);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeResume(); });
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeResume();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')].filter(element => element.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener('close', () => {
    source.append(resume);
    source.open = false;
    source.querySelector('summary').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('has-resume-dialog');
    closing = false;
    if (restoreFocus && trigger?.isConnected && !document.querySelector('dialog[open]')) trigger.focus({ preventScroll: true });
    trigger = null;
  });
  document.addEventListener('portfolio:open-modal', event => {
    if (event.detail.type === 'resume' || !dialog.open) return;
    restoreFocus = false;
    dialog.close();
  });
  window.addEventListener('popstate', syncLocation);
  window.addEventListener('hashchange', syncLocation);
  syncLocation();
})();
