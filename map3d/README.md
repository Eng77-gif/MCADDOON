# Summoner's Rift (stylised low-poly 3D)

- `summoners_rift.glb`: a glTF 2.0 model. The ground carries the top-down texture (unlit, `KHR_materials_unlit`), everything else uses vertex colours. It opens in Unity (glTFast), Godot, Blender and three.js.
  - The map spans -96..96 on x and z, y is up, and the map is centred at the origin. The blue base is south-west and the red base north-east (north = -z).
  - Scenery nodes: `Terrain` (smooth heightmap painted with `rift_texture.jpg`), `Cliffs` (skirt under the island),
    `Trees` (forest outside the lanes, bushes and a few trees on the jungle walls), `Brush`, `Rocks`, `Flowers`,
    `Walls` (stone ramparts with pillars along the lanes' outer edge and around both bases) and `Crystals`
    (purple crystals around the Baron pit).
  - Structure nodes: `Turret_<Blue|Red>_<Top|Mid|Bot>_<Outer|Inner|Inhibitor>`, `Turret_<Team>_Nexus_<Top|Bot>`,
    `Inhibitor_<Team>_<Lane>`, `Nexus_<Team>` and `Fountain_<Team>`. Hide a node when the structure is destroyed.
  - No monsters: jungle camp, Baron/Dragon and Scuttle positions are listed in `map_data.json`.
  - Materials: `Base` (vertex colour), `Water` (alpha blend) and `Glow_Blue` / `Glow_Red` / `Glow_Purple` (emissive crystals).
  - Size: about 390k triangles (terrain 205k on a 321 x 321 grid, trees ~100k), ~26 MB with the embedded texture, of which trees are about 130k. Lower the tree density in `build_props` if you need it lighter.
- `map_data.json`: lane waypoints, river, fountains, Baron/Dragon/Scuttle, jungle camps and structures,
  in game coordinates (0–14870) and model coordinates (y = ground height), for match simulation and movement.
- `viewer.html`: a preview with shadows. Serve the folder (for example `python3 -m http.server`) and open `viewer.html`. Add `?top` for a top-down view,
  or `?cam=x,y,z&target=x,y,z` for a fixed camera.
- `preview/`: rendered screenshots.
- `rift_texture.jpg` + `reference_texture.py` + `reference/rift_reference.webp`: the ground texture is the
  supplied in-game screenshot, unwarped to a top-down view with a homography fitted to structures whose game
  positions are known (nexuses and outer turrets). Run `python3 reference_texture.py` to regenerate it.
  The screenshot is Riot Games artwork: fine for a personal/fan project, not for a commercial release.
  Without `rift_texture.jpg` the build falls back to procedural vertex colours, a water plane and a
  point-symmetric layout.
- Brushes: `BRUSH_PX_DRAGON_HALF` / `BRUSH_PX_BARON_HALF` in `build_rift.py` are the brushes picked off the
  texture; each list is mirrored through the centre so both teams get the same set. They become 3D grass in `Brush`.
- `layout.png` + `trace_layout.py`: the terrain layout (jungle walls, jungle paths, lanes, river, pits, outer forest),
  traced from the wiki's colour-coded minimap ("Lanes (Minimap).png" on lol.fandom.com). Pixel values are class
  codes, north up. Run `python3 trace_layout.py` to re-trace it; the minimap image itself is not stored here.
  The heights follow it as traced so they line up with the texture (the real map in the screenshot is already
  point-symmetric apart from Baron/Dragon decoration). Bases are rounded squares (`BASE_SIZE`, `BASE_ROUND`).
  Turrets are Order (pale stone, gold claws) or Chaos (dark iron, spikes, glowing slits) by team.
- `build_rift.py` + `geometry.py`: run `python3 build_rift.py` to regenerate everything. Layout, colours and sizes
  are constants at the top of `build_rift.py`, and each structure is its own function.
