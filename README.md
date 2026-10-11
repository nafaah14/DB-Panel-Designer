# DB Panel Designer — v2.7.0

Phone-first designer for **DB panels** (DIN rails, breakers, busbars, wiring) and **room electrical layouts** (switches, sockets, lights, fans) with a 3D view. Vanilla JS, works offline, data saved on the device.

## Deploy
Drop the zip (index.html is at its root) onto Netlify. For a quick phone test without hosting, open `dist/panel-designer-standalone.html` (everything in one file).

## Develop (VS Code + Claude Code)
`npm run serve` → http://localhost:5173 · `npm run build` → standalone file. See **CLAUDE.md** for architecture and conventions.

## Features
### Room wiring (new in 2.1)
- **⚡ Circuits** — one list per room: name, MCB rating and cable size. Add, rename, re-rate, delete; each row shows how many points are on it.
- Every point picks its circuit from that list (Edit → Circuit). Unassigned is allowed.
- **Switching** (2.2) — a switch, switch board or fan regulator lists every light and fan in the room, one tick-list per gang, so you record what each gang actually drives. Loads are named with their position, so four identical downlights stay tellable apart.
- **Conduit runs** (2.3) — cables are routed along real conduit lines: a drop to a run height just under the ceiling, along the walls the shorter way round, then into the board; ceiling points cross the ceiling in two legs. Drawn in every wall / ceiling elevation and in 3D, the selected point's whole circuit picked out. Toggle with **Wiring**.
- **Wired the way it's installed** (2.7) — the board feeds switches and sockets with a **live feed (red)**, and a switch feeds its lights and fans with **switched live (yellow)**. So a light's cable comes from its switch, not the board, and at a glance you can see which lights are switched and which are fed direct. A light left on no circuit inherits its switch's.
- Cable per circuit and total conduit appear in the bill of materials.
- **Linked to the panel** (2.4) — a circuit can point at a real breaker on the board, and then shows that breaker's own rating instead of typed text. **Match by label** links every circuit whose name matches a breaker label in one tap. Flags a breaker used twice, and gives an indicative warning if the cable looks undersized for the breaker (a rough check, not a sizing calculation).

### Room designer (new in 2.0)
- Switch **Panel / Room** at the top. Room = 4 walls + ceiling, size and wall names in ⚙ Room.
- Each wall opens as a flat elevation: drag points, snaps to 50 mm, standard heights (300 sockets, 1200 switches, 2100 AC…) and to other points; distance-to-corner and height dimensions; "All heights" mode.
- Ceiling plan with centre lines for fans and lights.
- Library: switches 1–4 gang, modular switch boards, fan regulator, AC isolator, 13A / 5A / 15A sockets, TV/data, wall light, exhaust fan, DB, junction boxes, downlights, LED panel, ceiling fan, pendant, smoke detector, doors and windows (cut into the wall in 3D).
- 3D view: rotate / pinch / pan, walls toward you cut away, yellow labels (tap a label to select, again to open its wall), tap a wall to edit it.
- Export the current wall / ceiling drawing (PNG/SVG, with heights) or the 3D view (PNG with labels). Room points appear in the bill of materials.
- **Elevations sheet** (2.5) — Menu → Elevations sheet: all four walls and the ceiling on one page with a title block and a circuits table, as PNG or SVG.
- **Multiple rooms** (2.6) — 🏠 Rooms holds as many rooms as the job needs, all sharing the project's one panel. Switch, rename, duplicate (a full copy, links and all) or delete. The bill of materials covers every room.
### Panel designer
- Library: MCB 1P–4P, MCB 1P+N, RCD 2P/4P, RCBO, main switch, SPD, contactor, voltage relay, kWh meter 1φ/3φ, indicator lamp
- 35 mm DIN rails (6–48 modules) with module snapping and collision checks; enclosures
- Earth/neutral bars, comb busbars, terminal blocks, incoming supply and outgoing cables
- Wiring: obstacle-avoiding orthogonal auto-routing with lane spreading; manual reshaping with multiple bends
- Layers: add/rename/reorder/delete, show/hide, lock, default layer for new parts and new wires, move parts or wires between layers
- Multi-select (Select more / Shift-click): move to layer, delete
- Undo/redo, multiple projects, JSON import/export, PNG/SVG export of visible layers
- Bill of materials with wire lengths (+15%) and rail usage, CSV export

