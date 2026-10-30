import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterEntries, validateData, quadrants, rings } from "../src/model.ts";
import { layoutEntries, center, radii } from "../src/layout.ts";
import { escapeHtml } from "../src/html.ts";

const data = JSON.parse(
  readFileSync(new URL("../src/data/radar.json", import.meta.url), "utf8"),
);
validateData(data);

test("rejects duplicate ids, invalid categories, missing descriptions and unsafe URLs", () => {
  const withEntry = (change: object) => ({
    ...data,
    entries: [{ ...data.entries[0], ...change }],
  });
  assert.throws(
    () =>
      validateData({ ...data, entries: [data.entries[0], data.entries[0]] }),
    /unique/,
  );
  assert.throws(
    () => validateData(withEntry({ ring: "unknown" })),
    /invalid ring/,
  );
  assert.throws(
    () => validateData(withEntry({ quadrant: "unknown" })),
    /invalid quadrant/,
  );
  assert.throws(
    () => validateData(withEntry({ description: "" })),
    /missing description/,
  );
  assert.throws(
    () => validateData(withEntry({ url: "javascript:alert(1)" })),
    /HTTP/,
  );
});

test("combines case-insensitive search, quadrant and ring filters", () => {
  assert.deepEqual(
    filterEntries(data.entries, "  TYPESCRIPT ", "languages", "adopt").map(
      (entry) => entry.id,
    ),
    ["typescript"],
  );
  assert.equal(
    filterEntries(data.entries, "TypeScript", "tools", "adopt").length,
    0,
  );
  assert.equal(
    filterEntries(data.entries, "", "all", "all").length,
    data.entries.length,
  );
  assert.equal(
    filterEntries(data.entries, "a nonexistent technology", "all", "all")
      .length,
    0,
  );
  assert.ok(
    filterEntries(data.entries, "migration from Redis", "data", "hold").some(
      (entry) => entry.id === "redis",
    ),
  );
});

test("places every point inside its assigned ring and quadrant, without collisions", () => {
  const points = layoutEntries(data.entries);
  assert.deepEqual(points, layoutEntries(data.entries));
  for (const point of points) {
    const r = rings.findIndex((ring) => ring.id === point.entry.ring);
    const q = quadrants.findIndex(
      (quadrant) => quadrant.id === point.entry.quadrant,
    );
    const distance = Math.hypot(point.x - center, point.y - center);
    assert.ok(distance < radii[r] - 14);
    assert.ok(distance > (r === 0 ? 0 : radii[r - 1]) + 14);
    assert.equal(point.x < center, q === 0 || q === 3);
    assert.equal(point.y < center, q < 2);
    for (const other of points) {
      if (point !== other)
        assert.ok(
          Math.hypot(point.x - other.x, point.y - other.y) >= 30,
          `${point.entry.id} overlaps ${other.entry.id}`,
        );
    }
  }
});

test("rejects an overcrowded sector and accepts an empty radar", () => {
  assert.deepEqual(layoutEntries([]), []);
  assert.throws(
    () =>
      layoutEntries(
        Array.from({ length: 100 }, (_, i) => ({
          ...data.entries[0],
          id: `entry-${i}`,
        })),
      ),
    /Too many entries/,
  );
});

test("escapes text and attribute delimiters from content", () => {
  assert.equal(escapeHtml("<script>\"&'"), "&lt;script&gt;&quot;&amp;&#39;");
});

test("a populated radar can fit 132 technologies with no overlapping points", () => {
  const capacities = [8, 6, 8, 11];
  const entries = quadrants.flatMap((quadrant) =>
    rings.flatMap((ring, r) =>
      Array.from({ length: capacities[r] }, (_, i) => ({
        ...data.entries[0],
        id: `${quadrant.id}-${ring.id}-${i}`,
        quadrant: quadrant.id,
        ring: ring.id,
      })),
    ),
  );
  const points = layoutEntries(entries);
  assert.equal(points.length, 132);
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      assert.ok(
        Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) >= 30,
      );
    }
  }
});

test("technology names fit without covering points or other names", async () => {
  const { layoutLabels, labelPointClearance } =
    await import("../src/labels.ts");
  const points = layoutEntries(data.entries);
  const labels = [...layoutLabels(points).values()];
  const overlaps = (a, b) =>
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top;
  assert.equal(labels.length, points.length);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++)
      assert.ok(!overlaps(labels[i].box, labels[j].box));
    for (const point of points)
      assert.ok(
        !overlaps(labels[i].box, {
          left: point.x - labelPointClearance,
          right: point.x + labelPointClearance,
          top: point.y - labelPointClearance,
          bottom: point.y + labelPointClearance,
        }),
      );
  }
});

