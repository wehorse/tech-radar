import { quadrants, rings } from "./model.ts";
import type { Entry, QuadrantId, RingId } from "./model.ts";

export interface ViewState {
  quadrant: QuadrantId | "all";
  ring: RingId | "all";
  query: string;
  technology: string | null;
}

export function readViewState(search: string, entries: Entry[]): ViewState {
  const params = new URLSearchParams(search);
  const area = params.get("area");
  const ring = params.get("ring");
  const technology = params.get("tech");
  return {
    quadrant: quadrants.find((item) => item.id === area)?.id ?? "all",
    ring: rings.find((item) => item.id === ring)?.id ?? "all",
    query: params.get("q") ?? "",
    technology: entries.some((entry) => entry.id === technology)
      ? technology
      : null,
  };
}

export function writeViewState(state: ViewState, currentUrl: string): string {
  const url = new URL(currentUrl);
  for (const key of ["area", "ring", "q", "tech"]) url.searchParams.delete(key);
  if (state.quadrant !== "all") url.searchParams.set("area", state.quadrant);
  if (state.ring !== "all") url.searchParams.set("ring", state.ring);
  if (state.query) url.searchParams.set("q", state.query);
  if (state.technology) url.searchParams.set("tech", state.technology);
  return `${url.pathname}${url.search}${url.hash}`;
}
