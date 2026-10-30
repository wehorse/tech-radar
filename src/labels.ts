import { center } from "./layout.ts";
import type { Blip } from "./layout.ts";

export const labelFontSize = 8;
export const labelLineHeight = 10;
export const blipRadius = 10;
export const labelPointClearance = blipRadius + 2;

// Arial/Helvetica advance widths, in ems. Include a little room for fallback
// fonts and the white text outline, without treating narrow letters as capitals.
function textWidth(text: string): number {
  const narrow = new Set("ijlItf.,:;!'|");
  return [...text].reduce(
    (width, char) =>
      width +
      (char === " "
        ? 0.28
        : narrow.has(char)
          ? 0.3
          : "MWmw@".includes(char)
            ? 0.9
            : /[A-Z]/.test(char)
              ? 0.73
              : 0.58) *
        labelFontSize,
    0,
  );
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface Label {
  x: number;
  y: number;
  anchor: "start" | "end" | "middle";
  lines: string[];
  box: Box;
  connector?: { x1: number; y1: number; x2: number; y2: number };
}
const intersects = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// Keep full names visible, with short lines and nearby, non-overlapping positions.
// The estimate includes padding around the 8px Arial text used by the SVG.
export function layoutLabels(blips: Blip[]): Map<string, Label> {
  const labels = new Map<string, Label>();
  const obstacles: Box[] = blips.flatMap(({ entry, x, y }) => [
    {
      left: x - labelPointClearance,
      right: x + labelPointClearance,
      top: y - labelPointClearance,
      bottom: y + labelPointClearance,
    },
    ...(entry.movement !== "unchanged"
      ? [{ left: x + 6, right: x + 18, top: y - 15, bottom: y - 3 }]
      : []),
  ]);
  for (const { entry, x, y } of [...blips].sort(
    (a, b) => b.entry.name.length - a.entry.name.length,
  )) {
    const lines = [""];
    for (const word of entry.name.split(" ")) {
      const last = lines.length - 1;
      if (lines[last] && `${lines[last]} ${word}`.length > 16) lines.push(word);
      else lines[last] = lines[last] ? `${lines[last]} ${word}` : word;
    }
    const width = Math.max(...lines.map(textWidth));
    const height = (lines.length - 1) * labelLineHeight;
    const outward = x < center ? -1 : 1;
    const choices: { x: number; y: number; anchor: Label["anchor"] }[] = [];
    for (const distance of [15, 22, 30, 40, 52]) {
      // Prefer the outside of each point, then above and below, then the inside.
      for (const side of [outward, 0, -outward]) {
        for (const vertical of [0, -1, 1]) {
          if (side === 0 && vertical === 0) continue;
          choices.push({
            x: x + side * distance,
            y:
              y +
              (vertical === 0
                ? 3 - height / 2
                : vertical < 0
                  ? -distance - height
                  : distance + labelFontSize),
            anchor: side < 0 ? "end" : side > 0 ? "start" : "middle",
          });
        }
      }
    }
    const makeCandidate = (choice: (typeof choices)[number]) => {
      const left =
        choice.x -
        (choice.anchor === "end"
          ? width
          : choice.anchor === "middle"
            ? width / 2
            : 0);
      const box = {
        left: left - 2,
        right: left + width + 2,
        top: choice.y - labelFontSize,
        bottom: choice.y + height + 3,
      };
      const conflicts = obstacles.filter((obstacle) =>
        intersects(box, obstacle),
      ).length;
      const outside =
        box.left < 10 ||
        box.right > 750 ||
        box.top < 42 ||
        box.bottom > 720 ||
        (x < center ? box.right > center - 12 : box.left < center + 12) ||
        (y < center ? box.bottom > center - 12 : box.top < center + 14);
      return { ...choice, lines, box, score: conflicts + (outside ? 100 : 0) };
    };
    const candidates = choices.map(makeCandidate);
    candidates.sort((a, b) => a.score - b.score);
    let chosen: Label = candidates[0];
    if (candidates[0].score > 0) {
      // Dense sectors need positions between the usual eight directions.
      // Search the quadrant's free space and keep the nearest clear label.
      const minX = (x < center ? 10 : center + 12) + width / 2 + 2;
      const maxX = (x < center ? center - 12 : 750) - width / 2 - 2;
      const minY = (y < center ? 42 : center + 14) + labelFontSize;
      const maxY = (y < center ? center - 12 : 720) - height - 3;
      let nearest = Infinity;
      for (let labelX = minX; labelX <= maxX; labelX += 6) {
        for (let labelY = minY; labelY <= maxY; labelY += 6) {
          const candidate = makeCandidate({
            x: labelX,
            y: labelY,
            anchor: "middle",
          });
          if (candidate.score !== 0) continue;
          const distance = Math.hypot(labelX - x, labelY + height / 2 - 3 - y);
          if (distance < nearest) {
            nearest = distance;
            chosen = candidate;
          }
        }
      }
    }
    const x2 = Math.max(chosen.box.left, Math.min(x, chosen.box.right));
    const y2 = Math.max(chosen.box.top, Math.min(y, chosen.box.bottom));
    const distance = Math.hypot(x2 - x, y2 - y);
    if (distance > 22)
      chosen.connector = {
        x1: x + ((x2 - x) / distance) * (blipRadius + 2),
        y1: y + ((y2 - y) / distance) * (blipRadius + 2),
        x2,
        y2,
      };
    labels.set(entry.id, chosen);
    obstacles.push(chosen.box);
  }
  return labels;
}
