import { quadrants, rings } from "./model.ts";
import type { Entry } from "./model.ts";

export const center = 380;
export const radii = [220, 260, 300, 342];
export interface Blip {
  entry: Entry;
  number: number;
  x: number;
  y: number;
}

// Fixed slots keep blips stable when filtering and leave room for keyboard focus rings.
// Reject overcrowded sectors instead of silently stacking technologies on each other.
export function layoutEntries(entries: Entry[]): Blip[] {
  const slots = new Map<string, { x: number; y: number }[]>();
  for (const [q, quadrant] of quadrants.entries()) {
    for (const [r, ring] of rings.entries()) {
      const inner = r === 0 ? 70 : radii[r - 1];
      const outer = radii[r];
      const candidates: { x: number; y: number }[] = [];
      for (let radius = inner + 22; radius <= outer - 18; radius += 34) {
        const count = Math.max(
          1,
          Math.floor(((Math.PI / 2) * radius - 44) / 36),
        );
        for (let n = 0; n < count; n++) {
          const angle =
            -Math.PI +
            (q * Math.PI) / 2 +
            (((n + 1) / (count + 1)) * Math.PI) / 2;
          candidates.push({
            x: center + Math.cos(angle) * radius,
            y: center + Math.sin(angle) * radius,
          });
        }
      }
      // Start at the sector's middle, then use the most distant free slot.
      const middleAngle = -Math.PI + (q * Math.PI) / 2 + Math.PI / 4;
      const middleRadius = (inner + outer) / 2;
      const target = {
        x: center + Math.cos(middleAngle) * middleRadius,
        y: center + Math.sin(middleAngle) * middleRadius,
      };
      candidates.sort(
        (a, b) =>
          Math.hypot(a.x - target.x, a.y - target.y) -
          Math.hypot(b.x - target.x, b.y - target.y),
      );
      const spread = candidates.splice(0, 1);
      while (candidates.length) {
        const distance = (point: { x: number; y: number }) =>
          Math.min(
            ...spread.map((used) =>
              Math.hypot(point.x - used.x, point.y - used.y),
            ),
          );
        candidates.sort((a, b) => distance(b) - distance(a));
        spread.push(candidates.shift()!);
      }
      slots.set(`${quadrant.id}:${ring.id}`, spread);
    }
  }
  const used = new Map<string, number>();
  return entries.map((entry, index) => {
    const key = `${entry.quadrant}:${entry.ring}`;
    const count = used.get(key) ?? 0;
    const point = slots.get(key)?.[count];
    if (!point)
      throw new Error(
        `Too many entries in ${key}; increase the radar layout capacity before adding more.`,
      );
    used.set(key, count + 1);
    return { entry, number: index + 1, ...point };
  });
}
