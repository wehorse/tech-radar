import { center, radii } from "./layout.ts";
import type { Blip } from "./layout.ts";
import { escapeHtml } from "./html.ts";
import { getEntryStatus, movements, quadrants } from "./model.ts";
import type { QuadrantId } from "./model.ts";
import {
  blipRadius,
  labelFontSize,
  labelLineHeight,
  layoutLabels,
} from "./labels.ts";

export function areaViewBox(area: QuadrantId | "all"): string {
  if (area === "all") return "0 0 760 760";
  const index = quadrants.findIndex((item) => item.id === area);
  return `${index === 0 || index === 3 ? 0 : 370} ${index < 2 ? 0 : 370} 390 390`;
}

export function renderRadar(blips: Blip[]): string {
  const labels = layoutLabels(blips);
  const entries = blips.map((blip) => blip.entry);
  return `<svg class="radar" viewBox="0 0 760 760" style="--label-size:${labelFontSize}px" aria-labelledby="radar-title radar-desc">
    <title id="radar-title">Technology radar</title>
    <desc id="radar-desc">Four quadrants and four rings. Adopt is closest to the centre; hold is outermost. Select a numbered technology to read more. The adjacent list provides the same entries.</desc>
    <defs><clipPath id="radar-crop"><rect id="radar-crop-box" x="0" y="0" width="760" height="760"/></clipPath></defs>
    <g clip-path="url(#radar-crop)">
    ${[...radii]
      .reverse()
      .map(
        (radius, index) =>
          `<circle class="radar-ring ring-fill-${3 - index}" cx="${center}" cy="${center}" r="${radius}"/>`,
      )
      .join("")}
    <path class="radar-axis" d="M380 45V715 M45 380H715"/>
    ${["ADOPT", "TRIAL", "ASSESS", "HOLD"].map((label, index) => `<text class="ring-label" data-ring-offset="${index === 0 ? 40 : (radii[index - 1] + radii[index]) / 2}" x="${center + (index === 0 ? 40 : (radii[index - 1] + radii[index]) / 2)}" y="384" text-anchor="middle">${label}</text>`).join("")}
    ${quadrants.map((quadrant, index) => `<text class="quadrant-label" data-area-label="${quadrant.id}" x="${index === 0 || index === 3 ? 38 : 722}" y="${index < 2 ? 29 : 742}" text-anchor="${index === 0 || index === 3 ? "start" : "end"}">${quadrant.short}</text>`).join("")}
    <circle cx="380" cy="380" r="3" class="radar-origin"/>
    ${blips
      .map(
        ({
          entry,
          number,
          x,
          y,
        }) => `<g class="blip ${entry.ring}" data-entry="${entry.id}" role="button" tabindex="0" aria-label="${escapeHtml(entry.name)}, ${entry.ring}${getEntryStatus(entry, entries) ? `, ${escapeHtml(getEntryStatus(entry, entries))}` : ""}">
      <title>${number}. ${escapeHtml(entry.name)} · ${entry.ring}${getEntryStatus(entry, entries) ? ` · ${escapeHtml(getEntryStatus(entry, entries))}` : ""}</title>
      ${(() => {
        const connector = labels.get(entry.id)!.connector;
        return connector
          ? `<line class="label-connector" x1="${connector.x1}" y1="${connector.y1}" x2="${connector.x2}" y2="${connector.y2}"/>`
          : "";
      })()}
      <circle class="blip-hit" cx="${x}" cy="${y}" r="22"/>
      <circle class="blip-halo" cx="${x}" cy="${y}" r="15"/>
      <circle class="blip-body" cx="${x}" cy="${y}" r="${blipRadius}"/>
      <text x="${x}" y="${y + 3}" text-anchor="middle">${number}</text>
      ${(() => {
        const label = labels.get(entry.id)!;
        return `<text class="blip-label" x="${label.x}" y="${label.y}" text-anchor="${label.anchor}">${label.lines.map((line, index) => `<tspan x="${label.x}" dy="${index === 0 ? 0 : labelLineHeight}">${escapeHtml(line)}</tspan>`).join("")}</text>`;
      })()}
      ${entry.movement !== "unchanged" ? `<text class="new-marker" x="${x + 7}" y="${y - 6}" aria-hidden="true">${movements.find((item) => item.id === entry.movement)!.symbol}</text>` : ""}
    </g>`,
      )
      .join("")}
    </g>
  </svg>`;
}