test("migration status names its destination and baseline status is empty", async () => {
  const { getEntryStatus } = await import("../src/model.ts");
  const migrating = data.entries.filter(
    (entry) => entry.migrationTo === "amazon-ecs",
  );
  assert.equal(migrating.length, 2);
  for (const entry of migrating)
    assert.equal(getEntryStatus(entry, data.entries), "Migrating to AWS ECS");
  assert.equal(
    getEntryStatus(
      data.entries.find((entry) => entry.id === "php")!,
      data.entries,
    ),
    "",
  );
  const invalid = {
    ...data,
    entries: data.entries.map((entry, i) =>
      i === 0 ? { ...entry, migrationTo: "missing-target" } : entry,
    ),
  };
  assert.throws(() => validateData(invalid), /migrationTo/);
  invalid.entries[0].migrationTo = invalid.entries[0].id;
  assert.throws(() => validateData(invalid), /migrationTo/);
});

test("completed replacements are distinct from ongoing migrations", async () => {
  const { getEntryStatus } = await import("../src/model.ts");
  const scrum = data.entries.find((entry) => entry.id === "scrum")!;
  assert.equal(getEntryStatus(scrum, data.entries), "Replaced by Kanban");
  const invalid = {
    ...data,
    entries: data.entries.map((entry) =>
      entry.id === "scrum" ? { ...entry, migrationTo: "kanban" } : entry,
    ),
  };
  assert.throws(() => validateData(invalid), /both in progress and completed/);
  delete invalid.entries.find((entry) => entry.id === "scrum").migrationTo;
  invalid.entries.find((entry) => entry.id === "scrum").replacedBy =
    "missing-target";
  assert.throws(() => validateData(invalid), /replacedBy/);
});

test("shareable filters and technology links round-trip under a Pages subpath", async () => {
  const { readViewState, writeViewState } = await import("../src/url-state.ts");
  const state = {
    quadrant: "data",
    ring: "hold",
    query: "Redis & Valkey",
    technology: "redis",
  } as const;
  const path = writeViewState(
    state,
    "https://wehorse.github.io/tech-radar/?keep=1#explore",
  );
  const url = new URL(path, "https://wehorse.github.io");
  assert.equal(url.pathname, "/tech-radar/");
  assert.equal(url.searchParams.get("keep"), "1");
  assert.equal(url.hash, "#explore");
  assert.deepEqual(readViewState(url.search, data.entries), state);
  assert.deepEqual(
    readViewState("?area=invalid&ring=invalid&tech=missing", data.entries),
    {
      quadrant: "all",
      ring: "all",
      query: "",
      technology: null,
    },
  );
  assert.equal(
    writeViewState(
      { quadrant: "all", ring: "all", query: "", technology: null },
      url.href,
    ),
    "/tech-radar/?keep=1#explore",
  );
});

test("review dates are real calendar dates and Redis is a completed replacement", async () => {
  const { getEntryStatus } = await import("../src/model.ts");
  assert.equal(
    getEntryStatus(
      data.entries.find((entry) => entry.id === "redis")!,
      data.entries,
    ),
    "Replaced by Valkey",
  );
  assert.throws(
    () => validateData({ ...data, reviewedAt: "2026-02-30" }),
    /reviewedAt/,
  );
  assert.throws(
    () =>
      validateData({
        ...data,
        entries: [{ ...data.entries[0], reviewedAt: "yesterday" }],
      }),
    /reviewedAt/,
  );
  validateData({
    ...data,
    entries: [{ ...data.entries[0], reviewedAt: "2026-10-29" }],
  });
});

test("quadrant zoom includes every technology label in the selected area", async () => {
  const { areaViewBox } = await import("../src/radar.ts");
  const { layoutLabels } = await import("../src/labels.ts");
  const labels = layoutLabels(layoutEntries(data.entries));
  assert.equal(areaViewBox("all"), "0 0 760 760");
  for (const area of quadrants) {
    const [x, y, width, height] = areaViewBox(area.id).split(" ").map(Number);
    for (const entry of data.entries.filter(
      (entry) => entry.quadrant === area.id,
    )) {
      const box = labels.get(entry.id)!.box;
      assert.ok(
        box.left >= x &&
          box.right <= x + width &&
          box.top >= y &&
          box.bottom <= y + height,
        entry.name,
      );
    }
  }
});
