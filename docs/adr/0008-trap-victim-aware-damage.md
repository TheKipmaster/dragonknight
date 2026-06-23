# 0008 — Traps: victim-aware damage through the one chokepoint

## Status

accepted

## Decision

A **Trap** (CONTEXT.md) is a hidden floor hazard that springs when any entity steps on it. Unlike every other damage source in the game, a single Trap must hit _different victim categories for different amounts_: a survivable bite to the Player (e.g. `4` half-Hearts = 2 Hearts) but a kill on an ordinary Enemy (a Walker has ~10 HP). We keep ADR 0002's invariant — damage is still produced as an `Attack` data bundle and applied only in the target's `hit()` — but the Trap, as the damage _source_, produces a **different `Attack` per victim category**. Discrimination is done by **physics-overlap wiring, not by type introspection**: the scene registers two overlaps against the Trap zones (`player × traps` and `enemies × traps`), and each callback, already knowing its victim's category, springs the same Trap object with that category's number. "Lethal to Enemies" is the default, modelled as a **config flag** (`lethal: true`) — not an authored `Infinity`, which a Tiled float can't hold and which would be a surprising literal in the data.

## Considered options

- **Symmetric damage + frail enemies (rejected).** Make the Trap deal one flat number and rely on Enemies being low-HP. Can't satisfy the requirement: any flat value that kills a 10-HP Walker takes the Player far past 2 Hearts. The asymmetry is essential, not incidental.
- **A `faction`/`team` concept on entities (rejected for the MVP).** The Trap reads the victim's faction and looks up damage. The "correct" general answer, but it introduces a whole cross-cutting concept (factions, friendly fire) to serve one feature. Deferred behind the same line as LoS-aggro and the Switch-split: add it if a second victim-aware mechanic appears.
- **Per-victim `Attack` via overlap-wiring (chosen).** Reuses the seam that already exists — the Player and the Enemy group are already separate physics bodies wired with separate overlaps. The Trap stays ignorant of concrete types; the wiring supplies the category for free. This is consistent with how damage was _already_ victim-specific by construction: the sword's `comboDamage` is in Enemy HP because it only ever hits Enemies; Enemy `contactDamage` is in half-Hearts because it only ever hits the Player. The Trap is simply the first source that hits both, so the first that must carry both numbers.

## Consequences

A future reader will see a damage source that deals `4` to one thing and kills another and wonder if it's a bug — it isn't; the asymmetry is the whole point of a Trap, and the two numbers live in its config (`playerDamage` half-Hearts, `enemyDamage` HP used only when `lethal: false`), overridable per-Trap via Tiled custom properties. Because discrimination is wiring, **the Trap must not be handed a single mixed target group**; keep the Player and Enemy overlaps separate or the category is lost. If a third victim-aware mechanic shows up, that is the signal to revisit the rejected `faction` concept — the two-overlap wiring is the seam it would replace. Traps still respect i-frames like every other source (a lethal Trap whiffs on a victim mid i-frame); this is deliberate, not a gap (ADR 0002's single-application-point holds).
