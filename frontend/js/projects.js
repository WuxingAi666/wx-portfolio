/* Progressive enhancement: native details remain readable without JavaScript.
 * Move the original detail body into one native dialog, preserving all content.
 * A history entry gives every project a shareable URL and Back closes the panel.
 */
(function () {
  "use strict";
  const entries = [...document.querySelectorAll(".work-detail")];
  if (!entries.length || typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal) return;

  const dialog = document.createElement("dialog");
  dialog.id = "project-dialog";
  dialog.className = "project-dialog";
  dialog.setAttribute("aria-labelledby", "project-dialog-title");
  dialog.innerHTML = '<header class="project-dialog-header"><div><p class="project-dialog-eyebrow"></p><h2 id="project-dialog-title"></h2></div><button class="project-dialog-close" type="button" aria-label="关闭项目详情">×</button></header><div class="project-dialog-content"></div>';
  document.body.append(dialog);
  const title = dialog.querySelector("h2");
  const eyebrow = dialog.querySelector(".project-dialog-eyebrow");
  const content = dialog.querySelector(".project-dialog-content");
  const closeButton = dialog.querySelector("button");
  let active = null;
  let closing = false;
  let restoreOnClose = true;

  function returnContent(restoreFocus) {
    if (!active) return;
    const { entry, summary, body } = active;
    entry.append(body);
    entry.open = false;
    summary.setAttribute("aria-expanded", "false");
    if (restoreFocus && summary.isConnected) summary.focus({ preventScroll: true });
    active = null;
  }

  function openProject(entry) {
    if (active && active.entry === entry) return;
    document.dispatchEvent(new CustomEvent('portfolio:open-modal', { detail: { type: 'project' } }));
    restoreOnClose = true;
    returnContent(false);
    const summary = entry.querySelector("summary");
    const body = entry.querySelector(".work-detail-body");
    active = { entry, summary, body };
    content.replaceChildren(body);
    title.textContent = entry.dataset.title;
    eyebrow.textContent = "项目详情 / " + entry.dataset.rank;
    summary.setAttribute("aria-expanded", "true");
    document.body.classList.add("has-project-dialog");
    if (!dialog.open) dialog.showModal();
    content.scrollTop = 0;
    closeButton.focus({ preventScroll: true });
  }

  function syncLocation() {
    closing = false;
    const entry = entries.find(item => "#" + item.id === location.hash);
    if (entry) openProject(entry);
    else if (dialog.open) dialog.close();
  }

  function closeProject() {
    if (!active || closing) return;
    if (history.state && history.state.portfolioProject === active.entry.id) {
      closing = true;
      history.back();
    } else {
      const url = new URL(location.href);
      url.hash = active.entry.closest("[data-project]").id;
      history.replaceState(history.state, "", url);
      dialog.close();
    }
  }

  entries.forEach(entry => {
    const summary = entry.querySelector("summary");
    summary.setAttribute("aria-haspopup", "dialog");
    summary.setAttribute("aria-controls", dialog.id);
    summary.setAttribute("aria-expanded", "false");
    summary.setAttribute("aria-label", entry.dataset.title + "：查看项目详情");
    summary.addEventListener("click", event => {
      event.preventDefault();
      const url = new URL(location.href);
      url.hash = entry.id;
      if (location.hash !== url.hash) history.pushState({ portfolioProject: entry.id }, "", url);
      openProject(entry);
    });
  });
  closeButton.addEventListener("click", closeProject);
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not(:disabled),a[href],[tabindex='0']")]
      .filter(element => element.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.addEventListener("cancel", event => { event.preventDefault(); closeProject(); });
  dialog.addEventListener("click", event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeProject();
  });
  dialog.addEventListener("close", () => {
    returnContent(restoreOnClose && !document.querySelector('dialog[open]'));
    restoreOnClose = true;
    closing = false;
    document.body.classList.remove("has-project-dialog");
  });
  document.addEventListener('portfolio:open-modal', event => {
    if (event.detail.type === 'project' || !dialog.open) return;
    restoreOnClose = false;
    dialog.close();
  });
  window.addEventListener("popstate", syncLocation);
  window.addEventListener("hashchange", syncLocation);
  syncLocation();
})();
