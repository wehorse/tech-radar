import { assertExtension, commitSnapshot, demoHistory, diffSnapshots, snapshotAtDate, snapshotData, validateHistory, resolveHistory, reviseSnapshot } from "./history.ts";
import type { RadarHistory } from "./history.ts";
import { layoutEntries } from "./layout.ts";
import type { Blip } from "./layout.ts";
import { quadrants, rings } from "./model.ts";
import type { Entry, RadarData, QuadrantId, RingId } from "./model.ts";
import { escapeHtml as h } from "./html.ts";
import { discardBrowserDrafts, hasLocalDrafts } from "./history-storage.ts";

const storageKey = "wehorse-radar-history-v1";
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(date));

export function loadHistory(base: RadarHistory): { history: RadarHistory; warning: string } {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return { history: base, warning: "" };
    const value: unknown = JSON.parse(saved);
    validateHistory(value);
    return { history: resolveHistory(base, value), warning: "" };
  } catch {
    return { history: base, warning: "Browser history could not be loaded or differs from the published history. The recorded stack is shown; existing browser data is kept until you save." };
  }
}

export function historyLayouts(history: RadarHistory): Blip[][] {
  const numbers = new Map<string, number>();
  let previous: Blip[] = [];
  return history.snapshots.map((_, index) => {
    const data = snapshotData(history, index);
    for (const entry of data.entries) if (!numbers.has(entry.id)) numbers.set(entry.id, numbers.size + 1);
    previous = layoutEntries(data.entries, previous, numbers);
    return previous;
  });
}

