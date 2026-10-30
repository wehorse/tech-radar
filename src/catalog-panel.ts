/** A hover preview that can also be pinned open or controlled by keyboard. */
export function setupCatalogPanel() {
  const shell = document.querySelector<HTMLElement>("#catalog-drawer")!;
  const panel = document.querySelector<HTMLElement>("#technology-catalog")!;
  const toggle = document.querySelector<HTMLButtonElement>("#catalog-toggle")!;
  const pin = document.querySelector<HTMLButtonElement>("#catalog-pin")!;
  const close = document.querySelector<HTMLButtonElement>("#catalog-close")!;
  let pinned = false;
  let hovered = false;
  let focused = false;
  let dismissed = false;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;

  function render() {
    const open = !dismissed && (pinned || hovered || focused);
    shell.classList.toggle("is-open", open);
    panel.inert = !open;
    panel.setAttribute("aria-hidden", String(!open));
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute(
      "aria-label",
      pinned ? "Close technologies panel" : "Open technologies panel",
    );
    toggle.title = pinned
      ? "Close technologies panel"
      : "Hover to preview; click to keep open";
    pin.setAttribute("aria-pressed", String(pinned));
    pin.textContent = pinned ? "Unpin" : "Pin";
    pin.setAttribute(
      "aria-label",
      pinned ? "Unpin technologies panel" : "Keep technologies panel open",
    );
  }

  function show(focusSearch = false) {
    clearTimeout(leaveTimer);
    dismissed = false;
    pinned = true;
    render();
    if (focusSearch) panel.querySelector<HTMLInputElement>("#search")!.focus();
  }

  function hide() {
    clearTimeout(leaveTimer);
    dismissed = true;
    pinned = false;
    hovered = false;
    focused = false;
    if (panel.contains(document.activeElement)) toggle.focus();
    render();
  }

  shell.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "mouse") return;
    clearTimeout(leaveTimer);
    hovered = true;
    render();
  });
  shell.addEventListener("pointerleave", () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      hovered = false;
      dismissed = false;
      render();
    }, 180);
  });
  panel.addEventListener("focusin", () => {
    focused = true;
    render();
  });
  panel.addEventListener("focusout", () => {
    queueMicrotask(() => {
      focused = panel.contains(document.activeElement);
      render();
    });
  });
  toggle.addEventListener("click", () => (pinned ? hide() : show()));
  pin.addEventListener("click", (event) => {
    pinned = !pinned;
    if (!pinned && event.detail > 0) {
      pin.blur();
      focused = false;
    }
    render();
  });
  close.addEventListener("click", hide);
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      shell.classList.contains("is-open") &&
      !document.querySelector<HTMLDialogElement>("#entry-dialog")!.open
    ) {
      event.preventDefault();
      hide();
    }
  });
  render();
  return {
    show,
    hide,
    contains: (element: Element) => panel.contains(element),
  };
}
