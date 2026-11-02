import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commitSnapshot, reviseSnapshot } from "../src/history.ts";
import type { RadarHistory } from "../src/history.ts";
import { discardBrowserDrafts, hasLocalDrafts } from "../src/history-storage.ts";

const published: RadarHistory = JSON.parse(readFileSync(new URL("../src/data/history.json", import.meta.url), "utf8"));
const latest = published.snapshots.at(-1)!;
const draft = commitSnapshot(published, [...latest.data.entries, {
  id: "storage-test", name: "Storage Test", quadrant: "languages", ring: "assess",
  movement: "unchanged", description: "A browser-only technology.",
}], "Draft revision", "Testing draft storage.");
const key = "radar-test";
const fakeStorage = (value: string | null) => {
  const values = new Map<string, string>([["unrelated", "keep me"]]);
  if (value !== null) values.set(key, value);
  return {
    values,
    getItem: (name: string) => values.get(name) ?? null,
    removeItem: (name: string) => { values.delete(name); },
  };
};

test("draft status distinguishes published, edited, appended and unreadable histories", () => {
  assert.equal(hasLocalDrafts(published, published, null), false);
  assert.equal(hasLocalDrafts(published, published, JSON.stringify(published, null, 2)), false);
  assert.equal(hasLocalDrafts(published, draft, JSON.stringify(draft)), true);
  assert.equal(hasLocalDrafts(published, draft, null), true);
  assert.equal(hasLocalDrafts(published, published, "broken JSON"), true);
  const edited = reviseSnapshot(published, latest.id, draft.snapshots.at(-1)!.data.entries, latest.title, "Add to an existing revision.");
  assert.equal(edited.snapshots.length, published.snapshots.length);
  assert.equal(hasLocalDrafts(published, edited, JSON.stringify(edited)), true);
});

test("discard restores published history and removes only this radar's browser storage", () => {
  const saved = JSON.stringify(draft);
  const storage = fakeStorage(saved);
  const original = JSON.stringify(published);
  const restored = discardBrowserDrafts(published, storage, key, saved);
  assert.deepEqual(restored, published);
  assert.equal(storage.getItem(key), null);
  assert.equal(storage.getItem("unrelated"), "keep me");
  restored.snapshots[0].title = "Change the returned copy";
  assert.equal(JSON.stringify(published), original);
});

test("discard handles invalid saved JSON without needing to load the draft", () => {
  const storage = fakeStorage("broken JSON");
  assert.deepEqual(discardBrowserDrafts(published, storage, key, "broken JSON"), published);
  assert.equal(storage.getItem(key), null);
});

test("discard refuses to remove a draft changed by another tab after confirmation opened", () => {
  const saved = JSON.stringify(draft);
  const storage = fakeStorage(saved);
  assert.throws(() => discardBrowserDrafts(published, storage, key, "an older draft"), /another tab/);
  assert.equal(storage.getItem(key), saved);
});

test("storage failures and invalid published history leave the saved draft intact", () => {
  const saved = JSON.stringify(draft);
  const storage = fakeStorage(saved);
  assert.throws(() => discardBrowserDrafts({ schemaVersion: 1, snapshots: [] }, storage, key, saved), /at least one snapshot/);
  assert.equal(storage.getItem(key), saved);
  assert.throws(() => discardBrowserDrafts(published, {
    getItem: storage.getItem,
    removeItem: () => { throw new Error("Storage is unavailable"); },
  }, key, saved), /unavailable/);
  assert.equal(storage.getItem(key), saved);
});
