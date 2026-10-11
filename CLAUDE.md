# DB Panel Designer — project notes for Claude Code

Internal tool for designing **distribution boards (DB panels)** and **room electrical layouts** (switches, sockets, lights, fans) with a 3D preview. Built for STELCO Malé Power Generation work, used mostly on a phone.

## Run / build / deploy
- No build step needed for development. Open `index.html` via a local server: `npm run serve` → http://localhost:5173
  (Opening `index.html` directly with `file://` also works on desktop.)
- `npm run build` → `dist/panel-designer-standalone.html` = everything inlined in one file (for testing on a phone from the file manager).
- Deploy: zip the **contents** of this folder (index.html at the zip root, no extra parent folder) and drop it on Netlify. A nested folder caused a 404 before.
- Every release gets a semantic version: bump `APP_VERSION` in `js/panel.js`, `version` in `package.json` and `manifest.webmanifest`, and add a line to the README changelog.

## Files
| File | What it is |
|---|---|
| `index.html` | App shell: canvases, top bars, floating buttons, bottom parts sheet, modal |
| `css/app.css` | All styles (mobile-first; ≥900 px puts the parts sheet on the left) |
| `js/panel.js` | Panel designer + shared app code: storage, projects, undo/redo, modals, toasts, menus, BOM, export, boot |
| `js/room.js` | Room designer: item library, 2D wall/ceiling editor, Three.js 3D view |
| `vendor/three.min.js` | Three.js **r149** classic (non-module) build — last version with `build/three.min.js`. Keep it classic so the app runs from `file://` |
| `tools/build-standalone.mjs` | Inlines CSS/JS into one HTML file |

Scripts are classic `<script>` tags sharing one global scope (top-level `const`/`let` are visible across files). Load order: three → panel → room. Boot runs on `DOMContentLoaded` (end of `panel.js`) so everything is defined first.

## Data model (localStorage)
- `pdes.projects.v1` → `{ [projectId]: { name, updated, appVersion, data } }`, `pdes.current`, `pdes.settings`
- `data = { items, wires, layers, defs, room }` — `migrate()` in panel.js upgrades older projects; `normRoom()` in room.js fills room defaults.
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
- `room.circuits` = `[{id,name,mcb,cable}]`. A point names one in `props.circuit` **by id**, so renaming can't orphan it. `normRoom()` treats an unknown value as a circuit NAME and promotes it — that is how pre-2.1 free text upgrades itself.
- Switches carry `props.controls`: one array of load ids per gang. `RDEFS.ways(props)` gives the gang count (`sw`, `swb`, `fanreg`). Never put `controls` in `RDEFS.defaults` — `Object.assign` copies an array by reference and every switch would share one; `normControls()` builds fresh arrays on create/load/edit.
- Conduit is **constructed, not searched** (`routeBetween`, `perimPath`): drop to `runH()` 150 mm under the ceiling, along the walls the shorter way round turning at corners, then to the far point; ceiling↔wall crossings go via the ceiling edge. panel.js's A* doesn't apply — it is single-plane, and these runs cross surfaces.
- **Topology (2.7):** `roomRuns()` walks items, not circuits. DB→switch and DB→socket are `kind:'feed'` (red); switch→light/fan is `kind:'switched'` (yellow), sourced from `switchesFor()`. A load on no switch falls back to a direct feed. `effCircuit()` lets a load with a blank circuit inherit its switch's — an explicit choice always wins.
- Run colour encodes the conductor, so selection changes width/opacity, never hue.
- Runs are 3D room points. `runOnSurf()` projects them back for whichever surface is being drawn; `nudge()` lifts them 8 mm off the surface in 3D or they z-fight.
- `roomRuns()` is recomputed on demand (no cache) — if it ever shows up in a profile, that is the thing to memoise.

## Conventions
- Vanilla JS, no framework, no bundler. Keep everything working offline.
- Phone first: touch targets ≥ 34 px, test in a 412×900 touch viewport. Pointer Events everywhere; a new primary pointer resets stale gestures.
- `toast()` for feedback, `openModal()` for forms, `reportError()` shows errors on screen.
- Headless testing: Playwright + Chromium; for 3D launch with `--use-gl=swiftshader --enable-unsafe-swiftshader`.

## Roadmap
- **v2: room wiring — done (2.1–2.3).** See "Room wiring" above.
- **v3 — done bar the floor plan:** panel-breaker links (2.4), elevations sheet (2.5), multiple rooms (2.6).
- **Next: the floor plan.** Rooms exist as a list but have no position relative to each other, which is what a floor plan needs — at minimum an x/y offset and a rotation per room, then a plan view that draws them together. Worth settling first: do adjacent rooms share a wall, or does each keep its own four?
- Still not done, deliberately: conduit is radial (each point measured back to the board, not looped in), cable colours aren't split L/N/E, and junction boxes aren't used as routing waypoints.

### Rooms (2.6)
- `S.rooms` = `[room,…]`, `S.roomId` = the one being edited; `RM()` resolves it and is how every read in room.js gets the current room. `withRoom(r,fn)` runs something against another room and restores — used by the BOM, which covers all rooms.
- `migrate()` wraps a pre-2.6 single `doc.room` into the list, so old projects and exported JSON still open.
- Duplicating a room re-ids everything and remaps `props.circuit` and `props.controls` onto the copies; forgetting either would leave the copy pointing at the original's objects.
