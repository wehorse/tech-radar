import type { Blip } from "./layout.ts";
import { renderRadar } from "./radar.ts";

/** Key by technology identity; untouched entries retain their slot across versions. */
export function transitionRadar(previous: Blip[], next: Blip[], animate: boolean): void {
  const container = document.querySelector<HTMLElement>("#radar-container")!;
  const oldElements = new Map([...container.querySelectorAll<SVGGElement>(".blip")]
    .map((element) => [element.dataset.entry!, element]));
  const focused = document.activeElement instanceof SVGElement ? document.activeElement.dataset.entry : undefined;
  container.innerHTML = renderRadar(next);
  if (focused) container.querySelector<SVGElement>(`[data-entry="${focused}"]`)?.focus();
  if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const old = new Map(previous.map((point) => [point.entry.id, point]));
  const ids = new Set(next.map((point) => point.entry.id));
  const layer = container.querySelector<SVGGElement>("svg > g")!;
  for (const point of next) {
    const before = old.get(point.entry.id);
    const element = container.querySelector<SVGGElement>(`[data-entry="${point.entry.id}"]`)!;
    if (!before) {
      element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: "ease-out" });
      const body = element.querySelector(".blip-halo")!;
      body.animate([{ opacity: 0.6 }, { opacity: 0 }], { duration: 1400 });
    } else if (before.x !== point.x || before.y !== point.y) {
      const trail = document.createElementNS("http://www.w3.org/2000/svg", "line");
      for (const [key, value] of Object.entries({ x1: before.x, y1: before.y, x2: point.x, y2: point.y })) trail.setAttribute(key, String(value));
      trail.setAttribute("class", "motion-trail");
      layer.prepend(trail);
      trail.animate([{ opacity: 0.7 }, { opacity: 0 }], { duration: 1800 }).finished.then(() => trail.remove());
      element.animate([
        { transform: `translate(${before.x - point.x}px, ${before.y - point.y}px)` },
        { transform: "translate(0px, 0px)" },
      ], { duration: 1100, easing: "cubic-bezier(.22,1,.36,1)" });
    }
  }
  for (const before of previous) {
    if (ids.has(before.entry.id)) continue;
    const source = oldElements.get(before.entry.id);
    if (!source || source.classList.contains("outside-area")) continue;
    const ghost = source.cloneNode(true) as SVGGElement;
    ghost.classList.remove("blip"); ghost.classList.add("history-ghost");
    ghost.removeAttribute("data-entry"); ghost.removeAttribute("tabindex");
    ghost.setAttribute("aria-hidden", "true"); ghost.removeAttribute("role");
    layer.append(ghost);
    ghost.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 750, fill: "forwards" }).finished.then(() => ghost.remove());
  }
}
