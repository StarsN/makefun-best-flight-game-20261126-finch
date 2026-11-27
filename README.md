[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/StarsN/makefun-best-flight-game-20261126-finch/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/StarsN/makefun-best-flight-game-20261126-finch/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

# Kestrel Ridge

A 3D valley flight game for the make.fun *best flight game* bounty, built
with three.js and flown entirely from static files — no build step, no
network. Open `game/index.html` in a desktop browser (or serve `game/`
with any static file server) and fly.

**The sortie.** You sit in the Kestrel, a high-wing single-prop tourer, on
the strip at Kestrel Field. Take off northbound, thread eight glowing
rings around the ridge and over the lake, then come home and land on the
runway before the fuel runs out. Dead-centre rings pay a bonus; the clock,
the fuel gauge and the hull all have opinions about how you fly.

**In the cockpit**

- Procedural low-poly terrain: a flat valley, ridged snow-capped
  mountains, a lake in the north-east bowl, ~900 instanced pines.
- An honest arcade flight model: banks turn the aircraft, slow flight
  stalls and sinks, gear state matters, landings are judged.
- Working instruments: airspeed and attitude gauges, a compass strip,
  altitude / speed / heading readouts, throttle, fuel and hull bars, and
  a steering marker that tracks the next ring.
- Synthesised WebAudio sound — engine, wind, ring chimes — no audio files.

**Controls**

| Keys | Action |
| --- | --- |
| W / S or ↑ / ↓ | pitch |
| A / D or ← / → | bank and turn |
| Shift / F | throttle up / down (mouse wheel trims) |
| Q / E | rudder |
| G | landing gear |
| Space | brakes / airbrake |
| mouse drag | steer gently |

**Layout**

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to
  the output directory and writes `dossier.json` with the kit's
  `vendor/makefun-game.ts`.
- `game/` — the game itself: `index.html`, `style.css`, the vendored
  `vendor/three.min.js`, and one module per job under `game/js/`
  (`terrain`, `world`, `aircraft`, `flightModel`, `missions`, `hud`,
  `input`, `audio`, `noise`, `main`).
- `screenshots/` — four real renders of the game running in Chrome.

**Run the hand-in locally**

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT licensed — see `LICENSE`.
