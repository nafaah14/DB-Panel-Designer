# DB Panel Designer — Handover (v2.0.0)

Oct 11, 2026 · @Nafaah

## Summary

DB Panel Designer v2.0.0 is a phone-first web app with two designers: a **panel designer** for distribution boards and a **room designer** for placing electrical points on walls and ceilings, with a 3D view. It is vanilla JavaScript with no framework or build step, saves to the browser's localStorage, works offline, and deploys to Netlify as a zip.

It was built for STELCO Malé Power Generation Department work and is used mostly on a phone. Development now moves to VS Code with Claude Code; the next milestone is **room wiring** (v2 of the room designer).

| Area | Status at v2.0.0 |
| --- | --- |
| Panel designer | Complete and stable: DIN rails, 20+ device types, busbars, auto-routed wiring, layers, BOM, exports |
| Room designer v1 | Complete: 4 walls + ceiling editors, 25 point types, doors/windows, 3D view, exports |
| Room wiring | Not started; each point already stores a `circuit` field |
| Tested on | Headless Chromium at phone (412×900 touch) and desktop sizes; not yet on a real iPhone/Safari |

## Getting started in VS Code

Unzip `DB-Panel-Designer-v2.0.0.zip` into a folder, open it in VS Code, and start Claude Code in the terminal; it reads `CLAUDE.md` automatically.

1. Install Node.js (any current LTS) if it isn't installed. No `npm install` is needed: there are no dependencies.
2. Optional: `git init` and commit, so every change from Claude Code can be reviewed and rolled back.
3. `npm run serve` → preview at http://localhost:5173. On the same Wi-Fi, open `http://<your-PC-IP>:5173` on the phone to test live.
4. `npm run build` → regenerates `dist/panel-designer-standalone.html` (all files inlined, about 740 KB) for testing straight from the phone's file manager.
5. Deploy: zip the **contents** of the folder (`index.html` at the zip root, never a parent folder) and drop it on Netlify.

A good first prompt for Claude Code: *"Read CLAUDE.md, then plan room wiring v2." (Export this doc as Markdown into the folder if you want Claude Code to read it too.)*

## Project structure

The app is plain files served as-is; `panel.js` and `room.js` together are about 1,100 dense lines.

| File | Size | What it holds |
| --- | --- | --- |
| `index.html` | 2 KB | Shell: both canvases, top bars, floating buttons, parts sheet, modal |
| `css/app.css` | 11 KB | All styles; mobile first, parts sheet moves to the left at ≥ 900 px |
| `js/panel.js` | 84 KB | Panel designer **plus shared app code**: storage, projects, undo/redo, modals, toasts, menu, BOM, export, boot |
| `js/room.js` | 53 KB | Room designer: item library, 2D wall/ceiling editor, Three.js 3D view, room export |
| `vendor/three.min.js` | 608 KB | Three.js r149 classic build (MIT, licence alongside) |
| `tools/build-standalone.mjs` | 1 KB | Inlines CSS and JS into `dist/panel-designer-standalone.html` |
| `CLAUDE.md` | 5 KB | Project notes Claude Code loads automatically |
| `README.md`, `package.json`, `manifest.webmanifest`, `icon.svg` | small | Feature list + changelog, npm scripts, install-as-app metadata, icon |

## Architecture and data model

All scripts are classic `<script>` tags sharing one global scope, so `room.js` calls helpers defined in `panel.js` directly. Keep it classic (no ES modules) so the app still runs from `file://` on a phone.

&#91;embedded content: architecture · 3 scripts, 1 shared project state\]

- **Storage:** `pdes.projects.v1` holds `{ projectId: { name, updated, appVersion, data } }`; `data = { items, wires, layers, defs, room }`.
- **Undo/redo:** `pushUndo()` before a change stores a JSON snapshot of `data` (80 deep); then `commit()` (panel) or `roomCommit()` (room) saves and redraws. Undo keeps each layer's visibility and lock as they are now.
- **Migration:** `migrate()` (panel.js) upgrades every older project on load; `normRoom()` (room.js) fills room defaults. Old v1.x projects open fine and get an empty 3.6 × 3.0 × 2.7 m room.
- **Mode:** `appMode` is `'panel'` or `'room'`, saved in settings; `setAppMode()` switches; `body.room` and `body.r3d` CSS classes show the right views.
- **Errors:** `reportError()` and a global error handler show any error as a toast, so a phone user can report it.

