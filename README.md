# Akyar Blocks

A first-person, block-style village game that runs in the browser, built on the real map of **Akyar, Republic of Bashkortostan, Russia**. Nothing to install: it is a static site.

Wake up in your house, feed the chickens and cats, drive to work, buy food at the shop, and hunt for three old keys around town.

## How to play

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| W A S D | Walk | Shift | Run |
| Mouse | Look | Space | Jump |
| E | Interact, get in or out of the car | Q | Eat food |
| M | Map (scroll to zoom) | N | Sound on/off |

In the car: W/S drive, A/D steer, Space brakes, H horn, V switches between driver and chase view.

Follow the quest panel at the top left. Progress saves automatically in your browser. You need a computer with a keyboard and mouse, and a browser with WebGL2 (a recent Chrome, Edge or Firefox).

## The map

The world is about 5 × 6 km at roughly 1 block = 1 metre, generated from real data:

- 2,309 building footprints, the streets with their real names, the Tanalyk river, forests and land use, from OpenStreetMap
- real terrain heights from elevation data
- your home is on Akmulla Street, and your job and the shop are in and near the town centre; the shop and the parcel depot use real building footprints, with invented interiors and generic signs
- street names appear in English, romanized from the Russian names in OpenStreetMap

The exact lot, the homestead layout, the shop and depot roles, and most building colours and heights are invented. OpenStreetMap records where buildings are, not what they look like.

## Run it locally

Open `index.html` in a browser. No server or build step is needed.

## Publish on GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then `main` and `/ (root)`, and save.

After a minute or two the game is live at `https://<your-username>.github.io/<repository-name>/`.

## Project layout

| Path | Contents |
| --- | --- |
| `index.html`, `css/` | Page and on-screen display |
| `js/blocks.js` | Blocks and their pixel-art textures, painted in code |
| `js/world.js` | Turns map data into terrain, roads, water and buildings |
| `js/sites.js` | Hand-built places: homestead, shop, parcel depot, key locations |
| `js/mesher.js` | Chunk streaming, rendering, distant landscape |
| `js/entities.js` | Chicken, cat, car and person models |
| `js/audio.js` | All sounds, synthesised in the browser |
| `js/game.js` | Player, driving, quests, shop, work, save/load, prices |
| `data/akyar.js` | Baked map data (generated) |
| `data_src/` | Raw map and elevation downloads |
| `tools/bake_map.py` | Rebuilds `data/akyar.js` from `data_src/` |
| `tests/` | Scripted playthrough and screenshot presets |
| `docs/ASSETS.md` | Art, sound and reference material wanted |

To move the homestead and rebuild the map, name a street or give a location:

```
python -I tools/bake_map.py data_src data/akyar.js --home-street "улица Акмуллы"
python -I tools/bake_map.py data_src data/akyar.js --home-lat 51.866 --home-lon 58.208
```

To run the tests on Windows with Chrome installed:

```
powershell -ExecutionPolicy Bypass -File tests\run.ps1 smoke
```

## Credits and licences

- **Map data** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). `data/akyar.js` is a derived database and stays under the ODbL.
- **Elevation**: [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) on AWS Open Data, which include SRTM data from NASA.
- **[three.js](https://threejs.org/)** r159, MIT licence, see `vendor/THREE_LICENSE.txt`.
