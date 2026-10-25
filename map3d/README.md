# Summoner's Rift (stylised low-poly 3D)

- `summoners_rift.glb`: a glTF 2.0 model using vertex colours and no textures. It opens in Unity (glTFast), Godot, Blender and three.js.
  - The map spans -96..96 on x and z, y is up, and the map is centred at the origin. The blue base is south-west and the red base north-east (north = -z).
  - Scenery nodes: `Terrain` (smooth heightmap with a cliff skirt), `Water` (transparent plane at `water_level`),
    `Trees` (forest outside the lanes, bushes and a few trees on the jungle walls), `Brush`, `Rocks`, `Flowers`,
    `Walls` (stone ramparts with pillars along the lanes' outer edge and around both bases) and `Crystals`
    (purple crystals around the Baron pit).
  - Structure nodes: `Turret_<Blue|Red>_<Top|Mid|Bot>_<Outer|Inner|Inhibitor>`, `Turret_<Team>_Nexus_<Top|Bot>`,
    `Inhibitor_<Team>_<Lane>`, `Nexus_<Team>` and `Fountain_<Team>`. Hide a node when the structure is destroyed.
  - No monsters: jungle camp, Baron/Dragon and Scuttle positions are listed in `map_data.json`.
  - Materials: `Base` (vertex colour), `Water` (alpha blend) and `Glow_Blue` / `Glow_Red` / `Glow_Purple` (emissive crystals).
  - Size: about 410k triangles (terrain 207k on a 321 x 321 grid, trees 140k), of which trees are about 130k. Lower the tree density in `build_props` if you need it lighter.
- `map_data.json`: lane waypoints, river, fountains, Baron/Dragon/Scuttle, jungle camps and structures,
  in game coordinates (0–14870) and model coordinates (y = ground height), for match simulation and movement.
- `viewer.html`: a preview with shadows. Serve the folder (for example `python3 -m http.server`) and open `viewer.html`. Add `?top` for a top-down view,
  or `?cam=x,y,z&target=x,y,z` for a fixed camera.
- `preview/`: rendered screenshots.
- `layout.png` + `trace_layout.py`: the terrain layout (jungle walls, jungle paths, lanes, river, pits, outer forest),
  traced from the wiki's colour-coded minimap ("Lanes (Minimap).png" on lol.fandom.com). Pixel values are class
  codes, north up. Run `python3 trace_layout.py` to re-trace it; the minimap image itself is not stored here.
  `build_rift.py` keeps the half east of the mid-lane diagonal and rotates it 180° onto the other half, so the
  map is point-symmetric like the real Rift. Bases are rounded squares (`BASE_SIZE`, `BASE_ROUND`).
  Turrets are Order (pale stone, gold claws) or Chaos (dark iron, spikes, glowing slits) by team.
- `build_rift.py` + `geometry.py`: run `python3 build_rift.py` to regenerate everything. Layout, colours and sizes
  are constants at the top of `build_rift.py`, and each structure is its own function.
