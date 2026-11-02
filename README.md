# wehorse Tech Radar

[Open the live tech radar](https://wehorse.github.io/tech-radar/)

A tech radar for keeping track of what your team uses, what you're trying, and what you're moving away from. Group related decisions into revisions, then look back at an earlier stack or play through its changes.

It runs as a static site. There is no server or shared editing account: edits stay in your browser until you export and publish them.

## Run it locally

You'll need Node.js 24 or later. If you use nvm, `nvm use` selects the version in `.nvmrc`.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite, usually [http://127.0.0.1:5173](http://127.0.0.1:5173).

The included radar contains wehorse's stack, with two snapshots taken from its Git history. **Demo history** opens a separate, read-only example with several months of changes.

## Use it for your own team

You can reuse the code, documentation, and radar data under the [MIT License](LICENSE). The wehorse logo is excluded: remove or replace `public/assets/wehorse-logo.svg` in your copy. The full terms are in [LICENSING.md](LICENSING.md).

### Replace the branding

These are the places to change:

| File | What to change |
| --- | --- |
| `src/main.ts` | Logo image, logo alt text, home link label, and legal notice link. |
| `index.html` | Browser tab title, page description, and fallback text. |
| `public/favicon.svg` | Browser icon, if you want your own. |
| `src/history-panel.ts` | Give `storageKey` a name for your radar. This keeps it separate from other radars you've run at the same browser address. |
| `package.json` | Project name. Update the matching name in `package-lock.json` too. |

The demo in `src/history.ts` uses wehorse-specific technology IDs and sample decisions. Adapt it to your data, or remove the demo controls and their handlers from `src/history-panel.ts`.

### Start with your own stack

The app reads `src/data/history.json`. Replace the included history with a first snapshot for your team. This example starts empty; you can then add technologies through the UI. Use your actual starting date and a title of your own.

```json
{
  "schemaVersion": 1,
  "snapshots": [
    {
      "id": "initial",
      "createdAt": "2026-11-02T00:00:00.000Z",
      "title": "Initial stack",
      "reason": "Starting our technology history.",
      "data": {
        "title": "Team Tech Radar",
        "edition": "2026.11",
        "isExample": false,
        "reviewedAt": "2026-11-02",
        "entries": []
      }
    }
  ]
}
```

Do this before recording your team's decisions. Each revision needs a unique ID and a UTC timestamp later than the previous revision. The UI can create revisions or edit existing ones, keeping an edit log with their previous contents.

`src/data/radar.json` is the original test fixture. Editing it won't change the radar shown in the app. Some tests in `tests/history.test.ts` also use specific entries from the included history; adjust those fixtures when replacing the starting stack.

You can rename the area and ring labels in `src/model.ts`. Keep their IDs unless you also update the data and code that refer to them.

## Use the radar

The latest snapshot opens by default. Select an earlier point on the timeline, use the date picker, or press **Play** to see changes over time. A date between snapshots shows the last saved version on or before that day. Playing from the latest snapshot starts again at the beginning.

Select a technology on the chart to read its description and decision history. The **Technologies** panel has search and ring filters; the tabs above the chart focus on an area. Use **＋** and **−** to zoom, scroll to pan, and **Fit** to reset the view.

Open the snapshot summary in the timeline bar to see its decision note, change list, and import/export buttons.

The rings mean:

| Ring | How we use it |
| --- | --- |
| Adopt | A default choice for new work. |
| Trial | Being tried in real projects. |
| Assess | Worth investigating before committing to it. |
| Hold | Avoid for new work; existing use may continue. |

## Add, move, or retire a technology

You can edit any recorded revision. The demo is read-only. Every change form has a **Save to revision** selector: keep the selected revision, choose another one, or choose **Create a new revision**. A new revision starts from the latest stack.

- **Add:** choose **Add technology**, fill in its name, area, ring, and description, then explain why you're adding it. Choose the revision and save.
- **Update or move:** select a technology and choose **Update technology**. Change its details, area, or ring and leave a decision note. Movement markers are worked out from the previous snapshot.
- **Record a migration:** add the destination technology first. Then update the old technology, choose **Migrating to…**, and select the destination. When the migration is done, use **Replaced by…**. Set the adoption ring separately.
- **Archive:** choose **Archive** in the technology's details and record why. It leaves the chosen revision; the other revisions keep their own contents. If other entries point to it as a migration or replacement destination, update those references first.

To group three changes, save the first one to a new revision, then save the next two to that same revision. You get one timeline point with all three changes. You can set its title in the form.

Editing an older revision changes that revision only. Later revisions are not automatically updated. When updating an existing technology, the selector only offers revisions where it exists; switching revisions reloads that revision's saved details.

Revision IDs and original dates stay the same when edited. Each edit keeps its note and the previous title, notes, and stack. Open **Revision edits** in the snapshot summary to read the notes; the full previous contents are included in JSON exports. Renaming a technology preserves its identity. Adding an archived name again creates a new entry rather than restoring the old one.

## Save and share changes

**Saving in the UI only saves to this browser.** It survives a reload, but it doesn't update the repository or anyone else's copy. Export your history before clearing site data or moving to another browser.

**Discard edits** in the snapshot summary restores the published history and removes this browser's drafts. You can cancel the confirmation or use **Undo** afterward, until your next save or page reload.

To publish your changes:

1. Open the snapshot summary and choose **Export JSON**.
2. Replace `src/data/history.json` with the downloaded file.
3. Run `npm run check` and review the changes in Git.
4. Commit the file and rebuild or redeploy the site.

**Import** accepts new revisions and revision edits that preserve your current history. It refuses unrelated histories, removed revisions, missing edit logs, and conflicting changes. If two people edit the same revision independently, agree on one history and reapply the other decisions before importing or publishing.

Links preserve the selected snapshot, filters, and technology. A link to a browser-only snapshot won't show that version for someone else until they have imported it or it has been published.

## Build and deploy

```sh
npm run check
npm test
npm run build
npm run preview
```

The build goes into `dist/` and includes the license notices. You can host that directory on a static web server.

The included [GitHub Actions workflow](.github/workflows/ci.yml) runs checks and deploys pushes to `master` to GitHub Pages. Enable Pages with GitHub Actions as its source. If your fork uses another default branch, change the branch filters and conditions in the workflow.

For a site served under a subpath, pass it when building:

```sh
npm run build -- --base=/your-repo/
```

Published radar data is included in the site's files. Anyone who can access the site can read it. The app has no built-in sign-in or server-side permissions; use hosting access controls if the stack should stay internal.

## AI use

AI tools were used to generate and edit code in this repository. Review and test the code before relying on it in your own projects.
