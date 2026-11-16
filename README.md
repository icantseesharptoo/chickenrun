# Akyar Blocks

A first-person, block-style village game that runs in the browser, built on the real map of **Akyar, Republic of Bashkortostan, Russia**. Nothing to install: it is a static site.

Wake up in your house, feed the chickens and cats, drive to work, buy food at the shop, and hunt for three old keys around town. On Fridays, join the Juma prayer at the town mosque at 12:30. When you can afford a ticket, fly from the airport near your house to a random country, take a taxi to a hotel, and fly home again.

## How to play

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| W A S D | Walk | Shift | Run |
| Mouse | Look | Space | Jump |
| V | Third / first person | Wheel | Camera distance |
| E | Interact, get in or out of the car | Q | Eat food |
| M | Map (scroll to zoom) | N | Sound on/off |

In the car: W/S drive, A/D steer, Space brakes, H horn, V switches between driver and chase view.

**On an Android phone**, open the same link in Chrome and hold the phone sideways. Drag your left thumb to walk and your right thumb to look. USE feeds animals, opens doors and gets you in the car; ▲ ▼ ◀ ▶ drive it. Tap the minimap to open the map, and pinch to zoom. Graphics detail lowers automatically if a phone runs slowly. iPhone and iPad are not supported yet.

Follow the quest panel at the top left. Progress saves automatically in your browser. On a computer you need a keyboard and mouse. Any device needs a browser with WebGL2 (a recent Chrome, Edge or Firefox).

## The map

The world is about 5 × 6 km at real scale and deliberately flat, generated from real data:

- 2,309 building footprints, the streets with their real names, the Tanalyk river, forests and land use, from OpenStreetMap
- your home is the real house at Akmulla St 76, laid out from the owner's floor plan, with a red Lada Granta-style car in the yard; and your job and the shop are in and near the town centre; the shop and the parcel depot use real building footprints, with invented interiors and generic signs
- street names appear in English, romanized from the Russian names in OpenStreetMap

The exact lot, the homestead layout, the airport, the shop and depot roles, and most building colours and heights are invented. The airport does not exist in real life. OpenStreetMap records where buildings are, not what they look like.

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
| `js/blocks.js` | Materials and their textures, painted in code |
| `js/world.js` | Turns map data into collision, roads, water and buildings; the template used abroad |
| `js/sites.js` | Hand-built places: homestead, shop, depot, airports, hotel, key locations |
| `js/mesher.js` | Chunk streaming, ground, road and building meshes, distant view |
| `js/entities.js` | Chicken, cat, car, taxi, plane and person models |
| `js/audio.js` | All sounds, synthesised in the browser |
| `js/touch.js` | Phone controls: joystick, look, buttons, pinch zoom |
| `js/game.js` | Player, driving, flights, taxi, quests, shop, work, save/load, prices, country list |
| `data/akyar.js` | Baked map data (generated) |
| `data_src/` | Raw map and elevation downloads |
| `tools/bake_map.py` | Rebuilds `data/akyar.js` from `data_src/` |
| `tools/bake_terrain.py` | Rebuilds the hills in `data/terrain.js` |
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

To test the phone controls with real touch input through Chrome's Android emulation, serve the folder over HTTP and run:

```
python -I tests/android_test.py http://127.0.0.1:8123/ <folder-for-screenshots>
```

## Credits and licences

- **Map data** © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). `data/akyar.js` is a derived database and stays under the ODbL.
- **Elevation** for the hills on the horizon: [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) on AWS Open Data, which include SRTM data from NASA. Heights are exaggerated 5× and pulled closer, so the gentle real hills read as mountains.
- **[three.js](https://threejs.org/)** r159, MIT licence, see `vendor/THREE_LICENSE.txt`.
