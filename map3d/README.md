# Summoner's Rift (voxel / pixel 3D)

- `summoners_rift.glb` — model glTF 2.0 (vertex colours, no textures). Opens in Unity (glTFast), Godot, Blender, three.js.
  - 1 unit = 1 voxel, 192 x 192 voxels, y is up, map centred at the origin; blue base south-west, red base north-east (north = -z).
  - Node `Terrain` plus one node per structure: `Turret_<Blue|Red>_<Top|Mid|Bot>_<Outer|Inner|Inhibitor>`,
    `Turret_<Team>_Nexus_<Top|Bot>`, `Inhibitor_<Team>_<Lane>`, `Nexus_<Team>`. Hide a node when it is destroyed.
  - Monster nodes (half-size voxels for extra detail): `Monster_Baron`, `Monster_Dragon`, `Monster_Scuttle_<Top|Bot>`,
    and per side `Monster_<Blue_Sentinel|Red_Brambleback|Gromp|Murk_Wolves|Raptors|Krugs>_<Blue|Red>`.
    Hide a node while that camp is dead.
- `map_data.json` — lane waypoints, river, fountains, Baron/Dragon/Scuttle, jungle camps and structures,
  in game coordinates (0–14870) and model coordinates, for match simulation and minion/champion movement.
- `viewer.html` — preview (serve the folder, e.g. `python3 -m http.server`, then open `viewer.html`; `?top` for a top-down view,
  `?cam=x,y,z&target=x,y,z` for a fixed camera).
- `preview/` — rendered screenshots.
- `build_rift.py` — regenerates everything: `python3 build_rift.py`. Layout, colours, sizes are constants at the top.
