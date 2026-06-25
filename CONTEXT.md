# Dragon Knight

A 2D top-down action dungeon crawler RPG built in Phaser 3. Movement is keyboard-driven (8-way); combat is mouse-aimed melee that strikes in any direction, independent of movement. This document is the shared glossary for the project — it defines domain terms, not implementation details.

## World

**Dungeon**: One self-contained explorable area with a boundary, composed of connected Rooms. The MVP is a single Dungeon.

**Room**: A contiguous explorable space within a Dungeon, potentially larger than the viewport. The camera scrolls to follow the player within a Room. Rooms are the unit the player travels _between_. Only one Room is active at a time. _Avoid_: Screen (a Room may span several screens), Level (reserved for the whole Dungeon if needed).

**Door**: A transition point that connects two Rooms. Crossing a Door deactivates the current Room and activates the target Room, placing the player at a named spawn point. _Avoid_: Exit, Portal, Gate (a Gate may later mean a _locked_ Door specifically).

## Entities

**Player**: The single character controlled by the user — a knight. Moves with the keyboard and aims a sword toward the mouse cursor (aim is independent of movement direction). Has health measured in Hearts. _Avoid_: Hero, Character, Knight (use "Player" in code; "knight" is flavour only).

**Aim**: The direction the Player's sword strikes, set continuously by the mouse cursor and independent of movement. Free 360°, not snapped to compass directions. _Avoid_: Facing (movement and aim are separate; there is no single "facing").

**Enemy**: A hostile entity that damages the Player. Most Enemies deal damage on contact; at least one has a telegraphed attack (a visible wind-up before striking). _Avoid_: Monster, Mob, NPC (an NPC would be a _non-hostile_ entity, a separate concept).

**Spawner**: A stationary, destroyable entity that periodically conjures Enemies at telegraphed points around itself, and stops for good once its health is destroyed. Hostile-aligned but does not damage the Player itself — its threat is the Enemies it produces, making it a combat objective the Player can shut off at the source. An Enemy subtype in code (the sword hits it) but its own concept: it neither moves nor strikes. _Avoid_: Switch (a Switch's spawn effect is Player-triggered, healthless, and spawns around the _Player_; a Spawner is autonomous, destroyable, and spawns around _itself_), Nest, Totem, Portal, Summoner.

**Heart**: The unit of the Player's health. Hearts are discrete and support half-Heart granularity. The Player dies when Hearts reach zero. _Avoid_: HP, Life, Hitpoints (the Player's health is always counted in Hearts).

**Telegraph**: The visible wind-up shown before a committed action — an Enemy's attack, or a Spawner's incoming spawn points — giving the Player a window to react. A defining genre feel, not just an animation. _Avoid_: Wind-up, Tell, Charge.

**Wave**: A batch of Enemies telegraphed and conjured together as a single unit — its members appear together, never trickled. The _source_ decides how Waves are chosen and sequenced: a Spawner draws its Wave at random from its recipes and repeats on a cadence; a Gauntlet runs a fixed, ordered list of Waves. _Avoid_: Batch, Pack, Group (Group is the Phaser construct in code), Horde.

**Gauntlet**: A scripted, deterministic multi-Wave encounter triggered by a Tripwire (not autonomous like a Spawner, not Player-held like a Switch). It runs a fixed, ordered list of Waves — each Wave the same Enemies every time — advancing to the next only when the current Wave is cleared, or after a set timer. Has no body of its own and cannot be destroyed; it is a sequence the Player fights _through_, ending when the last Wave falls. _Avoid_: Spawner (autonomous, destroyable, random, endless — a Gauntlet is triggered, bodiless, deterministic, finite), Arena, Horde, Onslaught.

## Progression & Interaction

**Key**: An item the Player picks up that opens a locked Door. The core progression gate of the MVP Dungeon. _Avoid_: Pass, Token.

**Switch**: A floor trigger the Player activates by standing on it (or by a Block pushed onto it). Its effect is configurable: open a Door or path, or — while held down — spawn Enemies on a cadence. Changes appearance to show its pressed state. _Avoid_: Button, Pressure Plate, Plate, Lever (a Lever would be a separate hand-operated variant). A Switch may _have_ a spawning effect (Player-triggered, around the Player), but the destroyable autonomous **Spawner** entity is a distinct concept, not a Switch.

