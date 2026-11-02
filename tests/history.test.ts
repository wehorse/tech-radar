import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertExtension, commitSnapshot, demoHistory, diffSnapshots, snapshotAtDate, snapshotData, validateHistory } from "../src/history.ts";
import type { RadarHistory } from "../src/history.ts";
import type { Entry } from "../src/model.ts";
import { historyLayouts } from "../src/history-panel.ts";

const published: RadarHistory = JSON.parse(readFileSync(new URL("../src/data/history.json", import.meta.url), "utf8"));
const baseline: RadarHistory = { schemaVersion: 1, snapshots: [published.snapshots.at(-1)!] };
const entries = baseline.snapshots[0].data.entries;
const added: Entry = { id: "history-test", name: "History Test", quadrant: "languages", ring: "assess", movement: "unchanged", description: "A new technology." };
const commit = (history: RadarHistory, next: Entry[]) => commitSnapshot(history, next, "A decision", "The reason for this decision.");

test("snapshots append without mutating past versions or retaining caller references", () => {
  const original = JSON.stringify(baseline);
  const nextEntries = [...structuredClone(entries), structuredClone(added)];
  const next = commit(baseline, nextEntries);
  assert.equal(next.snapshots.length, 2);
  assert.equal(JSON.stringify(baseline), original);
  nextEntries.at(-1)!.name = "Mutated input";
  assert.equal(next.snapshots[1].data.entries.at(-1)!.name, "History Test");
  assert.equal(snapshotData(next, 1).entries.at(-1)!.movement, "new");
  assert.ok(snapshotData(next, 0).entries.every((entry) => entry.movement === "unchanged"));
});

test("diff detects additions, removals, moves and metadata/transition changes", () => {
  const next = structuredClone(entries).filter((entry) => entry.id !== "expo");
  next.find((entry) => entry.id === "appium")!.ring = "adopt";
  next.find((entry) => entry.id === "php")!.name = "PHP renamed";
  const runner = next.find((entry) => entry.id === "aws-app-runner")!;
  delete runner.migrationTo;
  runner.replacedBy = "amazon-ecs";
  next.push(added);
  const changes = diffSnapshots(entries, next);
  assert.deepEqual(new Map(changes.map((change) => [change.id, change.kind])), new Map([
    ["expo", "removed"], ["appium", "moved"], ["php", "updated"], ["aws-app-runner", "updated"], ["history-test", "added"],
  ]));
  const history = commit(baseline, next);
  assert.equal(snapshotData(history, 1).entries.find((entry) => entry.id === "appium")!.movement, "up");
  const movedOut = commit(history, next.map((entry) => entry.id === "appium" ? { ...entry, ring: "hold" } : entry));
  assert.equal(snapshotData(movedOut, 2).entries.find((entry) => entry.id === "appium")!.movement, "down");
});

test("unchanged content and changed manual movement flags cannot create a version", () => {
  assert.throws(() => commit(baseline, entries), /Nothing changed/);
  assert.throws(() => commit(baseline, entries.map((entry) => ({ ...entry, movement: "new" }))), /Nothing changed/);
  const reorderedFields = entries.map(({ id, ...rest }) => ({ ...rest, id }));
  assert.equal(diffSnapshots(entries, reorderedFields).length, 0);
  assert.throws(() => commitSnapshot(baseline, [...entries, added], "Title", "  "), /decision note/);
});

test("archiving preserves the original, and invalid replacement references cannot be saved", () => {
  const next = commit(baseline, entries.filter((entry) => entry.id !== "expo"));
  assert.ok(next.snapshots[0].data.entries.some((entry) => entry.id === "expo"));
  assert.ok(!next.snapshots[1].data.entries.some((entry) => entry.id === "expo"));
  assert.throws(() => commit(baseline, entries.filter((entry) => entry.id !== "amazon-ecs")), /migrationTo/);
});

test("import permits only append-only extensions and rejects corrupt or reordered versions", () => {
  const next = commit(baseline, [...entries, added]);
  assert.doesNotThrow(() => assertExtension(baseline, next));
  assert.throws(() => assertExtension(next, baseline), /extend/);
  const rewritten = structuredClone(next);
  rewritten.snapshots[0].reason = "Rewrite the past";
  assert.throws(() => assertExtension(baseline, rewritten), /extend/);
  const duplicate = structuredClone(next);
  duplicate.snapshots[1].id = duplicate.snapshots[0].id;
  assert.throws(() => validateHistory(duplicate), /unique/);
  const reversed = { ...next, snapshots: [...next.snapshots].reverse() };
  assert.throws(() => validateHistory(reversed), /increasing/);
  const invalidDate = structuredClone(next);
  invalidDate.snapshots[1].createdAt = "2026-02-30T12:00:00.000Z";
  assert.throws(() => validateHistory(invalidDate), /timestamps/);
});

test("demo dates select the last snapshot on or before the chosen day", () => {
  const demo = demoHistory(baseline.snapshots[0].data);
  assert.equal(snapshotAtDate(demo, "2026-08-30"), 3);
  assert.equal(snapshotAtDate(demo, "2026-08-17"), 3);
  assert.equal(snapshotAtDate(demo, "2025-01-01"), 0);
  assert.equal(snapshotAtDate(demo, "2027-01-01"), 5);
  assert.equal(snapshotAtDate(demo, "invalid"), 5);
  assert.ok(demo.snapshots.every((snapshot) => snapshot.data.isExample));
});

test("layout preserves identities, positions and collision-free slots across changes", () => {
  const histories = [demoHistory(baseline.snapshots[0].data), commit(baseline, [added, ...entries.filter((entry) => entry.id !== "php")])];
  for (const history of histories) {
    const layouts = historyLayouts(history);
    for (let index = 0; index < layouts.length; index++) {
      const previous = new Map((layouts[index - 1] ?? []).map((point) => [point.entry.id, point]));
      for (const point of layouts[index]) {
        const old = previous.get(point.entry.id);
        if (old) assert.equal(point.number, old.number);
        if (old && old.entry.ring === point.entry.ring && old.entry.quadrant === point.entry.quadrant)
          assert.deepEqual([point.x, point.y], [old.x, old.y], point.entry.id);
        for (const other of layouts[index]) if (point !== other)
          assert.ok(Math.hypot(point.x - other.x, point.y - other.y) >= 30, `${point.entry.id} overlaps ${other.entry.id}`);
      }
    }
  }
});

test("two decisions in the same millisecond still have ordered unique versions", () => {
  const now = new Date(baseline.snapshots[0].createdAt);
  const next = commitSnapshot(baseline, [...entries, added], "Add", "Because", now);
  const final = commitSnapshot(next, entries, "Archive", "Because", now);
  assert.ok(Date.parse(final.snapshots[2].createdAt) > Date.parse(final.snapshots[1].createdAt));
  assert.notEqual(final.snapshots[2].id, final.snapshots[1].id);
});
