import rawData from "./data/radar.json";
import {
  filterEntries,
  getEntryStatus,
  movements,
  quadrants,
  rings,
  validateData,
} from "./model.ts";
import type { Entry, QuadrantId, RadarData, RingId } from "./model.ts";
import { layoutEntries } from "./layout.ts";
import { areaViewBox, renderRadar } from "./radar.ts";
import { readViewState, writeViewState } from "./url-state.ts";
import { setupCatalogPanel } from "./catalog-panel.ts";
import { escapeHtml as h } from "./html.ts";
import "./style.css";

validateData(rawData);
const data: RadarData = rawData;
const blips = layoutEntries(data.entries);
let quadrant: QuadrantId | "all" = "all";
let ring: RingId | "all" = "all";
let query = "";
let technology: string | null = null;
let lastTrigger: Element | null = null;
const arrow = '<span aria-hidden="true">↗</span>';

function badge(id: RingId): string {
  return `<span class="badge ${id}"><span class="dot"></span>${rings.find((item) => item.id === id)!.name}</span>`;
}

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <a class="skip-link" href="#explore">Skip to radar</a>
  <header class="site-header">
    <a href="./" aria-label="wehorse home"><img class="logo" src="${import.meta.env.BASE_URL}assets/wehorse-logo.svg" alt="wehorse" width="142" height="40"></a>
    <h1>${h(data.title)}</h1>
    <div class="header-meta">${data.isExample ? '<span class="example-label">Example data</span>' : `<span>${h(data.edition)}</span>`}
      <details class="help"><summary>About the rings</summary><div class="help-content">${rings.map((item) => `<p>${badge(item.id)}<br>${item.description}</p>`).join("")}<a href="https://opensource.zalando.com/tech-radar/">Inspired by Zalando’s Tech Radar ↗</a></div></details>
      <a href="https://github.com/wehorse/tech-radar" class="source-link">GitHub ↗</a>
      <a href="https://www.wehorse.com/de/impressum" hreflang="de">Legal notice</a>
    </div>
  </header>
  <main id="explore">
    <div class="quadrant-filters" role="group" aria-label="Technology area"><button class="area-button selected" data-quadrant="all" aria-pressed="true">All technologies</button>${quadrants.map((item) => `<button class="area-button" data-quadrant="${item.id}" aria-pressed="false">${item.short}</button>`).join("")}</div>
    <div class="workspace">
      <section class="radar-panel" aria-label="Technology radar"><div id="radar-container">${renderRadar(blips)}</div><div id="movement-legend" class="radar-caption" aria-label="Movement legend"></div></section>
      <div id="catalog-drawer" class="catalog-drawer">
        <button id="catalog-toggle" class="catalog-toggle" aria-expanded="false" aria-controls="technology-catalog"><span aria-hidden="true">☰</span> Technologies <span id="catalog-filter-count">${data.entries.length}</span></button>
        <aside id="technology-catalog" class="catalog" aria-label="Technologies" aria-hidden="true" inert>
        <div class="catalog-header"><div class="catalog-title-row"><h2>Technologies</h2><span id="result-count" role="status" aria-live="polite"></span><div class="catalog-actions"><button id="catalog-pin" aria-pressed="false" aria-label="Keep technologies panel open">Pin</button><button id="catalog-close" aria-label="Close technologies panel">×</button></div></div><input id="search" type="search" placeholder="Search technologies…" aria-label="Search technologies" autocomplete="off"><div class="ring-filters" role="group" aria-label="Adoption ring"><button data-ring="all" aria-pressed="true" class="ring-filter selected">All</button>${rings.map((item) => `<button data-ring="${item.id}" aria-pressed="false" class="ring-filter ${item.id}"><span class="dot"></span>${item.name}</button>`).join("")}</div></div>
        <div id="entry-list" class="entry-list"></div><button id="reset">Reset filters</button>
      </aside>
      </div>
    </div>
  </main>
  <dialog id="entry-dialog" aria-labelledby="detail-title"><button class="close-dialog" aria-label="Close technology details">×</button><div id="detail-content"></div></dialog>