## Panel designer internals (js/panel.js)

The panel canvas is an SVG at **2 px = 1 mm**: one DIN module is 18 mm = 36 px (`M`), and rail slots count in half-modules (`U` = 18 px).

| Concept | Where | Notes |
| --- | --- | --- |
| Component definitions | `DEFS`, library tabs in `PANEL_LIB` | Each has `units`, `size`, `terms` (terminals), `draw` (SVG), `props`, `desc` (BOM text), `z` (draw order) |
| Rails and slots | `findSnap`, `isFree`, `firstFree` | A device on a rail stores `rail` + `slot`. Snapping prefers whole modules or flush against a neighbour, so no half-module gaps |
| Rail joining | `railJoinTarget`, `joinRails`, `packRail` | Rails dropped end-to-end or overlapping merge into one; "Close gaps" packs devices left |
| Wires | `{a:'item:term', b, color, size, layer, path?}` | Colour "auto" follows phase and the chosen scheme (Red/Blue, IEC 60445, legacy) |
| Auto-routing | `astar`, `computeRoutes`, `obstacles` | Orthogonal A\* around padded device boxes, bend penalty 34, overlap penalty to spread parallel wires into lanes. Only wires attached to a dragged item are rerouted during the drag |
| Manual wire shape | `startSeg`, `splitAt`, `manualPts` | Drag a segment handle; tap a selected wire to add a bend. `path` stores inner points; "Auto route" deletes it |
| Layers | `S.layers`, `S.defs` | Visible / locked / order; default layer for new parts and new wires; hidden layers are skipped in exports but counted in the BOM |
| Touch handling | pointer handlers on `#cv` | A new primary pointer clears stale ones (the v1.1.1 phone bug); devices win over nearby wire tap zones; 10 px tap slop for touch |

## Room designer internals (js/room.js)

The room is stored once, in mm, and both the 2D editors and the 3D view are drawn from it. The origin is the floor corner where Wall D meets Wall A: x runs along Wall A (width `w`), z along Wall B (length `l`), y up (height `h`).

| Wall | From → to (seen from inside, left → right) | Inward normal |
| --- | --- | --- |
| A | (0, 0, 0) → (W, 0, 0) | +z |
| B | (W, 0, 0) → (W, 0, L) | −x |
| C | (W, 0, L) → (0, 0, L) | −z |
| D | (0, 0, L) → (0, 0, 0) | +x |

- **Item:** `{id, type, surf, x, y, props}`. On a wall, `x` = centre from the wall's left end and `y` = centre height. On the ceiling, `x` = from Wall D and `y` = from Wall A. `props.label` shows in 3D; `props.circuit` is stored for wiring.
- **Definitions:** `RDEFS` gives each type its size in mm (`w`, `h`), `depth`, default `mount` height, 3D `model`, `draw` (SVG symbol in mm) and `desc` (BOM text). Library tabs are in `ROOM_LIB`. Adding a type = one `RDEFS` entry + one `ROOM_LIB` line.
- **2D editor:** `draw2D()` renders the selected surface on `#r2d` (scale `RS` = 0.25 px/mm × zoom). `snapPos()` snaps to a 50 mm grid, the standard heights in `SNAP_H` (300, 450, 1100, 1200, 1800, 2100, 2300 mm), wall centre and other points' lines. Selected items show edge, centre and height dimensions.
- **3D view:** `build3D()` rebuilds the scene from data; `render3D()` draws on demand via `req3D()`. Walls are extruded shapes with door and window holes. Walls facing the camera are cut away. Item fronts reuse the 2D SVG as a texture (`itemTexture`, cached). Labels are HTML chips projected each frame, and tapping one selects the point.
- **Camera:** custom orbit in `orb` (no OrbitControls file): 1 finger rotates, 2 fingers zoom and pan, wheel zooms. `setViewOffset` centres the room in the area not covered by the parts sheet.

## Conventions and release process

Every release gets a semantic version and a zip with `index.html` at its root.

1. Bump the version in three places: `APP_VERSION` in `js/panel.js`, `version` in `package.json` and in `manifest.webmanifest`.
2. Add a line at the top of the README changelog.
3. Run `npm run build` to refresh the standalone file.
4. Zip the folder **contents** (not the folder) and deploy to Netlify; a nested folder caused a 404 before.

Coding conventions:

