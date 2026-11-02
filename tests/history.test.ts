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

test("several changes can share a revision while retaining every earlier edit", async () => {
  const { reviseSnapshot } = await import("../src/history.ts");
  const second = { ...added, id: "second-test", name: "Second Test" };
  const third = { ...added, id: "third-test", name: "Third Test" };
  const first = commitSnapshot(baseline, [...entries, added], "November review", "Add the first technology.");
  const target = first.snapshots.at(-1)!;
  const original = JSON.stringify(first);
  const next = reviseSnapshot(first, target.id, [...entries, added, second], target.title, "Add the second technology.");
  const final = reviseSnapshot(next, target.id, [...entries, added, second, third], target.title, "Add the third technology.");
  const revision = final.snapshots.at(-1)!;
  assert.equal(final.snapshots.length, 2);
  assert.equal(revision.id, target.id);
  assert.equal(revision.createdAt, target.createdAt);
  assert.equal(revision.title, "November review");
  assert.equal(diffSnapshots(entries, revision.data.entries).length, 3);
  assert.equal(revision.edits!.length, 2);
  assert.equal(revision.edits![0].previous.data.entries.length, entries.length + 1);
  assert.equal(revision.edits![1].previous.data.entries.length, entries.length + 2);
  assert.ok(revision.reason.includes("Add the first technology."));
  assert.ok(revision.reason.includes("Add the third technology."));
  assert.equal(JSON.stringify(first), original);
  assert.doesNotThrow(() => assertExtension(first, final));
  assert.doesNotThrow(() => assertExtension(next, final));
});

test("editing an older revision changes only that revision", async () => {
  const { reviseSnapshot } = await import("../src/history.ts");
  const first = published.snapshots[0];
  const original = JSON.stringify(published);
  const result = reviseSnapshot(published, first.id, [...first.data.entries, added], first.title, "Correct the initial review.");
  assert.equal(result.snapshots.length, published.snapshots.length);
  assert.deepEqual(result.snapshots[1], published.snapshots[1]);
  assert.ok(result.snapshots[0].data.entries.some((entry) => entry.id === added.id));
  assert.ok(!result.snapshots[1].data.entries.some((entry) => entry.id === added.id));
  assert.equal(JSON.stringify(published), original);
  assert.doesNotThrow(() => assertExtension(published, result));
  assert.doesNotThrow(() => historyLayouts(result));
});

test("revision edits reject no-ops, missing notes, missing revisions and invalid references", async () => {
  const { reviseSnapshot } = await import("../src/history.ts");
  const target = baseline.snapshots[0];
  assert.throws(() => reviseSnapshot(baseline, target.id, entries, target.title, "No change"), /Nothing changed/);
  assert.throws(() => reviseSnapshot(baseline, target.id, [...entries, added], target.title, " "), /decision note/);
  assert.throws(() => reviseSnapshot(baseline, "missing", entries, target.title, "Note"), /no longer exists/);
  assert.throws(() => reviseSnapshot(baseline, target.id, entries.filter((entry) => entry.id !== "amazon-ecs"), target.title, "Remove destination"), /migrationTo/);
  assert.throws(() => reviseSnapshot(baseline, target.id, [...entries, added], " ", "Note"), /title/);
});

test("amended histories round-trip without allowing edit logs to be rewritten or discarded", async () => {
  const { reviseSnapshot } = await import("../src/history.ts");
  const target = baseline.snapshots[0];
  const first = reviseSnapshot(baseline, target.id, [...entries, added], target.title, "Add a technology.");
  const second = reviseSnapshot(first, target.id, [...entries, { ...added, ring: "trial" }], target.title, "Move it to trial.");
  const imported = JSON.parse(JSON.stringify(second));
  assert.doesNotThrow(() => assertExtension(first, imported));
  const rewritten = structuredClone(second);
  rewritten.snapshots[0].edits![0].reason = "A different reason";
  assert.throws(() => assertExtension(first, rewritten), /extend/);
  const missing = structuredClone(second);
  missing.snapshots[0].edits!.shift();
  assert.throws(() => assertExtension(first, missing), /extend/);
  const noLog = structuredClone(second);
  delete noLog.snapshots[0].edits;
  assert.throws(() => assertExtension(baseline, noLog), /extend/);
  const wrongParent = structuredClone(second);
  wrongParent.snapshots[0].edits![1].previous.title = "Wrong parent";
  assert.throws(() => assertExtension(first, wrongParent), /extend/);
});

test("load resolution recognises revision edits even when the snapshot count is unchanged", async () => {
  const { reviseSnapshot, resolveHistory } = await import("../src/history.ts");
  const target = baseline.snapshots[0];
  const first = reviseSnapshot(baseline, target.id, [...entries, added], target.title, "Add a technology.");
  assert.equal(resolveHistory(baseline, first), first);
  assert.equal(resolveHistory(first, baseline), first);
  const alternative = reviseSnapshot(baseline, target.id, [...entries, { ...added, name: "A competing edit" }], target.title, "Another edit.");
  assert.throws(() => resolveHistory(first, alternative), /extend/);
});

test("creating a new revision after edits preserves the older revision's audit trail", async () => {
  const { reviseSnapshot } = await import("../src/history.ts");
  const target = baseline.snapshots[0];
  const edited = reviseSnapshot(baseline, target.id, [...entries, added], "Team review", "Add a technology.");
  const next = commitSnapshot(edited, [...entries, { ...added, ring: "trial" }], "Next review", "Start a trial.");
  assert.deepEqual(next.snapshots[0], edited.snapshots[0]);
  assert.equal(next.snapshots[1].edits, undefined);
  assert.doesNotThrow(() => assertExtension(baseline, next));
  assert.equal(snapshotData(next, 1).entries.find((entry) => entry.id === added.id)!.movement, "up");
});

test("revision edits validate their retained contents and use increasing timestamps", async () => {
  const { reviseSnapshot } = await import("../src/history.ts");
  const target = baseline.snapshots[0];
  const now = new Date(target.createdAt);
  const first = reviseSnapshot(baseline, target.id, [...entries, added], target.title, "First edit", now);
  const next = reviseSnapshot(first, target.id, entries, target.title, "Second edit", now);
  assert.ok(Date.parse(next.snapshots[0].edits![1].createdAt) > Date.parse(next.snapshots[0].edits![0].createdAt));
  const invalid = structuredClone(next);
  invalid.snapshots[0].edits![0].previous.data.entries[0].ring = "unknown" as Entry["ring"];
  assert.throws(() => validateHistory(invalid), /invalid ring/);
  const duplicate = structuredClone(next);
  duplicate.snapshots[0].edits![1].id = duplicate.snapshots[0].edits![0].id;
  assert.throws(() => validateHistory(duplicate), /unique/);
});
