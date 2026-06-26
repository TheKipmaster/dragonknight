# Dragon Knight

A 2D top-down action dungeon crawler RPG, built with **Phaser 3 + TypeScript + Vite**. Keyboard movement, mouse-aimed melee. Arcade (AABB) physics.

**▶ Play it: <https://dragon-knight.netlify.app>**

## Getting started

```bash
npm install
npm run dev        # dev server with hot reload → http://localhost:5173
```

**Controls:** WASD / arrows to move · mouse to aim · Space or left-click to attack (hold to chain the 3-beat combo).

## Scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                        |
| `npm run build`     | Type-check (`tsc --noEmit`) + production bundle |
| `npm run typecheck` | Type-check only                                 |
| `npm run preview`   | Serve the production build                      |
| `npm run smoke`     | **Headless verification** — see below           |

## Testing: the smoke harness

`npm run build` only proves the code _type-checks and bundles_. It can't catch a runtime crash (a bad Phaser call in a scene's `create()`, a null body, …) or tell you whether anything actually _works_.

`npm run smoke` ([`scripts/smoke.mjs`](./scripts/smoke.mjs)) closes that gap. It:

1. Builds the game (with test handles enabled — see below).
2. Boots it in **headless Chromium** via Playwright.
3. Fails on any `console.error` or uncaught exception.
4. Screenshots the canvas to `tmp/smoke/boot.png` (gitignored — readable for visual checks).
5. Runs **behavioural assertions** against the live game — e.g. spawn a `Walker` and confirm a hit drops its HP.

**Prerequisite (one-time):** a Chromium binary for Playwright —

```bash
npx playwright install chromium
```

### How the behavioural assertions reach the game

Bundled modules aren't on `window`, so the test harness can't see `GameState` or the Phaser instance directly. The game therefore exposes two **dev-only handles**, gated on a build flag so a real production build never leaks internals:

```ts
// main.ts — only when VITE_EXPOSE_STATE is set (the `smoke` script sets it)
if (import.meta.env.VITE_EXPOSE_STATE) {
  window.__GAME = game; // reach live scenes/entities: __GAME.scene.getScene('Game')
  window.__STATE = GameState; // the authoritative plain data (Hearts, progress)
}
```

From the test, `page.evaluate(...)` reads/drives the running game through these. To add an assertion, reach in via `__GAME`/`__STATE`, optionally drive input with `page.keyboard` / `page.mouse`, then assert on state. See the backlog in [`docs/ROADMAP.md`](./docs/ROADMAP.md) for assertions worth adding next.

## Project docs

- [`CONTEXT.md`](./CONTEXT.md) — the domain glossary (Dungeon, Room, Player, Switch, …)
- [`docs/adr/`](./docs/adr) — architecture decision records (why things are the way they are)
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — MVP goal, status, and backlog

## Source layout

Organised by domain area, mirroring the glossary and ADRs:

```
src/
├── main.ts          Phaser game config + boot
├── config/          tuning constants (TILE, SWORD, ENEMY, SPAWNER, PLAYER)
├── scenes/          Boot, Preload, Game, UI
├── world/           Room (lifecycle), Switch
├── entities/        Player, Walker, PracticeDummy
├── components/      Health, Knockback, AIController  (composition-lite, ADR 0002)
├── combat/          Attack data + Damageable/ContactAttacker chokepoint
└── state/           GameState (source of truth), event bus
```
