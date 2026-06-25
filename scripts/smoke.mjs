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
    // Isolate the behavioural assertions from the entrance's narrative trigger.
    // The 'intro' Tripwire fires when the player crosses its band — and enemies
    // (the map's, or ones a test spawns) can shove the player into it via
    // knockback, firing the intro Dialogue and pausing Game mid-run. Suppress it
    // for the whole run (mark its once-guard fired so it can't fire again), close
    // it if it already fired during boot, resume, and clear the entrance enemies.
    // The Tripwire assertion below deliberately re-arms 'intro' to drive it once.
    await page.evaluate(() => {
      const game = window.__GAME;
      const scene = game.scene.getScene('Game');
      const intro = scene.tripwireRuntimes.find((rt) => rt.triggerName === 'intro');
      if (intro) window.__STATE.progress.tripwiresFired.add(intro.fireId);
      const box = game.scene.getScene('UI').dialogueBox;
      let guard = 30;
      while (box.isActive && guard-- > 0) box.advance();
      if (game.scene.isPaused('Game')) game.scene.resume('Game');
      scene.hostiles.clear(true, true);
    });
    await page.waitForTimeout(80); // let any resume apply before asserting

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
    // Drives the real path on the map-authored 'intro' Tripwire in `entrance`:
    // edge detection → registry dispatch → central once-guard → the handler. The
    // 'intro' handler both wakes the Room's dormant Enemies and opens the intro
    // Dialogue, so a fresh Walker forced dormant lets us assert the wake without
    // depending on the map Enemies' state. (This used to target a dedicated
    // 'aggro' Tripwire; that wake is now folded into 'intro'.)
    const tw = await page.evaluate(() => {
      const scene = window.__GAME.scene.getScene('Game');
      const rt = scene.tripwireRuntimes.find((r) => r.triggerName === 'intro');
      if (!rt) return { error: 'no intro Tripwire built from the map' };

      // Re-arm: the start-of-run block suppressed 'intro', and boot knockback may
      // have crossed its band. Clear the edge and un-fire its once-guard so the
      // drive below is a clean, first-ever crossing.
      rt.reset();
      window.__STATE.progress.tripwiresFired.delete(rt.fireId);

      scene.spawnWalker();
      const w = scene.hostiles.getChildren().at(-1);
      w.ai.change('inactive');
      const before = w.ai.state;

      const firedBefore = window.__STATE.progress.tripwiresFired.size;
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

    // Firing 'intro' opened a Dialogue (queued a pause). Close it, resume, and
    // re-suppress 'intro' so the remaining assertions run unpaused.
    await page.waitForTimeout(60);
    await page.evaluate(() => {
      const game = window.__GAME;
      const box = game.scene.getScene('UI').dialogueBox;
      let guard = 30;
      while (box.isActive && guard-- > 0) box.advance();
      const rt = game.scene.getScene('Game').tripwireRuntimes.find((r) => r.triggerName === 'intro');
      if (rt) window.__STATE.progress.tripwiresFired.add(rt.fireId);
    });
    await page.waitForTimeout(60); // let the queued resume apply

    if (tw.error) {
      errors.push(tw.error);
    } else if (tw.before !== 'inactive') {
      errors.push(`Tripwire test Walker should start dormant, was '${tw.before}'`);
    } else if (tw.after !== 'chase') {
      errors.push(`'intro' Tripwire should wake the Walker into 'chase', got '${tw.after}'`);
    } else if (tw.firedAfter !== tw.firedBefore + 1) {
      errors.push(`once Tripwire should record exactly one fire (${tw.firedBefore}→${tw.firedAfter})`);
    } else {
      console.log("behaviour OK — 'intro' Tripwire woke a dormant Walker once and stayed fired");
    }

    // ── Behavioural assertion: a Gauntlet runs its Waves to completion (ADR 0011) ─
    // Drives the real Gauntlet lifecycle on a 2-Wave clear-mode recipe: lazy
    // start → telegraph → pop (deterministic counts) → clear-advance → complete.
    // Big time jumps clear every telegraph/breather deadline so each update steps
    // one phase; clearing `hostiles` between Waves kills the live Wave so clear-
    // mode advances. Asserts each Wave spawns its exact count and onComplete fires.
    const g = await page.evaluate(() => {
      const scene = window.__GAME.scene.getScene('Game');
      const room = scene.manager.room;

      let completed = false;
      const recipe = {
        advance: 'clear',
        waves: [
          [{ kind: 'walker', count: 2 }],
          [{ kind: 'walker', count: 1 }],
        ],
      };
      // Anchor on the Player (open floor, where they spawned) so the ring finds
      // wall-free points for the deterministic counts.
      const gauntlet = new window.__Gauntlet(
        scene,
        room,
        scene.player.x,
        scene.player.y,
        recipe,
        (kind, x, y) => scene.spawnEnemy(kind, x, y, true),
        () => {
          completed = true;
        },
      );

      const baseline = scene.hostiles.getChildren().length;
      let t = 1e6;
      const step = () => {
        t += 1e6;
        gauntlet.update(t);
      };
      const liveAboveBaseline = () => scene.hostiles.getChildren().length - baseline;

      step(); // breather(nextAt=0) → telegraph Wave 0
      step(); // telegraph elapsed → pop Wave 0
      const wave0 = liveAboveBaseline();

      scene.hostiles.clear(true, true); // kill the live Wave → clear-mode advances
      step(); // fighting: cleared → breather
      step(); // breather → telegraph Wave 1
      step(); // telegraph elapsed → pop Wave 1
      const wave1 = scene.hostiles.getChildren().length; // group was emptied above

      scene.hostiles.clear(true, true); // kill the final Wave
      step(); // fighting: cleared + no more Waves → complete

      return { wave0, wave1, completed };
    });

    if (g.wave0 !== 2) {
      errors.push(`Gauntlet Wave 1 should spawn 2 Walkers, got ${g.wave0}`);
    } else if (g.wave1 !== 1) {
      errors.push(`Gauntlet Wave 2 should spawn 1 Walker, got ${g.wave1}`);
    } else if (!g.completed) {
      errors.push('Gauntlet should fire onComplete after its last Wave is cleared');
    } else {
      console.log('behaviour OK — Gauntlet ran 2 Waves (2→1) and completed on clear');
    }

    // ── Behavioural assertion: Dialogue pauses Game, advances, and resumes ────
    // Drives the real cross-scene ADR 0014 path end to end: playDialogue →
    // DialogueStart → Game pauses *itself* + the UI box shows → advance through
    // the lines → DialogueEnd → Game resumes + the playDialogue promise resolves.
    // Phaser applies scene.pause()/resume() on the *next* step, not synchronously,
    // so we tick the loop (waitForTimeout) between observing pause and resume.
    const dlgStart = await page.evaluate(() => {
      const game = window.__GAME;
      const box = game.scene.getScene('UI').dialogueBox;
      if (!box) return { error: 'UIScene.dialogueBox not present' };
      const script = [
        { speaker: 'narrator', text: 'A test line.' },
        { speaker: 'player', text: 'And another.' },
      ];
      const pausedBefore = game.scene.isPaused('Game');
      window.__dlgDone = window.__playDialogue(script); // queues the pause
      return { pausedBefore, activeOnStart: box.isActive }; // box shows synchronously
    });

    await page.waitForTimeout(80); // let Phaser apply the queued pause

    const dlgMid = await page.evaluate(() => {
      const game = window.__GAME;
      const box = game.scene.getScene('UI').dialogueBox;
      const pausedDuring = game.scene.isPaused('Game');
      // Drain it: each advance() either completes a still-typing line or steps to
      // the next; the loop ends the Dialogue regardless of typewriter timing.
      let guard = 30;
      while (box.isActive && guard-- > 0) box.advance(); // last advance queues resume
      return { pausedDuring, activeAfter: box.isActive };
    });

    await page.waitForTimeout(80); // let Phaser apply the queued resume

    const dlgEnd = await page.evaluate(async () => {
      const game = window.__GAME;
      await window.__dlgDone; // resolves on DialogueEnd
      return { pausedAfter: game.scene.isPaused('Game') };
    });

    if (dlgStart.error) {
      errors.push(dlgStart.error);
    } else if (dlgStart.pausedBefore) {
      errors.push('Game should not be paused before a Dialogue starts');
    } else if (!dlgStart.activeOnStart || !dlgMid.pausedDuring) {
      errors.push(
        `Dialogue start should show the box and pause Game (active=${dlgStart.activeOnStart}, paused=${dlgMid.pausedDuring})`,
      );
    } else if (dlgMid.activeAfter) {
      errors.push('Dialogue box should hide after its last line is advanced past');
    } else if (dlgEnd.pausedAfter) {
      errors.push('Game should resume after a Dialogue ends');
    } else {
      console.log('behaviour OK — Dialogue paused Game, advanced its lines, and resumed on end');
    }

    // ── Behavioural assertion: a Monologue floats, never pauses, self-expires ──
    // The Monologue's defining contract (ADR 0014) is the *opposite* of Dialogue:
    // player.monologue() shows a transient world-space label, does NOT pause Game,
    // is NOT the Dialogue box, and fades itself away on a timer.
    const mono = await page.evaluate(() => {
      const game = window.__GAME;
      const scene = game.scene.getScene('Game');
      const box = game.scene.getScene('UI').dialogueBox;
      const label = scene.player.monologue('test bark');
      window.__mono = label; // keep a handle to check it self-destructs
      return {
        text: label.text,
        aliveAtStart: label.active,
        pausedAfter: game.scene.isPaused('Game'), // a Monologue must NOT pause
        boxActive: box.isActive, // …and is NOT the Dialogue box
      };
    });

    // Force the rise/fade tween to its end rather than waiting out MONOLOGUE.lifeMs
    // (a feel knob the user tunes): completing it must run onComplete → destroy.
    await page.evaluate(() => {
      const tw = window.__GAME.scene.getScene('Game').tweens.getTweensOf(window.__mono)[0];
      if (tw) tw.complete();
    });
    await page.waitForTimeout(60); // let the completion settle

    const monoGone = await page.evaluate(() => {
      const l = window.__mono;
      return { destroyed: !l.active || !l.scene }; // destroy() drops active + scene
    });

    if (mono.text !== 'test bark' || !mono.aliveAtStart) {
      errors.push(`Monologue should create a live label with its text (got "${mono.text}", alive=${mono.aliveAtStart})`);
    } else if (mono.pausedAfter) {
      errors.push('Monologue must NOT pause Game (unlike a Dialogue)');
    } else if (mono.boxActive) {
      errors.push('Monologue must not be the Dialogue box');
    } else if (!monoGone.destroyed) {
      errors.push('Monologue should fade and self-destruct after its lifetime');
    } else {
      console.log('behaviour OK — Monologue floated without pausing and self-expired');
    }

    // ── Behavioural assertion: collecting a Key barks a Monologue (ADR 0014) ───
    // Proves the *trigger wiring*, not just the mechanism: drive the real onPickup
    // with a real Key and assert it both banks the Key and fires the Player's
    // contextual Monologue. (Guards against the trigger silently going missing.)
    const pick = await page.evaluate(() => {
      const scene = window.__GAME.scene.getScene('Game');
      const keysBefore = window.__STATE.progress.keysHeld;
      const key = new window.__Key(scene, scene.player.x, scene.player.y, 'smoke#key');
      scene.onPickup(scene.player, key); // the real pickup handler
      const bark = scene.player.activeMonologue;
      return {
        keysDelta: window.__STATE.progress.keysHeld - keysBefore,
        barked: !!bark,
        barkText: bark ? bark.text : null,
      };
    });

    if (pick.keysDelta !== 1) {
      errors.push(`Key pickup should bank one Key, got delta ${pick.keysDelta}`);
    } else if (!pick.barked) {
      errors.push('Key pickup should fire a Monologue bark (the trigger is missing)');
    } else if (!/key/i.test(pick.barkText)) {
      errors.push(`Key pickup bark should mention the key, got "${pick.barkText}"`);
    } else {
      console.log('behaviour OK — collecting a Key banked it and barked a Monologue');
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
