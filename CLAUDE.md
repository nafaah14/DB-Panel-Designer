# DB Panel Designer — project notes for Claude Code

Internal tool for designing **distribution boards (DB panels)** and **room electrical layouts** (switches, sockets, lights, fans) with a 3D preview. Built for STELCO Malé Power Generation work, used mostly on a phone.

## Run / build / deploy
- No build step needed for development. Open `index.html` via a local server: `npm run serve` → http://localhost:5173
  (Opening `index.html` directly with `file://` also works on desktop.)
- `npm run build` → `dist/panel-designer-standalone.html` = everything inlined in one file (for testing on a phone from the file manager).
- Deploy: **Cloudflare Workers Static Assets**, git-connected to `github.com/nafaah14/DB-Panel-Designer` — every push to `main` is built (`npx wrangler deploy`) and published; live at https://db-panel-designer.a-nafaah.workers.dev. `wrangler.jsonc` serves the repo root as the site; `.assetsignore` lists what is *not* uploaded (above all `node_modules` — wrangler installs itself there during the deploy and its 129 MiB binary breaks the 25 MiB per-asset limit). Netlify is no longer used.
- Every release gets a semantic version. Run `node tools/bump.mjs <x.y.z> "note" "note"` — it sets `APP_VERSION` (`js/panel.js`), `package.json`, `manifest.webmanifest` and the README title in one go, writes `version.json` (the notes shown under *What's new*), and rebuilds `dist/`. It refuses to write anything unless every file matched. Then add the README changelog line and commit `dist/` with the rest. **Push order matters for the update check:** the site only announces `version.json`'s version once it is deployed, so a release is live when `/version.json` on the live site shows it.

## Files
| File | What it is |
|---|---|
| `index.html` | App shell: canvases, top bars, floating buttons, bottom parts sheet, modal |
| `css/app.css` | All styles (mobile-first; ≥900 px puts the parts sheet on the left) |
| `js/panel.js` | Panel designer + shared app code: storage, projects, undo/redo, modals, toasts, menus, BOM, export, boot |
| `js/room.js` | Room designer: item library, 2D wall/ceiling editor, Three.js 3D view |
| `js/update.js` | Update check: reads `version.json`, compares with `APP_VERSION`, drives the menu dot and the `#updbar` banner |
| `js/settings.js` | Menu → Settings: preferences, storage + backup/restore, version + update controls |
| `version.json` | `{version,date,notes[]}` — written by `tools/bump.mjs`, fetched by `update.js`. **Must stay served** (not in `.assetsignore`) |
| `vendor/three.min.js` | Three.js **r149** classic (non-module) build — last version with `build/three.min.js`. Keep it classic so the app runs from `file://` |
| `tools/build-standalone.mjs` | Inlines every `<script src>` / stylesheet into one HTML file (new scripts need no change here) |
| `tools/bump.mjs` | Release helper: version everywhere + `version.json` + rebuild |

Scripts are classic `<script>` tags sharing one global scope (top-level `const`/`let` are visible across files, so a duplicate top-level name in two files throws — but they are **not** properties of `window`, so from DevTools or an iframe reach them with `win.eval('name')`). Load order: three → panel → room → update → settings. Boot runs on `DOMContentLoaded` (end of `panel.js`) so everything is defined first.

## Data model (localStorage)
- `pdes.projects.v1` → `{ [projectId]: { name, updated, appVersion, data } }`, `pdes.current`, `pdes.settings` (`mode, scheme, snap, labels, wireColor, wireSize, autoUpdate`), `pdes.upd` (last update-check result + which version's banner was dismissed)
- `data = { panels, panelId, rooms, roomId }` — `migrate()` in panel.js upgrades older projects; `normRoom()` in room.js fills room defaults.
- **`S.items` / `S.wires` / `S.layers` / `S.defs` are accessors onto the current panel**, installed by `bindPanelViews()`. They are not copies: seven places reassign them outright (`S.wires=S.wires.filter(…)`), and a setter is what makes those writes land in the right panel. Reassign `S.panels` itself when replacing the list (see `restore()`), never the views.
- Undo/redo snapshots the whole `data` JSON (`pushUndo()` before a change, then `commit()` / `roomCommit()`).

### Panel designer (js/panel.js)
- Scale **2 px = 1 mm**; 1 DIN module = 18 mm = 36 px (`M`), half-module unit `U` = 18 px.
- `DEFS` = component definitions (`units`, `size`, `terms`, `draw`, `props`, `desc`, `z` draw order). `PANEL_LIB` = library tabs.
- Rail devices store `rail` + `slot` (half-module units). Rails placed end-to-end auto-join (`railJoinTarget`/`joinRails`).
- Wires: `{a:'itemId:termId', b, color, size, layer, path?}`. Auto-routing = orthogonal A* around device boxes (`astar`, `computeRoutes`), lane-spreading via the occupancy map. `path` = manual inner points.
- Layers: `S.layers` (visible/locked/order), items and wires carry `layer`.

### Room designer (js/room.js)
- Units **mm**. Origin = floor corner where Wall D meets Wall A; x along A (width `w`), z along B (length `l`), y up (`h`).
- Walls seen from inside run left→right: A (0,0,0)→(W,0,0), B (W,0,0)→(W,0,L), C (W,0,L)→(0,0,L), D (0,0,L)→(0,0,0). See `wallGeo()`.
- Item `{id,type,surf,x,y,props}`: wall → `x` = centre from wall's left end, `y` = centre height; ceiling → `x` from Wall D, `y` from Wall A.
- `RDEFS` = item definitions (`w`,`h` mm, `depth`, `mount` default height, `model` for 3D, `draw` SVG in mm). `ROOM_LIB` = library tabs.
- 2D editor: `draw2D()`, gestures on `#r2d`, snapping in `snapPos()` (50 mm grid, standard heights `SNAP_H`, alignment with other points).
- 3D: `build3D()` rebuilds the scene from data; `render3D()` renders on demand (`req3D()`); custom orbit (`orb`) — 1 finger rotate, 2 fingers zoom/pan; walls facing the camera are cut away; wall openings are holes in an extruded shape; item fronts use the 2D SVG as a texture (`itemTexture`). Labels are HTML chips projected each frame.

### Room wiring (js/room.js, v2.1–2.3)
- **Circuits live on the PANEL** (`panel.circuits`), not the room — a circuit is a breaker's outgoing way. A room reads the circuits of the boards its DBs point at (`roomPanels()` → `circuits()`); one owner, so nothing is synced. A point names one in `props.circuit` **by id**, so renaming can't orphan it.
- A `db` item's `props.panel` is the board it *is*. `dbForCircuit()` routes each point to the DB whose panel owns its circuit, so two DBs in a room work.
- Promoting pre-2.1 free-text circuit names happens in `linkLegacyCircuits()` (panel.js), **not** `normRoom()` — normRoom can't tell an id from a name now that circuits are elsewhere, and doing it there minted a junk circuit per point on every load.
- Switches carry `props.controls`: one array of load ids per gang. `RDEFS.ways(props)` gives the gang count (`sw`, `swb`, `fanreg`). Never put `controls` in `RDEFS.defaults` — `Object.assign` copies an array by reference and every switch would share one; `normControls()` builds fresh arrays on create/load/edit.
- Conduit is **constructed, not searched** (`routeBetween`, `perimPath`): drop to `runH()` 150 mm under the ceiling, along the walls the shorter way round turning at corners, then to the far point; ceiling↔wall crossings go via the ceiling edge. panel.js's A* doesn't apply — it is single-plane, and these runs cross surfaces.
- **Topology (2.7, extended 2.11):** `roomRuns()` walks items, not circuits. DB→switch and DB→socket are `kind:'feed'` (red); a control device→its targets is `kind:'switched'` (yellow) from a plate switch or `kind:'load'` (orange) from industrial gear — `legKind()` decides, on the *driver's* type. A load on no driver falls back to a direct feed. `effCircuit()` walks **up** the chain (motor → starter → isolator) so only the top needs a circuit set; an explicit choice always wins, and a visited-set caps a user-made loop.
- **Industrial (2.11).** Two sets govern wiring, and both live next to `switchesFor()`:
  - `SWITCHABLE` — loads something can drive (lights, fans, high bays, battens, floods, bulkheads, emergency/exit, `motor`).
  - `CHAINABLE` — control gear that can itself hang off upstream gear (`iso`, `cont`, `dol`, `sd`, `vfd`, `estop`, `pbs`). Plate switches stay out on purpose: it would put every switch in every other switch's tick-list.
  - `canDrive()` = either; `drivablesIn(self)` is what the Edit form ticks, loads first. Adding an industrial *light* means adding it to `SWITCHABLE` or nothing can switch it.
- Circuits carry `phase` (`'1'`/`'3'`, defaulted in `migratePanel`). It drives the BOM's core count and `phaseWarn()`, which flags any point whose `props.poles` starts with `3` on a single-phase circuit — so **name a 3-phase prop `poles` and give it a `'3P'` option** for the check to see it.
- Industrial symbols are enclosures, not flush plates: `encl()`, `cee()` (IEC 60309 face, blue 2P+E / red 3P+N+E), `rotary()`, `pbtn()`, `tube()`. Sizes are the real envelope of the gear, not a symbol size.
- Run colour encodes the conductor, so selection changes width/opacity, never hue.
- Runs are 3D room points. `runOnSurf()` projects them back for whichever surface is being drawn; `nudge()` lifts them 8 mm off the surface in 3D or they z-fight.
- `roomRuns()` is recomputed on demand (no cache) — if it ever shows up in a profile, that is the thing to memoise.

## Conventions
- Vanilla JS, no framework, no bundler. Keep everything working offline.
- Phone first: touch targets ≥ 34 px, test in a 412×900 touch viewport. Pointer Events everywhere; a new primary pointer resets stale gestures.
- `toast()` for feedback, `openModal()` for forms, `reportError()` shows errors on screen.
- Headless testing: Playwright + Chromium; for 3D launch with `--use-gl=swiftshader --enable-unsafe-swiftshader`.

## Testing gotcha
A **service worker from another localhost project** (Daybook, cache `daybook-shell-v3`) can hijack `localhost:5173` and serve stale JS no matter what the dev server's cache headers say. If a change seems not to take effect, check `navigator.serviceWorker.getRegistrations()` before suspecting anything else — this cost several debugging rounds.

## Roadmap
- **v2: room wiring — done (2.1–2.3).** See "Room wiring" above.
- **v3 — done bar the floor plan:** panel-breaker links (2.4), elevations sheet (2.5), multiple rooms (2.6).
- **Done since:** real wiring topology (2.7), panel size + fit check (2.8), multiple panels (2.9), room DB ↔ panel with circuits owned by the panel (2.10), industrial equipment + control-gear chains + circuit phase (2.11).
- **Wanted next, in the user's words:** a **control panel mode** — a third library beside the domestic panel one, for power supplies, relays, terminal rails, pilot lights, push buttons and the like. The panel library stays domestic; this is a sibling, not a replacement. Likely shape: a `kind` on each panel (`'db' | 'control'`) choosing which `PANEL_LIB` it shows, since panels are already a list.
- **Settings, version, updates, whole-device backup, persist() — done (2.12).** See "Settings & updates" below.
- **Next (2.13): accounts + cloud sync, with guest use.** Everything is still in `localStorage` on one device; iOS Safari evicts script-written storage from sites not opened for ~7 days. Decided design: a **Cloudflare Worker + one SQLite Durable Object per username** (`worker/`), not Firestore (no Google project to hand) and not KV/D1 (eventual consistency / manual database id). Client = PBKDF2-stretched password, bearer sessions, optimistic per-project revisions (409 → keep both copies), explicit delete tombstones, history snapshots. `localStorage` stays the working store; guest mode = never signing in. The Worker and its API test (`tools/cloud-test.mjs`, run against `wrangler dev`, never the live site) land with 2.13. No password reset by design — every device keeps its own copy.
- Not done: a floor-standing / MCC board (`db` is wall-mounted, and `depth` is read as a plain number in several places, so a per-form depth needs an `idep(it)` helper first); cable tray and trunking as drawn linear items.
- **Next structural piece: the floor plan.** Rooms exist as a list but have no position relative to each other, which is what a floor plan needs — at minimum an x/y offset and a rotation per room, then a plan view that draws them together. Worth settling first: do adjacent rooms share a wall, or does each keep its own four?
- Still not done, deliberately: conduit is radial (each point measured back to the board, not looped in), cable colours aren't split L/N/E, and junction boxes aren't used as routing waypoints.

### Settings & updates (js/update.js, js/settings.js, 2.12)
- **Update check:** `updCheck()` fetches `version.json` with `cache:'no-store'` (10 s timeout) and resolves `'ok'|'offline'|'unsupported'|'error'`, never throwing. It runs ~2.5 s after boot, on `visibilitychange` (if the last check is >45 min old), on `online`, and every 2 h while visible; `settings.autoUpdate===false` turns the automatic ones off. `file:` → `'unsupported'`.
- State lives in `upd` and `pdes.upd`, so the orange dot on `#bMenu` (the `.fab.dot` class, also used for hidden layers) appears at once, not after the first fetch. The banner `#updbar` is dismissed **per version** (`upd.dismissed`); a newer release shows it again.
- **No service worker, on purpose.** Workers Static Assets sends `max-age=0, must-revalidate`, so a plain `location.reload()` already picks up new files; and a worker registered on `localhost:5173` would outlive this project and answer for every other app that dev server hosts (see "Testing gotcha"). If offline support is ever added, scope it to the production host only.
- Settings applies preferences on `change` (no Save button). `importBackup()` adds projects under **new ids** and never overwrites; the whole-device backup is `{app,kind:'backup',schema:1,projects:[{id,name,updated,appVersion,data}]}` and is recognised by `#fileIn` before the single-project check.
- Storage use counts characters, not bytes (browsers meter `localStorage` in characters, ~5 M).

### Rooms (2.6)
- `S.rooms` = `[room,…]`, `S.roomId` = the one being edited; `RM()` resolves it and is how every read in room.js gets the current room. `withRoom(r,fn)` runs something against another room and restores — used by the BOM, which covers all rooms.
- `migrate()` wraps a pre-2.6 single `doc.room` into the list, so old projects and exported JSON still open.
- Duplicating a room re-ids everything and remaps `props.circuit` and `props.controls` onto the copies; forgetting either would leave the copy pointing at the original's objects.