## Changelog
- 2.7.0 — **Wiring follows the real topology.** Cables no longer all run radially to the board: the DB feeds switches and sockets (live, red) and a switch feeds the lights and fans assigned to its gangs (switched live, yellow). A light with no circuit of its own inherits the circuit of the switch driving it; one not on any switch still gets a direct feed. Conductor colour is now meaning rather than decoration, so selecting a circuit changes line weight instead of hue, and the elevations sheet carries a key
- 2.6.0 — v3, part 3: **multiple rooms per project**. A project holds a list of rooms (🏠 Rooms — switch, add, rename, duplicate, delete) all sharing one panel, so a circuit in any room can point at its breakers. Duplicating a room deep-copies it with fresh ids and remaps its circuit and switch→load links onto the copy. The bill of materials covers every room, prefixed by room name. Single-room projects from 2.5 and earlier are wrapped into the list on load with nothing lost
- 2.5.0 — v3, part 2: **elevations sheet**. Menu → Elevations sheet puts all four walls and the ceiling on one page with a title block and a circuits table (MCB, cable, points, cable length), as PNG or SVG. Each surface is captured by pointing the normal drawing code at it, so the sheet always matches what the editor shows; the editor’s own surface, zoom and selection are restored afterwards
- 2.4.0 — v3, part 1: **room circuits link to panel breakers**. A circuit can name a real MCB/RCBO/RCD on the board and then shows that device's actual rating rather than typed text; **Match by label** links everything whose circuit name matches a breaker label in one tap (fills blanks only, never double-books a breaker). Warns when two circuits share a breaker, and gives an indicative — explicitly not a calculation — warning when the cable looks undersized for the breaker rating. A breaker deleted from the panel quietly unlinks
- 2.3.0 — Room wiring, part 3: **conduit routing, drawing and quantities**. Each assigned point is routed back to the DB along real conduit lines — up to a run height below the ceiling, around the walls the shorter way, down into the board — and drawn in the 2D elevations and in 3D, the selected point's circuit highlighted. New **Wiring** toggle. The BOM gains cable per circuit (+10%) and a total conduit length that counts shared runs once
- 2.2.0 — Room wiring, part 2: **switch → load links**. Switches, switch boards and fan regulators get a tick-list of every light and fan in the room, one per gang, saved on the switch. Links survive gang-count changes (a 6M board cut to 2M keeps the first two gangs) and are cleaned up when a light is deleted
- 2.1.0 — Room wiring, part 1: a **Circuits** list per room (name, MCB, cable size) via ⚡ Circuits, and a circuit picker on every point in place of the old free-text field. Points reference a circuit by id, so renaming one never orphans them; deleting one leaves its points unassigned rather than deleting them. Projects from 2.0 upgrade automatically — existing free-text circuit names become real circuits, with the MCB and cable size guessed from the name (lighting 1.5 mm², sockets 2.5 mm², A/C 4 mm²)
- 2.0.0 — Room designer v1 (wall & ceiling editors, 3D view with Three.js r149); project split into index.html / css / js / vendor for VS Code; standalone build script; CLAUDE.md
- 1.2.0 — Rails placed end-to-end (or overlapping) join into one continuous rail; devices snap to whole modules or flush to neighbours (no half-module gaps); "Close gaps" on a selected rail; rail length is free entry; width option for voltage relay, kWh meter and RCBO; demo board packed tight
- 1.1.1 — Fix: taps on phones could stop selecting parts (stale touch pointer was treated as a pinch); devices now take priority over nearby wire tap zones; larger touch tap tolerance; errors shown on screen instead of failing silently
- 1.1.0 — Auto-router avoids devices and separates parallel wires; drag handles on every wire run and tap-to-add bends; layers panel (visibility, lock, order, defaults, move); multi-select; circuit labels drawn above wires; v1.0.0 projects migrate automatically
- 1.0.0 — Initial release
