# DB Panel Designer — v2.0.0

Phone-first designer for **DB panels** (DIN rails, breakers, busbars, wiring) and **room electrical layouts** (switches, sockets, lights, fans) with a 3D view. Vanilla JS, works offline, data saved on the device.

## Deploy
Drop the zip (index.html is at its root) onto Netlify. For a quick phone test without hosting, open `dist/panel-designer-standalone.html` (everything in one file).

## Develop (VS Code + Claude Code)
`npm run serve` → http://localhost:5173 · `npm run build` → standalone file. See **CLAUDE.md** for architecture and conventions.

## Features
### Room designer (new in 2.0)
- Switch **Panel / Room** at the top. Room = 4 walls + ceiling, size and wall names in ⚙ Room.
- Each wall opens as a flat elevation: drag points, snaps to 50 mm, standard heights (300 sockets, 1200 switches, 2100 AC…) and to other points; distance-to-corner and height dimensions; "All heights" mode.
- Ceiling plan with centre lines for fans and lights.
- Library: switches 1–4 gang, modular switch boards, fan regulator, AC isolator, 13A / 5A / 15A sockets, TV/data, wall light, exhaust fan, DB, junction boxes, downlights, LED panel, ceiling fan, pendant, smoke detector, doors and windows (cut into the wall in 3D).
- 3D view: rotate / pinch / pan, walls toward you cut away, yellow labels (tap a label to select, again to open its wall), tap a wall to edit it.
- Export the current wall / ceiling drawing (PNG/SVG, with heights) or the 3D view (PNG with labels). Room points appear in the bill of materials.
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
- 2.0.0 — Room designer v1 (wall & ceiling editors, 3D view with Three.js r149); project split into index.html / css / js / vendor for VS Code; standalone build script; CLAUDE.md
- 1.2.0 — Rails placed end-to-end (or overlapping) join into one continuous rail; devices snap to whole modules or flush to neighbours (no half-module gaps); "Close gaps" on a selected rail; rail length is free entry; width option for voltage relay, kWh meter and RCBO; demo board packed tight
- 1.1.1 — Fix: taps on phones could stop selecting parts (stale touch pointer was treated as a pinch); devices now take priority over nearby wire tap zones; larger touch tap tolerance; errors shown on screen instead of failing silently
- 1.1.0 — Auto-router avoids devices and separates parallel wires; drag handles on every wire run and tap-to-add bends; layers panel (visibility, lock, order, defaults, move); multi-select; circuit labels drawn above wires; v1.0.0 projects migrate automatically
- 1.0.0 — Initial release