export function setupHistory(
  initial: RadarHistory,
  warning: string,
  onSelect: (data: RadarData, blips: Blip[], animate: boolean) => void,
  published: RadarHistory = initial,
) {
  let recorded = initial;
  let demo = false;
  let active = recorded;
  let layouts = historyLayouts(active);
  let selected = active.snapshots.length - 1;
  let playing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let editing: Entry | undefined;
  let archiving = false;
  let speed = 1;
  let autoRevisionTitle = false;
  let discardExpected: string | null = null;
  let discarded: { history: RadarHistory; stored: string | null; selectedId: string } | undefined;

  document.querySelector(".header-meta")!.insertAdjacentHTML("beforeend", `
    <div class="history-actions"><button id="demo-toggle" class="header-button header-button-secondary">Demo history</button><button id="add-technology" class="header-button header-button-primary"><svg class="header-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span>Add technology</span></button></div>
  `);
  document.querySelector("main")!.insertAdjacentHTML("afterbegin", `
    <div id="history-notice" class="history-notice" role="status" ${warning ? "" : "hidden"}><span id="history-notice-message">${h(warning)}</span><button id="undo-discard" hidden>Undo</button></div>
    <div id="demo-notice" class="demo-notice" hidden><span><strong>Demo history</strong> · Illustrative changes, May–October 2026. Your recorded stack is separate.</span><button id="exit-demo">Back to our stack ↗</button></div>
  `);
  document.querySelector(".workspace")!.insertAdjacentHTML("afterend", `
    <section class="timeline-panel" aria-labelledby="timeline-heading">
      <h3 id="timeline-heading" class="visually-hidden">Stack timeline</h3>
      <div class="timeline-toolbar">
        <details class="snapshot-panel">
          <summary class="snapshot-summary"><span class="snapshot-label"><span id="snapshot-position"></span><span id="snapshot-version"></span></span><span id="snapshot-heading" class="snapshot-title"></span><span id="snapshot-summary-date" class="snapshot-summary-date"></span><span id="change-count" class="snapshot-change-count"></span><span class="snapshot-chevron" aria-hidden="true">⌃</span></summary>
          <div class="snapshot-details">
            <p id="snapshot-date" class="snapshot-date"></p><p id="snapshot-reason"></p>
            <div id="snapshot-stats" class="snapshot-stats"></div>
            <div class="changes-heading"><h4>What changed</h4></div>
            <div id="snapshot-changes" class="snapshot-changes"></div>
            <p id="comparison-label" class="comparison-label"></p><div id="revision-edits"></div>
            <div class="snapshot-storage"><p class="storage-status"><span class="storage-dot"></span><span id="storage-label"></span></p><div class="storage-actions"><button id="discard-history" class="storage-action storage-action-danger">Discard edits</button><div class="storage-file-actions"><button id="export-history" class="storage-action">Export JSON</button><button id="import-history" class="storage-action">Import</button></div></div><input type="file" id="history-file" accept="application/json,.json" hidden></div>
          </div>
        </details>
        <div class="timeline-navigation"><label class="date-jump"><input id="snapshot-date-jump" type="date" aria-label="Jump to snapshot on or before date"></label><button id="go-latest" class="quiet-button">Latest ↗</button><span id="playback-status" role="status" aria-live="polite"></span></div>
      </div>
      <div class="timeline-body"><div class="playback-controls"><button id="go-first" aria-label="Go to first snapshot" title="Go to first snapshot">|◀</button><button id="play-history" class="play-button" aria-label="Play history">▶</button><button id="go-previous" aria-label="Previous snapshot">‹</button><button id="go-next" aria-label="Next snapshot">›</button><select id="playback-speed" aria-label="Playback speed"><option value="1">1×</option><option value="2">2×</option><option value="0.5">0.5×</option></select></div><div id="timeline-scroll" class="timeline-scroll" role="group" aria-label="Select a snapshot"><div id="timeline-track" class="timeline-track"></div></div></div>
    </section>
  `);
  document.querySelector("#app")!.insertAdjacentHTML("beforeend", `
    <dialog id="discard-dialog" aria-labelledby="discard-title" aria-describedby="discard-description"><h2 id="discard-title">Discard browser edits?</h2><p id="discard-description">Return to the published radar. Local revision changes and imported drafts will be removed from this browser. You can undo this until your next save or page reload.</p><p id="discard-error" class="form-error" role="alert" hidden></p><div class="discard-dialog-actions"><button id="cancel-discard" class="quiet-button" autofocus>Keep edits</button><button id="confirm-discard" class="storage-action storage-action-danger">Discard edits</button></div></dialog>
    <dialog id="editor-dialog" aria-labelledby="editor-title"><button id="close-editor" class="close-dialog" aria-label="Close editor">×</button><p class="overline">RECORD A DECISION</p><h2 id="editor-title"></h2><p id="editor-explanation" class="editor-explanation"></p><form id="technology-form">
      <div class="revision-fields"><label>Save to revision<select name="revision" required></select></label><label>Revision title<input name="revisionTitle" required maxlength="120"></label><p id="revision-hint"></p></div>
      <div id="entry-fields"><label>Technology name<input name="name" required maxlength="100"></label><div class="form-columns"><label>Area<select name="quadrant">${quadrants.map((item) => `<option value="${item.id}">${item.name}</option>`).join("")}</select></label><label>Adoption ring<select name="ring">${rings.map((item) => `<option value="${item.id}">${item.name}</option>`).join("")}</select></label></div><label>What do we use it for?<textarea name="description" rows="3" required maxlength="2000"></textarea></label><label>Official website <span>(optional)</span><input name="url" type="url" placeholder="https://…"></label><div class="form-columns"><label>Transition<select name="transition"><option value="none">No transition</option><option value="migrationTo">Migrating to…</option><option value="replacedBy">Replaced by…</option></select></label><label id="transition-target-label">Destination<select name="destination"></select></label></div></div>
      <label>Decision note <span>Why are we making this change?</span><textarea name="reason" rows="3" required maxlength="2000" placeholder="The context that future us will need…"></textarea></label><p id="editor-error" class="form-error" role="alert" hidden></p><div class="editor-footer"><span id="editor-version"></span><button type="submit" class="primary-button" id="save-snapshot">Save revision</button></div>
    </form></dialog>
  `);

  const editor = document.querySelector<HTMLDialogElement>("#editor-dialog")!;
  const form = document.querySelector<HTMLFormElement>("#technology-form")!;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const text = (selector: string, value: string) => { $(selector).textContent = value; };
  const notice = (message: string, undo = !!discarded) => { text("#history-notice-message", message); $("#history-notice").hidden = !message; $("#undo-discard").hidden = !undo; };
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const canEdit = () => !demo;
  const snapshotPanel = $<HTMLDetailsElement>(".snapshot-panel");
  const discardDialog = $<HTMLDialogElement>("#discard-dialog");
  document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Node && !snapshotPanel.contains(event.target) && !document.querySelector("dialog[open]")) snapshotPanel.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && snapshotPanel.open && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      snapshotPanel.open = false;
      snapshotPanel.querySelector("summary")!.focus();
    }
  });

  function setUrl() {
    const url = new URL(location.href);
    if (demo) url.searchParams.set("demo", "1"); else url.searchParams.delete("demo");
    if (selected === active.snapshots.length - 1) url.searchParams.delete("snapshot");
    else url.searchParams.set("snapshot", active.snapshots[selected].id);
    url.searchParams.delete("tech");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function render() {
    const snapshot = active.snapshots[selected];
    const previous = active.snapshots[selected - 1];
    const changes = previous ? diffSnapshots(previous.data.entries, snapshot.data.entries) : [];
    const added = changes.filter((change) => change.kind === "added").length;
    const moved = changes.filter((change) => change.kind === "moved").length;
    const removed = changes.filter((change) => change.kind === "removed").length;
    text("#snapshot-position", selected === active.snapshots.length - 1 ? "Latest" : "History");
    text("#snapshot-version", `v${String(selected + 1).padStart(2, "0")}`);
    text("#snapshot-heading", snapshot.title);
    $("#snapshot-heading").title = snapshot.title;
    text("#snapshot-summary-date", dateLabel(snapshot.createdAt, { day: "numeric", month: "short" }));
    text("#snapshot-date", dateLabel(snapshot.createdAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " UTC");
    text("#snapshot-reason", snapshot.reason);
    $("#revision-edits").innerHTML = snapshot.edits?.length ? `<details class="revision-edit-log"><summary>Revision edits · ${snapshot.edits.length}</summary><ol>${[...snapshot.edits].reverse().map((edit) => `<li><time>${h(dateLabel(edit.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }))} UTC</time><p>${h(edit.reason)}</p></li>`).join("")}</ol></details>` : "";
    $("#snapshot-stats").innerHTML = `<div><strong>${snapshot.data.entries.length}</strong><span>technologies</span></div><div><strong>${changes.length}</strong><span>${previous ? "changes" : "baseline"}</span></div>`;
    text("#change-count", previous ? `${changes.length} change${changes.length === 1 ? "" : "s"}` : "Baseline");
    $("#snapshot-changes").innerHTML = changes.length ? changes.map((change) => {
      const entry = change.after ?? change.before!;
      const label = change.kind === "added" ? `Added to ${entry.ring}` : change.kind === "removed" ? "Archived from the radar" : change.kind === "moved" ?
        `${change.before!.ring} → ${entry.ring}${change.before!.quadrant !== entry.quadrant ? " · area changed" : ""}` :
        change.after?.migrationTo ? `Migrating to ${snapshot.data.entries.find((item) => item.id === entry.migrationTo)?.name}` :
        change.after?.replacedBy ? `Replaced by ${snapshot.data.entries.find((item) => item.id === entry.replacedBy)?.name}` : "Decision updated";
      return `<${change.after ? `button data-entry="${entry.id}"` : "div"} class="change-row ${change.kind}"><span class="change-icon" aria-hidden="true">${({ added: "+", removed: "−", moved: "↗", updated: "↻" })[change.kind]}</span><span><strong>${h(entry.name)}</strong><small>${h(label)}</small></span></${change.after ? "button" : "div"}>`;
    }).join("") : `<div class="baseline-message"><span aria-hidden="true">◎</span><strong>${previous ? "No stack changes" : "A starting point for every decision."}</strong><p>${previous ? "This snapshot records the same stack." : "Add or update a technology to create the next snapshot. Every earlier version stays intact."}</p>${active.snapshots.length === 1 ? '<button id="try-playback">Explore the demo timeline ↗</button>' : ""}</div>`;
    text("#comparison-label", previous ? `Compared with ${dateLabel(previous.createdAt)} · ${added} added, ${moved} moved, ${removed} archived` : "First recorded snapshot · no earlier comparison");
    $("#demo-notice").hidden = !demo;
    text("#demo-toggle", demo ? "Back to stack" : "Demo history");
    $("#add-technology").toggleAttribute("disabled", !canEdit());
    $("#add-technology").title = canEdit() ? "Add a technology to a revision" : "Demo history is read-only";
    $("#import-history").toggleAttribute("disabled", demo);
    $("#export-history").toggleAttribute("disabled", demo);
    let drafts = JSON.stringify(recorded) !== JSON.stringify(published) || !!warning;
    try { drafts = hasLocalDrafts(published, recorded, localStorage.getItem(storageKey)); } catch { /* Keep the in-memory draft status when storage is unavailable. */ }
    $("#discard-history").toggleAttribute("disabled", demo || !drafts);
    $("#undo-discard").toggleAttribute("disabled", demo);
    text("#storage-label", demo ? "Demo · read-only" : drafts ? "Browser drafts" : "Published history");
    const jump = $<HTMLInputElement>("#snapshot-date-jump");
    jump.min = active.snapshots[0].createdAt.slice(0, 10);
    jump.max = active.snapshots.at(-1)!.createdAt.slice(0, 10);
    jump.value = snapshot.createdAt.slice(0, 10);
    const focusedPoint = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.snapshotIndex : undefined;
    const track = $("#timeline-track");
    track.style.setProperty("--snapshot-count", String(active.snapshots.length));
    track.innerHTML = active.snapshots.map((item, index) => {
      const count = index ? diffSnapshots(active.snapshots[index - 1].data.entries, item.data.entries).length : 0;
      return `<button class="timeline-point ${index === selected ? "is-selected" : ""} ${index < selected ? "is-past" : ""}" data-snapshot-index="${index}" aria-pressed="${index === selected}" ${index === selected ? 'aria-current="step"' : ""}><span class="timeline-point-date">${h(dateLabel(item.createdAt, { day: "numeric", month: "short" }))}</span><span class="timeline-node"><span></span></span><span class="timeline-point-title">${h(item.title)}</span><span class="timeline-point-count">${index === 0 ? "Baseline" : `${count} change${count === 1 ? "" : "s"}`}${index === active.snapshots.length - 1 ? " · Latest" : ""}</span></button>`;
    }).join("");
    $("#go-first").toggleAttribute("disabled", selected === 0);
    $("#go-previous").toggleAttribute("disabled", selected === 0);
    $("#go-next").toggleAttribute("disabled", selected === active.snapshots.length - 1);
    $("#play-history").toggleAttribute("disabled", active.snapshots.length < 2);
    text("#play-history", playing ? "Ⅱ" : "▶");
    $("#play-history").setAttribute("aria-label", playing ? "Pause history" : "Play history");
    text("#playback-status", `${playing ? "Playing · " : ""}${selected + 1} of ${active.snapshots.length}`);
    if (focusedPoint !== undefined) track.querySelector<HTMLElement>(`[data-snapshot-index="${focusedPoint}"]`)?.focus({ preventScroll: true });
    track.querySelector<HTMLElement>(".is-selected")?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" });
  }

  function stop() { playing = false; clearTimeout(timer); }
  function select(index: number, animate = true, writeUrl = true) {
    selected = Math.max(0, Math.min(index, active.snapshots.length - 1));
    const details = document.querySelector<HTMLDialogElement>("#entry-dialog")!;
    if (details.open) details.close();
    if (writeUrl) setUrl();
    onSelect(snapshotData(active, selected), layouts[selected], animate);
    render();
  }
  function tick() {
    clearTimeout(timer);
    if (!playing) return;
    timer = setTimeout(() => {
      if (selected >= active.snapshots.length - 1) { stop(); render(); return; }
      select(selected + 1);
      if (selected === active.snapshots.length - 1) { stop(); render(); } else tick();
    }, 1900 / speed);
  }
  function toggleDemo() {
    stop(); demo = !demo;
    active = demo ? demoHistory(recorded.snapshots.at(-1)!.data) : recorded;
    layouts = historyLayouts(active);
    select(active.snapshots.length - 1, false);
  }
  function save(next: RadarHistory, selectedId = next.snapshots.at(-1)!.id) {
    // Prove every historical state can be rendered before persisting anything.
    const nextLayouts = historyLayouts(next);
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const existing: unknown = JSON.parse(stored);
      validateHistory(existing);
      try { assertExtension(existing, next); }
      catch { throw new Error("Another draft or tab has a different history. Export your current history, then reload to review the saved versions before making another change."); }
    }
    localStorage.setItem(storageKey, JSON.stringify(next));
    discarded = undefined;
    recorded = next; active = next; layouts = nextLayouts;
    stop(); select(active.snapshots.findIndex((snapshot) => snapshot.id === selectedId));
    notice("Revision saved in this browser. Export the history to share it or commit it to Git.");
  }
  function targetSnapshot() {
    return field("revision").value === "__new__" ? recorded.snapshots.at(-1)! :
      recorded.snapshots.find((snapshot) => snapshot.id === field("revision").value)!;
  }
  function suggestedTitle() {
    const name = field("name").value.trim();
    return archiving ? `${editing!.name} archived` : !editing ?
      name ? `${name} joins the radar` : "New revision" : editing.ring !== field("ring").value ?
      `${name}: ${editing.ring} → ${field("ring").value}` : `${name} updated`;
  }
  function populateTechnology(entry?: Entry) {
    field("name").value = entry?.name ?? "";
    field("quadrant").value = entry?.quadrant ?? "languages";
    field("ring").value = entry?.ring ?? "assess";
    field("description").value = entry?.description ?? "";
    field("url").value = entry?.url ?? "";
    field("transition").value = entry?.migrationTo ? "migrationTo" : entry?.replacedBy ? "replacedBy" : "none";
    populateDestinations(entry?.migrationTo ?? entry?.replacedBy ?? "");
  }
  function populateDestinations(value = field("destination").value) {
    field("destination").innerHTML = `<option value="">Select a technology</option>${targetSnapshot().data.entries.filter((item) => item.id !== editing?.id).map((item) => `<option value="${item.id}">${h(item.name)}</option>`).join("")}`;
    field("destination").value = value;
    updateDestination();
  }
  function revisionChoiceChanged() {
    const target = targetSnapshot();
    if (editing) {
      editing = target.data.entries.find((entry) => entry.id === editing!.id)!;
      populateTechnology(editing);
    } else populateDestinations();
    autoRevisionTitle = field("revision").value === "__new__";
    field("revisionTitle").value = autoRevisionTitle ? suggestedTitle() : target.title;
    const version = `v${String(recorded.snapshots.indexOf(target) + 1).padStart(2, "0")}`;
    text("#revision-hint", autoRevisionTitle ? "Creates a new revision from the latest stack." :
      `Updates ${version} only. Later revisions keep their own contents.${editing ? " Switching revisions reloads the saved technology details." : ""}`);
    text("#editor-version", autoRevisionTitle ? `Creates v${String(recorded.snapshots.length + 1).padStart(2, "0")}` : `Updates ${version} · no new timeline point`);
    text("#save-snapshot", autoRevisionTitle ? "Create revision" : `Save to ${version}`);
    $("#editor-error").hidden = true;
  }
  function edit(entry?: Entry, archive = false) {
    stop(); render();
    if (!canEdit()) { notice("Demo history is read-only."); return; }
    editing = entry; archiving = archive;
    form.reset();
    text("#editor-title", archive ? `Archive ${entry!.name}` : entry ? `Update ${entry.name}` : "Add a technology");
    text("#editor-explanation", archive ? "Removes it from the chosen revision. Previous contents are kept in the revision edit history." : "Choose a revision for this change, or create a new one.");
    $("#entry-fields").hidden = archive;
    for (const element of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("#entry-fields input, #entry-fields select, #entry-fields textarea")) element.disabled = archive;
    const available = (entries: Entry[]) => !entry || entries.some((item) => item.id === entry.id);
    field("revision").innerHTML = `<option value="__new__" ${available(recorded.snapshots.at(-1)!.data.entries) ? "" : "disabled"}>Create a new revision${available(recorded.snapshots.at(-1)!.data.entries) ? "" : " (technology absent from latest)"}</option><optgroup label="Existing revisions">${[...recorded.snapshots].reverse().map((snapshot) => `<option value="${snapshot.id}" ${available(snapshot.data.entries) ? "" : "disabled"}>v${String(recorded.snapshots.indexOf(snapshot) + 1).padStart(2, "0")} · ${h(snapshot.title)} · ${h(dateLabel(snapshot.createdAt))}</option>`).join("")}</optgroup>`;
    field("revision").value = recorded.snapshots[selected].id;
    populateTechnology(entry);
    revisionChoiceChanged();
    document.querySelector<HTMLDialogElement>("#entry-dialog")!.close();
    editor.showModal();
  }
  function updateDestination() {
    const needed = field("transition").value !== "none" && !archiving;
    $("#transition-target-label").hidden = !needed;
    field("destination").disabled = !needed;
    (field("destination") as HTMLSelectElement).required = needed;
  }
  form.addEventListener("change", (event) => {
    if (event.target === field("revision")) revisionChoiceChanged();
    else updateDestination();
  });
  form.addEventListener("input", (event) => {
    if (event.target === field("revisionTitle")) autoRevisionTitle = false;
    else if (autoRevisionTitle) field("revisionTitle").value = suggestedTitle();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      if (demo) throw new Error("Demo history is read-only.");
      const target = targetSnapshot();
      let entries = structuredClone(target.data.entries);
      if (archiving) {
        const dependents = entries.filter((item) => item.migrationTo === editing!.id || item.replacedBy === editing!.id);
        if (dependents.length) throw new Error(`Update the transition destination for ${dependents.map((item) => item.name).join(", ")} before archiving this technology.`);
        entries = entries.filter((item) => item.id !== editing!.id);
      } else {
        const name = field("name").value.trim();
        const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "technology";
        const reserved = new Set(recorded.snapshots.flatMap((snapshot) => [snapshot.data, ...(snapshot.edits ?? []).map((edit) => edit.previous.data)].flatMap((data) => data.entries.map((item) => item.id))));
        let id = slug;
        for (let suffix = 2; reserved.has(id); suffix++) id = `${slug}-${suffix}`;
        const next: Entry = { ...(editing ?? {}), id: editing?.id ?? id, name, quadrant: field("quadrant").value as QuadrantId,
          ring: field("ring").value as RingId, movement: "unchanged", description: field("description").value.trim() };
        delete next.migrationTo; delete next.replacedBy; delete next.url;
        if (field("url").value.trim()) next.url = field("url").value.trim();
        const transition = field("transition").value;
        if (transition === "migrationTo" || transition === "replacedBy") next[transition] = field("destination").value;
        if (editing) entries = entries.map((item) => item.id === editing!.id ? next : item);
        else entries.push(next);
      }
      const next = field("revision").value === "__new__" ?
        commitSnapshot(recorded, entries, field("revisionTitle").value, field("reason").value) :
        reviseSnapshot(recorded, target.id, entries, field("revisionTitle").value, field("reason").value);
      save(next, field("revision").value === "__new__" ? next.snapshots.at(-1)!.id : target.id);
      editor.close();
    } catch (error) {
      text("#editor-error", error instanceof Error ? error.message : "Could not save. Export your history and try again.");
      $("#editor-error").hidden = false;
    }
  });
  $("#close-editor").addEventListener("click", () => editor.close());
  $("#add-technology").addEventListener("click", () => edit());
  $("#demo-toggle").addEventListener("click", toggleDemo);
  $("#exit-demo").addEventListener("click", toggleDemo);
  $("#go-first").addEventListener("click", () => { stop(); select(0); });
  $("#go-latest").addEventListener("click", () => { stop(); select(active.snapshots.length - 1); });
  $("#go-previous").addEventListener("click", () => { stop(); select(selected - 1); });
  $("#go-next").addEventListener("click", () => { stop(); select(selected + 1); });
  $("#play-history").addEventListener("click", () => {
    if (playing) { stop(); render(); return; }
    playing = true;
    if (selected === active.snapshots.length - 1) select(0); else render();
    tick();
  });
  $("#playback-speed").addEventListener("change", (event) => { speed = Number((event.target as HTMLSelectElement).value); tick(); });
  $("#snapshot-date-jump").addEventListener("change", (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (value) { stop(); select(snapshotAtDate(active, value)); }
  });
  document.querySelector("#app")!.addEventListener("click", (event) => {
    const target = event.target as Element;
    const point = target.closest<HTMLElement>("[data-snapshot-index]");
    if (point) { stop(); select(Number(point.dataset.snapshotIndex)); }
    if (target.closest("#try-playback")) toggleDemo();
    if (target.closest("#edit-technology")) edit(active.snapshots[selected].data.entries.find((entry) => entry.id === target.closest<HTMLElement>("#edit-technology")!.dataset.id));
    if (target.closest("#archive-technology")) edit(active.snapshots[selected].data.entries.find((entry) => entry.id === target.closest<HTMLElement>("#archive-technology")!.dataset.id), true);
  });
  $("#export-history").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(recorded, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "history.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $("#import-history").addEventListener("click", () => $("#history-file").click());
  $("#discard-history").addEventListener("click", () => {
    if (demo) return;
    stop(); render();
    try {
      discardExpected = localStorage.getItem(storageKey);
      $("#discard-error").hidden = true;
      discardDialog.showModal();
    } catch (error) { notice(error instanceof Error ? error.message : "Browser edits could not be accessed."); }
  });
  $("#cancel-discard").addEventListener("click", () => discardDialog.close());
  $("#confirm-discard").addEventListener("click", () => {
    try {
      const nextLayouts = historyLayouts(published);
      const restored = discardBrowserDrafts(published, localStorage, storageKey, discardExpected);
      discarded = { history: recorded, stored: discardExpected, selectedId: active.snapshots[selected].id };
      recorded = restored; active = restored; layouts = nextLayouts;
      stop(); select(active.snapshots.length - 1);
      discardDialog.close();
      notice("Browser edits discarded. Showing the published radar.", true);
    } catch (error) {
      text("#discard-error", error instanceof Error ? error.message : "Could not discard browser edits.");
      $("#discard-error").hidden = false;
    }
  });
  discardDialog.addEventListener("close", () => {
    if ($<HTMLButtonElement>("#discard-history").disabled) snapshotPanel.querySelector("summary")!.focus();
    else $("#discard-history").focus();
  });
  $("#undo-discard").addEventListener("click", () => {
    if (!discarded || demo) return;
    try {
      if (localStorage.getItem(storageKey) !== null || JSON.stringify(recorded) !== JSON.stringify(published))
        throw new Error("New browser edits exist. Export them before restoring the discarded draft.");
      const backup = discarded;
      const nextLayouts = historyLayouts(backup.history);
      localStorage.setItem(storageKey, backup.stored ?? JSON.stringify(backup.history));
      recorded = backup.history; active = recorded; layouts = nextLayouts; discarded = undefined;
      stop(); select(active.snapshots.findIndex((snapshot) => snapshot.id === backup.selectedId));
      notice("Discarded browser edits restored.");
    } catch (error) { notice(error instanceof Error ? error.message : "Could not restore browser edits.", true); }
  });
  $("#history-file").addEventListener("change", async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10_000_000) throw new Error("Please choose a history JSON file smaller than 10 MB.");
      const next: unknown = JSON.parse(await file.text()); validateHistory(next); assertExtension(recorded, next);
      save(next);
    } catch (error) { notice(error instanceof Error ? error.message : "Could not import history."); }
    input.value = "";
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { stop(); render(); } });

  function restore() {
    stop();
    const params = new URLSearchParams(location.search);
    demo = params.get("demo") === "1";
    active = demo ? demoHistory(recorded.snapshots.at(-1)!.data) : recorded;
    layouts = historyLayouts(active);
    const index = active.snapshots.findIndex((snapshot) => snapshot.id === params.get("snapshot"));
    select(index < 0 ? active.snapshots.length - 1 : index, false, false);
  }
  function detailHistory(entry: Entry): string {
    const events = active.snapshots.flatMap((snapshot, index) => {
      const current = snapshot.data.entries.find((item) => item.id === entry.id);
      const before = active.snapshots[index - 1]?.data.entries.find((item) => item.id === entry.id);
      if (!current && !before) return [];
      const change = diffSnapshots(before ? [before] : [], current ? [current] : [])[0];
      if (!change && index !== 0) return [];
      return [`<li><button data-snapshot-index="${index}"><time>${h(dateLabel(snapshot.createdAt))}</time><strong>${index === 0 ? "Recorded in baseline" : change?.kind === "removed" ? "Archived" : change?.kind === "added" ? "Added to radar" : change?.kind === "moved" ? `${h(before!.ring)} → ${h(current!.ring)}` : "Decision updated"}</strong></button><p>${h(snapshot.reason)}</p></li>`];
    });
    return `<section class="entry-history"><h3>Decision history ${demo ? "· Demo" : ""}</h3><ol>${events.reverse().join("")}</ol></section>${canEdit() ? `<div class="entry-edit-actions"><button id="edit-technology" data-id="${entry.id}" class="primary-button">Update technology ↗</button><button id="archive-technology" data-id="${entry.id}" class="quiet-button">Archive</button></div>` : '<p class="historical-note">Demo history is read-only.</p>'}`;
  }
  render();
  return { restore, detailHistory, pause: () => { stop(); render(); } };
}
