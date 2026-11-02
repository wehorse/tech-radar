import { rings, validateData } from "./model.ts";
import type { Entry, RadarData } from "./model.ts";

export interface Snapshot {
  id: string;
  createdAt: string;
  title: string;
  reason: string;
  data: RadarData;
  edits?: SnapshotEdit[];
}
export interface SnapshotEdit {
  id: string;
  createdAt: string;
  reason: string;
  previous: Pick<Snapshot, "title" | "reason" | "data">;
}
export interface RadarHistory {
  schemaVersion: 1;
  snapshots: Snapshot[];
}
export interface Change {
  id: string;
  kind: "added" | "removed" | "moved" | "updated";
  before?: Entry;
  after?: Entry;
}

// Movement is a projection of two versions, never a manually maintained fact.
function content(entry: Entry): string {
  return JSON.stringify(Object.fromEntries(Object.entries(entry)
    .filter(([key, value]) => key !== "movement" && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))));
}

export function diffSnapshots(before: Entry[], after: Entry[]): Change[] {
  const old = new Map(before.map((entry) => [entry.id, entry]));
  const current = new Map(after.map((entry) => [entry.id, entry]));
  const changes: Change[] = [];
  for (const entry of after) {
    const previous = old.get(entry.id);
    if (!previous) changes.push({ id: entry.id, kind: "added", after: entry });
    else if (previous.ring !== entry.ring || previous.quadrant !== entry.quadrant)
      changes.push({ id: entry.id, kind: "moved", before: previous, after: entry });
    else if (content(previous) !== content(entry))
      changes.push({ id: entry.id, kind: "updated", before: previous, after: entry });
  }
  for (const entry of before)
    if (!current.has(entry.id)) changes.push({ id: entry.id, kind: "removed", before: entry });
  return changes;
}

export function snapshotData(history: RadarHistory, index: number): RadarData {
  const snapshot = history.snapshots[index];
  const previous = new Map((history.snapshots[index - 1]?.data.entries ?? [])
    .map((entry) => [entry.id, entry]));
  return { ...snapshot.data, entries: snapshot.data.entries.map((entry) => {
    const old = previous.get(entry.id);
    const difference = old ? rings.findIndex((r) => r.id === old.ring) -
      rings.findIndex((r) => r.id === entry.ring) : 0;
    return { ...entry, movement: index === 0 ? "unchanged" : !old ? "new" :
      difference > 0 ? "up" : difference < 0 ? "down" : "unchanged" };
  }) };
}

export function validateHistory(value: unknown): asserts value is RadarHistory {
  if (!value || typeof value !== "object") throw new Error("History must be an object.");
  const history = value as RadarHistory;
  if (history.schemaVersion !== 1 || !Array.isArray(history.snapshots) || !history.snapshots.length)
    throw new Error("History requires schemaVersion 1 and at least one snapshot.");
  const ids = new Set<string>();
  const editIds = new Set<string>();
  let previous = -Infinity;
  for (const snapshot of history.snapshots) {
    if (!snapshot || typeof snapshot.id !== "string" || !/^[a-z0-9-]+$/.test(snapshot.id) || ids.has(snapshot.id))
      throw new Error("Snapshot IDs must be unique lowercase slugs.");
    ids.add(snapshot.id);
    const time = Date.parse(snapshot.createdAt);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== snapshot.createdAt || time <= previous)
      throw new Error("Snapshot timestamps must be ISO UTC dates in strictly increasing order.");
    previous = time;
    if (typeof snapshot.title !== "string" || !snapshot.title.trim() ||
      typeof snapshot.reason !== "string" || !snapshot.reason.trim())
      throw new Error("Every snapshot needs a title and a decision note.");
    validateData(snapshot.data);
    if (snapshot.edits !== undefined) {
      if (!Array.isArray(snapshot.edits)) throw new Error("Revision edits must be an array.");
      let lastEdit = time;
      for (const edit of snapshot.edits) {
        if (!edit || typeof edit.id !== "string" || !/^[a-z0-9-]+$/.test(edit.id) || editIds.has(edit.id))
          throw new Error("Revision edit IDs must be unique lowercase slugs.");
        editIds.add(edit.id);
        const editedAt = Date.parse(edit.createdAt);
        if (!Number.isFinite(editedAt) || new Date(editedAt).toISOString() !== edit.createdAt || editedAt <= lastEdit)
          throw new Error("Revision edit timestamps must increase after the revision was created.");
        lastEdit = editedAt;
        if (typeof edit.reason !== "string" || !edit.reason.trim() || !edit.previous ||
          typeof edit.previous.title !== "string" || !edit.previous.title.trim() ||
          typeof edit.previous.reason !== "string" || !edit.previous.reason.trim())
          throw new Error("Every revision edit needs a note and its previous contents.");
        validateData(edit.previous.data);
      }
    }
  }
}

export function assertExtension(base: RadarHistory, next: RadarHistory): void {
  validateHistory(next);
  if (next.snapshots.length < base.snapshots.length)
    throw new Error("Import must extend the current history; revisions cannot be removed.");
  for (const [index, snapshot] of base.snapshots.entries()) {
    const incoming = next.snapshots[index];
    if (JSON.stringify(snapshot) === JSON.stringify(incoming)) continue;
    const oldEdits = snapshot.edits ?? [];
    const newEdits = incoming.edits ?? [];
    if (snapshot.id !== incoming.id || snapshot.createdAt !== incoming.createdAt ||
      newEdits.length <= oldEdits.length ||
      oldEdits.some((edit, i) => JSON.stringify(edit) !== JSON.stringify(newEdits[i])) ||
      JSON.stringify(snapshotContents(snapshot)) !== JSON.stringify(newEdits[oldEdits.length]?.previous))
      throw new Error("Import must extend the current history. Revision changes must preserve the existing edit history and previous contents.");
  }
}