`;

const list = document.querySelector<HTMLDivElement>("#entry-list")!;
const dialog = document.querySelector<HTMLDialogElement>("#entry-dialog")!;
const search = document.querySelector<HTMLInputElement>("#search")!;
const catalogPanel = setupCatalogPanel();

function syncUrl(push = false): void {
  const url = writeViewState(
    { quadrant, ring, query, technology },
    location.href,
  );
  if (url !== `${location.pathname}${location.search}${location.hash}`)
    history[push ? "pushState" : "replaceState"](null, "", url);
}

function update(writeUrl = true): void {
  const visible = filterEntries(data.entries, query, quadrant, ring);
  const ids = new Set(visible.map((entry) => entry.id));
  const svg = document.querySelector<SVGSVGElement>(".radar")!;
  svg.setAttribute("viewBox", areaViewBox(quadrant));
  const [cropX, cropY, cropWidth, cropHeight] =
    areaViewBox(quadrant).split(" ");
  const crop = document.querySelector("#radar-crop-box")!;
  for (const [key, value] of Object.entries({
    x: cropX,
    y: cropY,
    width: cropWidth,
    height: cropHeight,
  }))
    crop.setAttribute(key, value);
  svg.classList.toggle("is-focused", quadrant !== "all");
  document
    .querySelectorAll<SVGElement>("[data-area-label]")
    .forEach((label) => {
      label.style.display =
        quadrant === "all" || label.dataset.areaLabel === quadrant
          ? ""
          : "none";
    });
  document
    .querySelectorAll<SVGElement>("[data-ring-offset]")
    .forEach((label) => {
      const direction =
        quadrant === "languages" || quadrant === "tools" ? -1 : 1;
      label.setAttribute(
        "x",
        String(380 + direction * Number(label.dataset.ringOffset)),
      );
    });
  const usedMovements = movements.filter((movement) =>
    visible.some((entry) => entry.movement === movement.id),
  );
  const legend = document.querySelector<HTMLElement>("#movement-legend")!;
  legend.innerHTML = usedMovements
    .map((movement) => `<span>${movement.symbol} ${movement.label}</span>`)
    .join("");
  legend.hidden = usedMovements.length === 0;
  document.querySelector("#result-count")!.textContent =
    `${visible.length} / ${data.entries.length}`;
  const filtered = query.trim() !== "" || quadrant !== "all" || ring !== "all";
  document.querySelector("#catalog-filter-count")!.textContent = filtered
    ? `${visible.length} / ${data.entries.length}`
    : String(data.entries.length);
  document
    .querySelector("#catalog-toggle")!
    .classList.toggle("has-filters", filtered);
  list.innerHTML = visible.length
    ? rings
        .filter((item) => ring === "all" || ring === item.id)
        .map((item) => {
          const entries = visible.filter((entry) => entry.ring === item.id);
          if (!entries.length) return "";
          return `<div class="entry-group"><div class="entry-group-heading">${badge(item.id)}<span>${String(entries.length).padStart(2, "0")}</span></div>${entries
            .map((entry) => {
              const blip = blips.find((point) => point.entry.id === entry.id)!;
              return `<button class="entry-row" data-entry="${entry.id}"><span class="entry-number">${String(blip.number).padStart(2, "0")}</span><span class="entry-name">${h(entry.name)}${entry.migrationTo || entry.replacedBy ? `<small class="transition-note">${h(getEntryStatus(entry, data.entries))}</small>` : ""}</span>${!entry.migrationTo && !entry.replacedBy && entry.movement !== "unchanged" ? `<span class="movement ${entry.movement}" aria-label="${h(getEntryStatus(entry, data.entries))}" title="${h(getEntryStatus(entry, data.entries))}">${movements.find((item) => item.id === entry.movement)!.symbol}</span>` : ""}</button>`;
            })
            .join("")}</div>`;
        })
        .join("")
    : '<div class="empty-state"><span aria-hidden="true">⌕</span><h4>No technologies found</h4><p>Try a different search or reset the filters.</p><button data-reset>Reset filters</button></div>';
  document.querySelectorAll<HTMLElement | SVGElement>(".blip").forEach((el) => {
    const matches = ids.has(el.dataset.entry!);
    el.classList.toggle("dimmed", !matches);
    const entry = data.entries.find((entry) => entry.id === el.dataset.entry)!;
    el.classList.toggle(
      "outside-area",
      quadrant !== "all" && entry.quadrant !== quadrant,
    );
    el.setAttribute("tabindex", matches ? "0" : "-1");
    el.setAttribute("aria-hidden", String(!matches));
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-quadrant]")
    .forEach((button) => {
      const selected = button.dataset.quadrant === quadrant;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-ring]")
    .forEach((button) => {
      const selected = button.dataset.ring === ring;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  if (writeUrl) syncUrl();
}

function openEntry(entry: Entry, trigger: Element, writeUrl = true): void {
  technology = entry.id;
  if (writeUrl) syncUrl(true);
  lastTrigger = trigger;
  if (catalogPanel.contains(trigger)) catalogPanel.show();
  const area = quadrants.find((item) => item.id === entry.quadrant)!;
  const ringInfo = rings.find((item) => item.id === entry.ring)!;
  const reviewedAt = entry.reviewedAt ?? data.reviewedAt;
  const reviewedDate = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(reviewedAt));
  document.querySelector("#detail-content")!.innerHTML =
    `<p class="eyebrow">${h(area.name)}</p><h2 id="detail-title">${h(entry.name)}</h2><div class="detail-meta">${badge(entry.ring)}${getEntryStatus(entry, data.entries) ? `<span class="${entry.migrationTo || entry.replacedBy ? "transition-status" : ""}">${h(getEntryStatus(entry, data.entries))}</span>` : ""}</div>${data.isExample ? '<p class="detail-example">Illustrative entry · not an assessment of our stack</p>' : ""}<p class="detail-description">${h(entry.description)}</p>${entry.rationale ? `<div class="detail-decision"><h3>Our decision</h3><p>${h(entry.rationale)}</p></div>` : ""}<div class="detail-ring"><h3>${ringInfo.action}</h3><p>${ringInfo.description}</p></div>${entry.url ? `<a class="detail-link" href="${h(entry.url)}" target="_blank" rel="noopener noreferrer">Visit official website ${arrow}</a>` : ""}<div class="detail-footer"><span>Reviewed <time datetime="${reviewedAt}">${reviewedDate}</time></span><button id="copy-link" aria-live="polite">Copy link</button></div><input id="share-url" aria-label="Technology link" readonly hidden>`;
  if (!dialog.open) dialog.showModal();
}

function reset(): void {
  quadrant = "all";
  ring = "all";
  query = "";
  search.value = "";
  update();
}

app.addEventListener("click", async (event) => {
  const target = event.target as Element;
  const area = target.closest<HTMLButtonElement>("[data-quadrant]");
  const ringButton = target.closest<HTMLButtonElement>("[data-ring]");
  const entryButton = target.closest<HTMLElement>("[data-entry]");
  if (area) {
    quadrant = area.dataset.quadrant as typeof quadrant;
    update();
  }
  if (ringButton) {
    ring = ringButton.dataset.ring as typeof ring;
    update();
  }
  if (entryButton && !entryButton.classList.contains("dimmed"))
    openEntry(
      data.entries.find((entry) => entry.id === entryButton.dataset.entry)!,
      entryButton,
    );
  if (target.closest("#reset, [data-reset]")) reset();
  if (target.closest(".close-dialog")) dialog.close();
  const copy = target.closest<HTMLButtonElement>("#copy-link");
  if (copy) {
    try {
      await navigator.clipboard.writeText(location.href);
      copy.textContent = "Copied";
      setTimeout(() => {
        if (copy.isConnected) copy.textContent = "Copy link";
      }, 2000);
    } catch {
      const input = document.querySelector<HTMLInputElement>("#share-url")!;
      input.hidden = false;
      input.value = location.href;
      input.focus();
      input.select();
      copy.textContent = "Select and copy the link below";
    }
  }
});
search.addEventListener("input", () => {
  query = search.value;
  update();
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close();
  }
});
dialog.addEventListener("close", () => {
  if (dialog.open) return;
  technology = null;
  syncUrl();
  if (lastTrigger instanceof HTMLElement || lastTrigger instanceof SVGElement)
    lastTrigger.focus();
});
document.addEventListener("keydown", (event) => {
  const target = event.target as Element;
  if (
    event.key === "/" &&
    !target.closest("input, textarea, [contenteditable]") &&
    !dialog.open
  ) {
    event.preventDefault();
    catalogPanel.show(true);
  }
  if (
    (event.key === "Enter" || event.key === " ") &&
    target.matches(".blip:not(.dimmed)")
  ) {
    event.preventDefault();
    openEntry(
      data.entries.find(
        (entry) => entry.id === (target as SVGElement).dataset.entry,
      )!,
      target,
    );
  }
});
app.addEventListener("pointerover", (event) => {
  const id = (event.target as Element).closest<HTMLElement>("[data-entry]")
    ?.dataset.entry;
  document
    .querySelectorAll<HTMLElement>("[data-entry]")
    .forEach((el) =>
      el.classList.toggle("highlighted", !!id && el.dataset.entry === id),
    );
});
app.addEventListener("pointerleave", () =>
  document
    .querySelectorAll(".highlighted")
    .forEach((el) => el.classList.remove("highlighted")),
);
function restoreView(): void {
  const state = readViewState(location.search, data.entries);
  quadrant = state.quadrant;
  ring = state.ring;
  query = state.query;
  technology = state.technology;
  search.value = query;
  update(false);
  if (technology)
    openEntry(
      data.entries.find((entry) => entry.id === technology)!,
      app,
      false,
    );
  else if (dialog.open) dialog.close();
}
window.addEventListener("popstate", restoreView);
restoreView();
