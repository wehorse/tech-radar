import { readFileSync } from "node:fs";
import { validateData } from "../src/model.ts";
import { layoutEntries } from "../src/layout.ts";

const data: unknown = JSON.parse(
  readFileSync(new URL("../src/data/radar.json", import.meta.url), "utf8"),
);
validateData(data);
layoutEntries(data.entries);
console.log(`Validated ${data.entries.length} radar entries and their layout.`);
