import { readFileSync } from "node:fs";
import { validateData } from "../src/model.ts";
import { layoutEntries } from "../src/layout.ts";
import { validateHistory } from "../src/history.ts";
import { historyLayouts } from "../src/history-panel.ts";

const data: unknown = JSON.parse(
  readFileSync(new URL("../src/data/radar.json", import.meta.url), "utf8"),
);
validateData(data);
layoutEntries(data.entries);
console.log(`Validated ${data.entries.length} radar entries and their layout.`);

const history: unknown = JSON.parse(readFileSync(new URL("../src/data/history.json", import.meta.url), "utf8"));
validateHistory(history);
historyLayouts(history);
console.log(`Validated ${history.snapshots.length} snapshots and their layouts.`);
