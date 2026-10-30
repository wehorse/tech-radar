export const rings = [
  {
    id: "adopt",
    name: "Adopt",
    action: "Use with confidence",
    description:
      "Proven choices we trust. Our default starting point for new work.",
  },
  {
    id: "trial",
    name: "Trial",
    action: "Try in real projects",
    description:
      "Ready for a considered try. Build experience and share what you learn.",
  },
  {
    id: "assess",
    name: "Assess",
    action: "Explore the potential",
    description:
      "Worth a closer look. Research and experiment before committing.",
  },
  {
    id: "hold",
    name: "Hold",
    action: "Approach with care",
    description:
      "Avoid for new work. Existing use may continue while we consider alternatives.",
  },
] as const;

export const quadrants = [
  {
    id: "languages",
    name: "Languages & frameworks",
    short: "Languages & frameworks",
  },
  {
    id: "platforms",
    name: "Platforms & infrastructure",
    short: "Platforms & infrastructure",
  },
  { id: "data", name: "Data & integration", short: "Data & integration" },
  { id: "tools", name: "Tools & practices", short: "Tools & practices" },
] as const;

export type RingId = (typeof rings)[number]["id"];
export type QuadrantId = (typeof quadrants)[number]["id"];
export type Movement = "new" | "up" | "down" | "unchanged";
export const movements = [
  { id: "new", symbol: "✦", label: "New" },
  { id: "up", symbol: "↗", label: "Moved in" },
  { id: "down", symbol: "↘", label: "Moved out" },
] as const;
export interface Entry {
  id: string;
  name: string;
  quadrant: QuadrantId;
  ring: RingId;
  movement: Movement;
  migrationTo?: string;
  replacedBy?: string;
  description: string;
  rationale?: string;
  reviewedAt?: string;
  url?: string;
}
export interface RadarData {
  title: string;
  edition: string;
  isExample: boolean;
  reviewedAt: string;
  entries: Entry[];
}

export function validateData(value: unknown): asserts value is RadarData {
  if (!value || typeof value !== "object")
    throw new Error("Radar data must be an object.");
  const data = value as Record<string, unknown>;
  const validDate = (date: unknown): date is string =>
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate(data.reviewedAt))
    throw new Error("Radar reviewedAt must be a valid YYYY-MM-DD date.");
  if (
    typeof data.title !== "string" ||
    !data.title.trim() ||
    typeof data.edition !== "string" ||
    !data.edition.trim() ||
    typeof data.isExample !== "boolean" ||
    !Array.isArray(data.entries)
  ) {
    throw new Error("Radar requires title, edition, isExample, and entries.");
  }
  const ids = new Set<string>();
  for (const [index, item] of data.entries.entries()) {
    if (!item || typeof item !== "object")
      throw new Error(`Entry ${index + 1} must be an object.`);
    const entry = item as Record<string, unknown>;
    if (entry.reviewedAt !== undefined && !validDate(entry.reviewedAt))
      throw new Error(
        `Entry ${index + 1}: reviewedAt must be a valid YYYY-MM-DD date.`,
      );
    if (
      typeof entry.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) ||
      ids.has(entry.id)
    )
      throw new Error(
        `Entry ${index + 1}: id must be a unique lowercase slug.`,
      );
    ids.add(entry.id);
    for (const field of ["name", "description"]) {
      if (typeof entry[field] !== "string" || !(entry[field] as string).trim())
        throw new Error(`${entry.id}: missing ${field}.`);
    }
    if (
      entry.rationale !== undefined &&
      (typeof entry.rationale !== "string" || !entry.rationale.trim())
    )
      throw new Error(`${entry.id}: rationale must be non-empty text.`);
    if (!rings.some((ring) => ring.id === entry.ring))
      throw new Error(`${entry.id}: invalid ring.`);
    if (!quadrants.some((quadrant) => quadrant.id === entry.quadrant))
      throw new Error(`${entry.id}: invalid quadrant.`);
    if (!["new", "up", "down", "unchanged"].includes(entry.movement as string))
      throw new Error(`${entry.id}: invalid movement.`);
    if (entry.url !== undefined) {
      if (typeof entry.url !== "string")
        throw new Error(`${entry.id}: url must be a string.`);
      const url = new URL(entry.url);
      if (!["https:", "http:"].includes(url.protocol))
        throw new Error(`${entry.id}: url must use HTTP or HTTPS.`);
    }
  }
  for (const item of data.entries) {
    const entry = item as Record<string, unknown>;
    for (const field of ["migrationTo", "replacedBy"]) {
      if (
        entry[field] !== undefined &&
        (typeof entry[field] !== "string" ||
          !ids.has(entry[field] as string) ||
          entry[field] === entry.id)
      ) {
        throw new Error(
          `${entry.id}: ${field} must reference another radar entry.`,
        );
      }
    }
    if (entry.migrationTo && entry.replacedBy) {
      throw new Error(
        `${entry.id}: a replacement cannot be both in progress and completed.`,
      );
    }
  }
}

export function getEntryStatus(entry: Entry, entries: Entry[]): string {
  if (entry.replacedBy) {
    const target = entries.find((item) => item.id === entry.replacedBy)!;
    return `Replaced by ${target.name}`;
  }
  if (entry.migrationTo) {
    const target = entries.find((item) => item.id === entry.migrationTo)!;
    return `Migrating to ${target.name}`;
  }
  return { new: "New", up: "Moved in", down: "Moved out", unchanged: "" }[
    entry.movement
  ];
}

export function filterEntries(
  entries: Entry[],
  query: string,
  quadrant: QuadrantId | "all",
  ring: RingId | "all",
): Entry[] {
  const term = query.trim().toLocaleLowerCase();
  return entries.filter(
    (entry) =>
      (quadrant === "all" || entry.quadrant === quadrant) &&
      (ring === "all" || entry.ring === ring) &&
      `${entry.name} ${entry.description} ${entry.rationale ?? ""}`
        .toLocaleLowerCase()
        .includes(term),
  );
}