**Trap**: A hostile floor hazard that lies hidden until an entity steps onto it, then springs — harming whoever tripped it. Unlike a Switch, it is invisible until sprung, triggered _incidentally_ by any entity that walks over it (Enemies included, opening the option of luring them onto one), and its effect is to harm rather than change the world. Shares only the floor-overlap _mechanism_ with a Switch, not the concept. It strikes instantly on contact — its flash is hit feedback, not a Telegraph; there is no reaction window (you cannot warn about a hazard you couldn't see). It is hidden only until its _first_ spring; thereafter it stays permanently visible and re-arms on a cadence, so brightness reads its state — lit means live, dimmed means spent and safe. The first contact is the only free hit it gets; after that it is a readable timing hazard. Its bite is calibrated to its victim — a painful but survivable wound to the Player, typically lethal to an ordinary Enemy — so luring an Enemy onto one is a clean kill. _Avoid_: Switch (a Switch is a deliberate, visible, world-changing trigger), Telegraph (a Trap gives no wind-up), Spike, Hazard, Mine. The hidden magic-glyph art is flavour, not the term.

**Tripwire**: An invisible map region that runs an authored behaviour when the Player crosses into it — playing a Cutscene, opening Dialogue, springing an ambush, waking Enemies. What it does is not fixed by the concept: each Tripwire carries a name, and the behaviour lives in a code callback keyed by that name, so the map authors _where_ and _when_ while code owns _what_. Most fire once and remember it in progress; some re-fire on every crossing. Has no visible affordance and no pressed state. _Avoid_: Switch (visible, Player-held, world-changing — a Tripwire is invisible and fires on _crossing_, not on standing), Trap (harms whoever steps on it — a Tripwire runs scripted behaviour instead), Door (transitions Rooms; its overlap zone is `DoorTrigger` in code). Note on "trigger": the bare word is the loose _umbrella_ for any overlap-fired region (a Door's zone, a Switch, a Trap, a Tripwire) — it names a mechanism, not a concept; the concept here is the Tripwire.

**Block**: A pushable object used in puzzles, typically shoved onto a Switch. Moves in grid-aligned steps for predictability. _Avoid_: Boulder, Crate, Box.

**Treasure**: The goal reward in the Dungeon's final Room. Reaching it completes the MVP Dungeon (the win state). Stands in for a boss in the MVP. _Avoid_: Loot, Chest, Reward (a Chest would be the _container_; the Treasure is the goal itself).

## Presentation & Atmosphere

**Light source**: A thing that emits a radial gradient of light into a Room. Atmospheric only — it sets mood and never gates what the Player can see (no fog-of-war). Owned either by a static map fixture (a torch) or by an entity (the Player's aura, the glowing Treasure). A Room has an authored ambient darkness level that light sources push back against. _Avoid_: Lamp, Glow, Torch (a torch is one _kind_ of light source, not the concept).

**Dialogue box**: A framed text box at the bottom of the screen showing one speaker's line, with their Portrait. A presentation layer only — it never implies an interactive NPC; the speaker is whoever the script names. Shown either _modal_ (locks the Player and pauses the world — used by Cutscenes and conversations) or _ambient_ (the Player's short in-world line while play continues). Advanced by a dedicated key in both modes. _Avoid_: Textbox, Speech bubble, Message (a speech bubble would float over a speaker in-world; the Dialogue box is anchored to the screen).

**Portrait**: The bust image of a speaker shown beside their Dialogue box, identifying who is talking. Keyed by speaker; not every line needs one. _Avoid_: Avatar, Face, Headshot.

**Cutscene**: A scripted story beat that takes control from the Player and plays out a fixed timeline — modal Dialogue plus camera moves and entity choreography — then hands control back. Plays in-world (over the active Room), fires once, and is skippable. _Avoid_: Cinematic, Scene (a "Scene" is the Phaser runtime unit; a Cutscene is content, not a Scene).

**Actor**: A will-less puppet that exists only to be choreographed within a Cutscene — a sprite the director spawns, moves (by direct authored tween, ignoring walls and physics), makes speak, and despawns. It carries a speaker identity (so it maps to a Portrait) but no AI, no Health, no aggro, and no combat: nothing damages it, and "killing" one is just a despawn with an optional death puff. The Player is also addressable as an Actor (`'player'`) while under director control. _Avoid_: Enemy (an Actor never fights or pathfinds), NPC (the deferred concept of a _freely interactive_ non-hostile entity — an Actor only plays its scripted part), and the engine-generic "Actor = any game object" reading (here it means specifically a Cutscene puppet).

**Title screen**: The game's entry point, shown before the Dungeon — branding plus a "press to start" affordance, and where the win flow returns. Has no Player, Room, or progress; its animated intro is self-contained, not a Cutscene. _Avoid_: Main menu, Start screen, Splash (no multi-option menu in the MVP).

**Game Over screen**: The terminal screen shown when the Player's Hearts reach zero — death **ends the Run** rather than respawning in place. A sibling scene to the Title (no Player, Room, or progress of its own), not a Cutscene: it does not hand control back to gameplay. A press resets the Run and returns to the Title, closing the loop symmetrically with the win flow. _Avoid_: Death screen, Respawn (death no longer respawns the Player in-Dungeon — that interim loop is retired), Cutscene (a Cutscene plays in-world and hands back; a screen is a full takeover that does not).

**Run**: A single playthrough of the Dungeon, from leaving the Title to either victory (reaching the Treasure) or defeat (the Game Over screen) — both of which return to the Title to begin a fresh Run. All Dungeon progress (Keys, opened Doors, fired Tripwires, sprung Traps) is Run-scoped: it resets when a new Run begins. _Avoid_: Session (the app process may span many Runs), Save (there is no persistence — a Run is in-memory only).
