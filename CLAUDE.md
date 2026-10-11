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

## Conventions
- Vanilla JS, no framework, no bundler. Keep everything working offline.
- Phone first: touch targets ≥ 34 px, test in a 412×900 touch viewport. Pointer Events everywhere; a new primary pointer resets stale gestures.
- `toast()` for feedback, `openModal()` for forms, `reportError()` shows errors on screen.
- Headless testing: Playwright + Chromium; for 3D launch with `--use-gl=swiftshader --enable-unsafe-swiftshader`.

## Roadmap
- **v2 (next): room wiring** — circuits per point (`props.circuit` already stored), switch → light links, conduit routing along walls/ceiling to junction boxes and the DB, coloured L/N/E, cable lengths in the BOM, wires in 2D and 3D.
- **v3:** link room circuits to panel MCB labels, multiple rooms + floor plan, printable elevations sheet.