- Vanilla JS, no framework, no bundler, no network calls; everything must work offline.
- Phone first: touch targets of at least 34 px, Pointer Events everywhere, test at 412 × 900 with touch.
- Every change goes through `pushUndo()` first, then `commit()` / `roomCommit()`.
- New saved fields need a default in `migrate()` or `normRoom()` so old projects still open.
- Use `toast()` for feedback, `openModal()` for forms, `reportError()` for caught errors.
- Keep Three.js at r149 classic unless the app moves to a module-based build.

## Testing

v2.0.0 was tested with Playwright driving headless Chromium; the test scripts were throwaway and are **not in the zip**, so adding a `tests/` folder is a good early task for Claude Code. For 3D, launch Chromium with `--use-gl=swiftshader --enable-unsafe-swiftshader`.

Checks that passed at v2.0.0 and should be re-run before each release:

- [ ] Phone viewport (412 × 900, touch): real taps select every device on the demo board (30/30), wires stay selectable away from devices
- [ ] A stuck pointer (down with no up) does not block later taps
- [ ] Panel routing: no wire crosses a device face; dragging a wire handle keeps it orthogonal; layers hide, lock and move items
- [ ] Rails placed end to end join into one rail with no gap
- [ ] Room: 3D renders with labels; tapping a label selects; dragging on a wall snaps; add, undo and room settings work
- [ ] Exports: panel PNG/SVG, wall PNG/SVG, 3D PNG with labels
- [ ] A v1.2-era project (no `room`) opens and gets a default room; the app reopens in the last mode
- [ ] The standalone file behaves the same as the multi-file version

## Known issues and limitations

None of these block use today; the first two are the ones to watch.

| Issue | Impact | Suggested fix |
| --- | --- | --- |
| Not tested on a real iPhone / Safari (WebKit) | The phone tap bug in v1.1.0 was never reproduced; WebKit-specific bugs may remain | Test on a real device; errors now show as toasts |
| Data lives only in the browser's localStorage | Clearing site data or switching phone loses projects | Export project JSON regularly; Firebase/Firestore sync later |
| One room per project | Can't model a whole house yet | Planned in v3 (multiple rooms + floor plan) |
| Rooms are rectangles only | No L-shapes, bay walls or sloped ceilings | Generalise `wallGeo()` to a list of wall segments |
| No room wiring | Points have circuits but no cables or conduit | Room wiring v2 (next section) |
| Points don't check for overlaps | Two points can sit on top of each other | Warn on overlap in `snapPos()` |
| Panel and room BOMs are separate lists | Room points aren't linked to MCBs | v3: link `props.circuit` to panel MCB labels |
| `panel.js` holds shared app code | New features keep growing one file | Split into `core.js` + `panel.js` when convenient |
| 3D is 608 KB of Three.js | Slower first load on a weak connection | Fine offline; switch to a module build only with a bundler |

## Roadmap and next steps

The next milestone is room wiring: turning the `circuit` already stored on each point into routed cables.

&#91;embedded content: roadmap · 3 phases\]

Suggested order for room wiring:

1. Add a `circuits` list to the room (name, MCB, cable size) and a picker in the point's Edit form, replacing the free-text field.
2. Add `controls` on switches: which lights or fans each gang switches.
3. Route conduit as orthogonal paths on the wall/ceiling surfaces (up to a cable height, along to a junction box, back to the DB), reusing the A\* idea from `panel.js` per surface.
4. Draw cables in each 2D editor and as tubes or lines in 3D, coloured L / N / E; add a Wiring layer toggle.
5. Add cable and conduit lengths per circuit to the BOM.

Open question: should the room's DB use the actual panel from the same project (one MCB per circuit), or stay a simple point until v3?

## Version history

| Version | Date | Change |
| --- | --- | --- |
| 2.0.0 | 11 Oct 2026 | Room designer v1 (walls, ceiling, 3D); project split into html / css / js / vendor; standalone build script; CLAUDE.md |
| 1.2.0 | 11 Oct 2026 | Rails join end to end; flush module snapping; Close gaps; width options for voltage relay, meter, RCBO |
| 1.1.1 | 11 Oct 2026 | Fixed phone taps not selecting parts; devices win over wire tap zones; on-screen errors |
| 1.1.0 | 11 Oct 2026 | Obstacle-avoiding auto-routing; manual wire bends; layers; multi-select |
| 1.0.0 | 10 Oct 2026 | First release: DIN-rail panel designer, wiring, projects, BOM, exports |