export function resolveHistory(published: RadarHistory, saved: RadarHistory): RadarHistory {
  try { assertExtension(published, saved); return saved; }
  catch { assertExtension(saved, published); return published; }
}

function snapshotContents(snapshot: Snapshot): Pick<Snapshot, "title" | "reason" | "data"> {
  return { title: snapshot.title, reason: snapshot.reason, data: snapshot.data };
}

export function reviseSnapshot(
  history: RadarHistory, snapshotId: string, entries: Entry[], title: string, reason: string,
  now = new Date(), id = `edit-${crypto.randomUUID()}`,
): RadarHistory {
  const index = history.snapshots.findIndex((snapshot) => snapshot.id === snapshotId);
  if (index < 0) throw new Error("The selected revision no longer exists.");
  const snapshot = history.snapshots[index];
  if (!diffSnapshots(snapshot.data.entries, entries).length && snapshot.title === title.trim())
    throw new Error("Nothing changed. Update a technology before saving the revision.");
  if (!reason.trim()) throw new Error("Every revision edit needs a decision note.");
  const createdAt = new Date(Math.max(now.getTime(), Date.parse(snapshot.edits?.at(-1)?.createdAt ?? snapshot.createdAt) + 1)).toISOString();
  const updated: Snapshot = {
    ...snapshot, title: title.trim(), reason: `${snapshot.reason}\n\n${reason.trim()}`,
    data: { ...snapshot.data, entries: structuredClone(entries).map((entry) => ({ ...entry, movement: "unchanged" })) },
    edits: [...(snapshot.edits ?? []), { id, createdAt, reason: reason.trim(), previous: structuredClone(snapshotContents(snapshot)) }],
  };
  const next: RadarHistory = { schemaVersion: 1, snapshots: history.snapshots.map((item, i) => i === index ? updated : item) };
  validateHistory(next);
  return next;
}

export function commitSnapshot(
  history: RadarHistory, entries: Entry[], title: string, reason: string,
  now = new Date(), id = `snapshot-${crypto.randomUUID()}`,
): RadarHistory {
  const latest = history.snapshots.at(-1)!;
  if (!diffSnapshots(latest.data.entries, entries).length)
    throw new Error("Nothing changed. Update a technology before saving a snapshot.");
  const createdAt = new Date(Math.max(now.getTime(), Date.parse(latest.createdAt) + 1)).toISOString();
  const snapshot: Snapshot = {
    id, createdAt, title: title.trim(), reason: reason.trim(),
    data: { ...latest.data, edition: createdAt.slice(0, 10), reviewedAt: createdAt.slice(0, 10),
      entries: structuredClone(entries).map((entry) => ({ ...entry, movement: "unchanged" })) },
  };
  const next: RadarHistory = { schemaVersion: 1, snapshots: [...history.snapshots, snapshot] };
  validateHistory(next);
  return next;
}

// Illustrative states are deliberately isolated from the recorded team history.
export function demoHistory(seed: RadarData): RadarHistory {
  const snapshots: Snapshot[] = [];
  const definitions = [
    ["2026-05-01", "The starting point", "An illustrative baseline for exploring stack evolution."],
    ["2026-06-08", "Exploring a new foundation", "Introduce ECS, Valkey and OpenSearch in Assess."],
    ["2026-07-13", "From assessment to trial", "Try the new platform and data services in real workloads."],
    ["2026-08-17", "A new home for our workloads", "Adopt ECS and begin moving away from the previous hosting platforms."],
    ["2026-09-14", "Better tools, fewer moving parts", "Adopt the new data engines; retire Expo from this example stack."],
    ["2026-10-30", "The next chapter", "Introduce event streaming and capture completed replacements."],
  ];
  const newcomers = ["amazon-ecs", "valkey", "opensearch"];
  for (const [index, [date, title, reason]] of definitions.entries()) {
    const entries = structuredClone(seed.entries).filter((entry) =>
      !(index === 0 && newcomers.includes(entry.id)) &&
      !(index < 5 && entry.id === "aws-kinesis-data-streams") &&
      !(index >= 4 && entry.id === "expo"));
    for (const entry of entries) {
      entry.movement = "unchanged";
      if (index < 3 && entry.migrationTo === "amazon-ecs") {
        delete entry.migrationTo;
        delete entry.rationale;
        entry.ring = "adopt";
      }
      if (index < 4 && ["redis", "elasticsearch"].includes(entry.id)) {
        delete entry.replacedBy;
        delete entry.rationale;
        entry.ring = "adopt";
      }
      if (newcomers.includes(entry.id)) {
        entry.ring = index === 1 ? "assess" : index === 2 ? "trial" : "adopt";
      }
    }
    snapshots.push({ id: `demo-${index + 1}`, createdAt: `${date}T12:00:00.000Z`, title, reason,
      data: { ...seed, isExample: true, edition: date.slice(0, 7), reviewedAt: date, entries } });
  }
  const history: RadarHistory = { schemaVersion: 1, snapshots };
  validateHistory(history);
  return history;
}

export function snapshotAtDate(history: RadarHistory, date: string): number {
  const end = Date.parse(`${date}T23:59:59.999Z`);
  if (!Number.isFinite(end)) return history.snapshots.length - 1;
  return Math.max(0, history.snapshots.findLastIndex((snapshot) => Date.parse(snapshot.createdAt) <= end));
}
