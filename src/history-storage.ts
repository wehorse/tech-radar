import { validateHistory } from "./history.ts";
import type { RadarHistory } from "./history.ts";

type DraftStorage = Pick<Storage, "getItem" | "removeItem">;

export function hasLocalDrafts(published: RadarHistory, current: RadarHistory, stored: string | null): boolean {
  const baseline = JSON.stringify(published);
  if (JSON.stringify(current) !== baseline) return true;
  if (stored === null) return false;
  try { return JSON.stringify(JSON.parse(stored)) !== baseline; }
  catch { return true; }
}

export function discardBrowserDrafts(
  published: RadarHistory, storage: DraftStorage, key: string, expected: string | null,
): RadarHistory {
  validateHistory(published);
  const restored = structuredClone(published);
  if (storage.getItem(key) !== expected)
    throw new Error("Browser edits changed in another tab. Review them before discarding.");
  storage.removeItem(key);
  return restored;
}
