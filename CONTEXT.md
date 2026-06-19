# Dragon Knight

A 2D top-down action dungeon crawler RPG built in Phaser 3. Movement is keyboard-driven (8-way); combat is mouse-aimed melee that strikes in any direction, independent of movement. This document is the shared glossary for the project — it defines domain terms, not implementation details.

## World

**Dungeon**:
One self-contained explorable area with a boundary, composed of connected Rooms. The MVP is a single Dungeon.

**Room**:
A contiguous explorable space within a Dungeon, potentially larger than the viewport. The camera scrolls to follow the player within a Room. Rooms are the unit the player travels *between*. Only one Room is active at a time.
_Avoid_: Screen (a Room may span several screens), Level (reserved for the whole Dungeon if needed).

**Door**:
A transition point that connects two Rooms. Crossing a Door deactivates the current Room and activates the target Room, placing the player at a named spawn point.
_Avoid_: Exit, Portal, Gate (a Gate may later mean a *locked* Door specifically).

## Entities

**Player**:
The single character controlled by the user — a knight. Moves with the keyboard and aims a sword toward the mouse cursor (aim is independent of movement direction). Has health measured in Hearts.
_Avoid_: Hero, Character, Knight (use "Player" in code; "knight" is flavour only).

**Aim**:
The direction the Player's sword strikes, set continuously by the mouse cursor and independent of movement. Free 360°, not snapped to compass directions.
_Avoid_: Facing (movement and aim are separate; there is no single "facing").

**Enemy**:
A hostile entity that damages the Player. Most Enemies deal damage on contact; at least one has a telegraphed attack (a visible wind-up before striking).
_Avoid_: Monster, Mob, NPC (an NPC would be a *non-hostile* entity, a separate concept).

**Heart**:
The unit of the Player's health. Hearts are discrete and support half-Heart granularity. The Player dies when Hearts reach zero.
_Avoid_: HP, Life, Hitpoints (the Player's health is always counted in Hearts).

**Telegraph**:
The visible wind-up an Enemy plays before executing an attack, giving the Player a window to react. A defining genre feel, not just an animation.
_Avoid_: Wind-up, Tell, Charge.

## Progression & Interaction

**Key**:
An item the Player picks up that opens a locked Door. The core progression gate of the MVP Dungeon.
_Avoid_: Pass, Token.

**Switch**:
A floor trigger that changes the Dungeon when activated — e.g. opens a Door or path. Activated by the Player standing on it or by a Block pushed onto it.
_Avoid_: Button, Plate, Lever (a Lever would be a separate hand-operated variant).

**Block**:
A pushable object used in puzzles, typically shoved onto a Switch. Moves in grid-aligned steps for predictability.
_Avoid_: Boulder, Crate, Box.

**Treasure**:
The goal reward in the Dungeon's final Room. Reaching it completes the MVP Dungeon (the win state). Stands in for a boss in the MVP.
_Avoid_: Loot, Chest, Reward (a Chest would be the *container*; the Treasure is the goal itself).
