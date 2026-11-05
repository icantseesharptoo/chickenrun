# What the game needs

The game is fully playable today with no external files: textures are painted in code, models are built from boxes, and sounds are synthesised. Everything below is an upgrade.

## Most useful: reference photos

These change how much the game looks like the real Akyar. Phone photos are fine.

| Priority | Photos | What they change |
| --- | --- | --- |
| 1 | Your real house and yard: front, sides, roof, gate, fence, shed | Homestead layout and colours |
| 1 | Inside the house: kitchen, bedroom, stove, carpets | Room layout and furniture |
| 2 | A typical street: 5 to 10 ordinary houses, carved window frames, fences, gates | House colours, window and fence textures |
| 2 | A town-centre building you would like as the workplace | Parcel depot building and work mini-game |
| 2 | The shop you actually use, outside and inside | Shop look and goods |
| 3 | Landmarks: Administration, House of Culture, mosque, college, bridges | Unique buildings instead of generic boxes |
| 3 | Your car, chickens and cats, including their names | Models, colours, personal touches |
| 3 | The landscape: Tanalyk river, hills and steppe in each season | Colours, plants, possible seasons |

## Decisions only you can make

- Should real shop names appear on signs? They are generic for now, because real brands usually need permission.

## Optional art and sound

Only needed for a more polished look. Use files you made yourself or with a licence that allows publishing, such as CC0.

| Type | What | Format |
| --- | --- | --- |
| Textures | Grass, road, wall, roof and other surfaces, seamless | PNG, 64×64 or larger |
| 3D models | Car, taxi, plane, chicken, cat, people | `.glb`, low-poly, under about 5,000 triangles each |
| Animal sounds | Chicken clucks, cat meows and purring | `.ogg` or `.mp3` |
| Vehicle sounds | Engine idle and revving, door, horn | `.ogg` or `.mp3`, loopable engine |
| Ambience | Wind, birds, village at night, footsteps by surface | `.ogg` or `.mp3` |
| Music | Calm background music, ideally with kurai (the Bashkir flute) | `.ogg` or `.mp3`, with the rights to publish |

## Maps

Nothing is needed for Akyar: the OpenStreetMap data is already built in, and the ground is deliberately flat. OpenStreetMap has footprints but little detail on house shapes, so your photos fill that gap.

Flights use one shared airport, street and hotel for every country, so they need no maps. The country list is in `js/game.js`. Giving a country its real map later would need its own map download. Corrections to Akyar's map can be made on openstreetmap.org and baked into the game.
