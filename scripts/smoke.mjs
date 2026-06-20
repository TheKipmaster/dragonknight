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
