/**
 * Headless smoke test for the game.
 *
 * Builds are checked by `npm run build` (types + bundling). This goes further:
 * it actually *runs* the game in headless Chromium, so it catches runtime
 * crashes that type-checking can't — a bad Phaser call in a scene's create(),
 * a null body, etc. It fails (exit 1) on any console error or uncaught
 * exception, and always writes a screenshot you (or the agent) can look at.
 *
 * Usage:  npm run smoke        (builds first, then runs this)
 * Prereq: a Chromium binary — run once:  npx playwright install chromium
 */
import { preview } from 'vite';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('tmp/smoke');
const SHOT = path.join(OUT_DIR, 'boot.png');
const BOOT_WAIT_MS = 1500; // let Boot → Preload → Game/UI run and render a frame

await mkdir(OUT_DIR, { recursive: true });

const errors = [];
let server;
let browser;

try {
  server = await preview({ preview: { host: '127.0.0.1', port: 4173 } });
  const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:4173/';

  browser = await chromium.launch({
    // --no-sandbox is required inside containers; swiftshader gives software
    // WebGL so Phaser renders even with no GPU (it would fall back to Canvas
    // otherwise, but we'd rather screenshot the real WebGL path).
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(BOOT_WAIT_MS);
  await page.screenshot({ path: SHOT });
  console.log(`screenshot → ${SHOT}`);

  // ── Behavioural assertion: a hit drops a Walker's HP ──────────────────────
  // Exercises the real damage path on a live Walker (spawn → Walker.hit →
  // Health.takeDamage), end to end in the running game — not just that it booted.
  const exposed = await page.evaluate(() => typeof window.__GAME);
  if (exposed !== 'object') {
    errors.push('window.__GAME not exposed — was the build run with VITE_EXPOSE_STATE=1?');
  } else {
    const before = await page.evaluate(() => {
      const scene = window.__GAME.scene.getScene('Game');
      scene.spawnWalker(); // drive the real spawner
      const walkers = scene.hostiles.getChildren();
      const walker = walkers[walkers.length - 1];
      window.__testWalker = walker;
      return walker ? { count: walkers.length, hp: walker.health.current } : null;
    });

    if (!before || before.count < 1) {
      errors.push('expected a Walker to spawn via the spawner');
    } else {
      const DMG = 3;
      const hpAfter = await page.evaluate((dmg) => {
        const w = window.__testWalker;
        w.hit({ damage: dmg, knockback: 0, fromX: w.x + 10, fromY: w.y });
        return w.health.current;
      }, DMG);

      if (hpAfter !== before.hp - DMG) {
        errors.push(`Walker HP: expected ${before.hp - DMG} after a ${DMG} hit, got ${hpAfter}`);
      } else {
        console.log(`behaviour OK — Walker HP ${before.hp} → ${hpAfter} after a ${DMG} hit`);
      }
    }

    // ── Behavioural assertion: a Trap bites the Player but kills an Enemy ──────
    // Drives the real Trap path (addTrap → Trap.springOn → victim-aware Attack →
    // hit) for both victim categories (ADR 0008), plus the armed gating and the
    // persistence record — all without authoring a map object.
    const trap = await page.evaluate(() => {
      const scene = window.__GAME.scene.getScene('Game');
      const cfg = { playerDamage: 4, enemyDamage: 999, lethal: true, rearmMs: 999999, knockback: 0 };

      // Start the Player from full with no active i-frames so the bite lands.
      window.__STATE.player.halfHearts = window.__STATE.player.maxHalfHearts;
      scene.player.invulnerableUntil = 0;

      // (1) Player profile: a survivable bite drops playerDamage half-Hearts.
      scene.addTrap(0, 0, cfg, 'smoke#player');
      const trapP = scene.traps[scene.traps.length - 1];
      const heartsBefore = window.__STATE.player.halfHearts;
      trapP.springOn(scene.player, 'player');
      const heartsAfter = window.__STATE.player.halfHearts;

      // (2) Enemy profile: lethal kills a full-HP Walker; the now-disarmed Trap
      //     leaves a second Walker untouched (enemies have no i-frames, so any
      //     "no damage" is the Trap's own armed gating, not invulnerability).
      scene.spawnWalker();
      const w1 = scene.hostiles.getChildren().at(-1);
      scene.addTrap(w1.x, w1.y, cfg, 'smoke#enemy');
      const trapE = scene.traps[scene.traps.length - 1];
      trapE.springOn(w1, 'enemy');
      const w1hp = w1.health.current;

      scene.spawnWalker();
      const w2 = scene.hostiles.getChildren().at(-1);
      trapE.springOn(w2, 'enemy'); // already sprung → disarmed → no-op
      return {
        heartsBefore, heartsAfter, w1hp,
        w2hp: w2.health.current, w2max: w2.health.max,
        persisted: window.__STATE.progress.trapsSprung.has('smoke#player'),
      };
    });

    if (trap.heartsAfter !== trap.heartsBefore - 4) {
      errors.push(`Trap player bite: expected ${trap.heartsBefore - 4} half-Hearts, got ${trap.heartsAfter}`);
    } else if (trap.w1hp !== 0) {
      errors.push(`Trap should kill a Walker (HP 0), got ${trap.w1hp}`);
    } else if (trap.w2hp !== trap.w2max) {
      errors.push(`Disarmed Trap should not re-hit (expected ${trap.w2max} HP), got ${trap.w2hp}`);
    } else if (!trap.persisted) {
      errors.push('Trap spring should be recorded in progress.trapsSprung');
    } else {
      console.log(
        `behaviour OK — Trap bit Player ${trap.heartsBefore}→${trap.heartsAfter} half-Hearts, ` +
          `killed a Walker, and gated the re-hit`,
      );
    }

    // ── Behavioural assertion: a Tripwire fires its handler once (ADR 0010) ───
    // Drives the real path on the map-authored 'aggro' Tripwire in `entrance`:
    // edge detection → registry dispatch → central once-guard → the 'aggro'
    // handler waking a dormant Enemy. Uses a fresh Walker we force dormant so the
    // result doesn't depend on the map Enemies' aggro state during boot.
    const tw = await page.evaluate(() => {
      const scene = window.__GAME.scene.getScene('Game');
      const runtimes = scene.tripwireRuntimes;
      if (!runtimes || runtimes.length < 1) return { error: 'no Tripwire built from the map' };

      scene.spawnWalker();
      const w = scene.hostiles.getChildren().at(-1);
      w.ai.change('inactive');
      const before = w.ai.state;

      const firedBefore = window.__STATE.progress.tripwiresFired.size;
      const rt = runtimes[0];
      rt.notifyOverlap(); // enter the zone → outside→inside edge → fire
      rt.update();
      const after = w.ai.state;

      // Leave (a frame with no overlap) then re-enter: a once Tripwire is a
      // guarded no-op the second time — it must not throw or re-grow the set.
      rt.update();
      rt.notifyOverlap();
      rt.update();

      return { before, after, firedBefore, firedAfter: window.__STATE.progress.tripwiresFired.size };
    });

    if (tw.error) {
      errors.push(tw.error);
    } else if (tw.before !== 'inactive') {
      errors.push(`Tripwire test Walker should start dormant, was '${tw.before}'`);
    } else if (tw.after !== 'chase') {
      errors.push(`'aggro' Tripwire should wake the Walker into 'chase', got '${tw.after}'`);
    } else if (tw.firedAfter !== tw.firedBefore + 1) {
      errors.push(`once Tripwire should record exactly one fire (${tw.firedBefore}→${tw.firedAfter})`);
    } else {
      console.log("behaviour OK — 'aggro' Tripwire woke a dormant Walker once and stayed fired");
    }
  }
} catch (err) {
  if (/Executable doesn't exist|playwright install/i.test(String(err?.message))) {
    console.error(
      "\nNo Chromium binary found. Install it once with:\n  npx playwright install chromium\n",
    );
  }
  errors.push(`fatal: ${err?.message ?? err}`);
} finally {
  await browser?.close();
  if (server) {
    if (typeof server.close === 'function') await server.close();
    else await new Promise((res) => server.httpServer.close(res));
  }
}

if (errors.length) {
  console.error(`\nSMOKE FAILED (${errors.length}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('\nSMOKE OK — game booted, canvas rendered, no runtime errors.');
