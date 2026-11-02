/** Enlarge the canvas around its current centre; native scrolling pans it. */
export function setupRadarZoom(): void {
  const viewport = document.querySelector<HTMLElement>(".radar-viewport")!;
  const panel = document.querySelector<HTMLElement>(".radar-panel")!;
  const zoomOut = document.querySelector<HTMLButtonElement>("#radar-zoom-out")!;
  const zoomIn = document.querySelector<HTMLButtonElement>("#radar-zoom-in")!;
  const fit = document.querySelector<HTMLButtonElement>("#radar-zoom-fit")!;
  let scale = 1;

  function zoom(next: number): void {
    const centreX = (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth;
    const centreY = (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight;
    scale = Math.max(1, Math.min(2, next));
    panel.style.setProperty("--radar-scale", String(scale));
    viewport.scrollLeft = centreX * viewport.scrollWidth - viewport.clientWidth / 2;
    viewport.scrollTop = centreY * viewport.scrollHeight - viewport.clientHeight / 2;
    zoomOut.disabled = scale === 1;
    zoomIn.disabled = scale === 2;
    fit.textContent = scale === 1 ? "Fit" : `${Math.round(scale * 100)}%`;
    viewport.setAttribute("aria-label", `Radar canvas, ${Math.round(scale * 100)}% zoom; scroll to pan when zoomed`);
  }

  zoomOut.addEventListener("click", () => zoom(scale - 0.25));
  zoomIn.addEventListener("click", () => zoom(scale + 0.25));
  fit.addEventListener("click", () => zoom(1));
}
