import { eventBus, GameEvent } from '../state/eventBus';

/**
 * The Dialogue system's data and entry point (CONTEXT.md; ADR 0014).
 *
 * A Dialogue box is a screen-anchored, *always-pausing* presentation layer: a
 * script is an ordered list of `{ speaker, text }` lines, advanced one at a time
 * by a dedicated key. This module owns the script types, the speaker registry,
 * and `playDialogue` — the single way callers (the cutscene director, a
 * conversation Tripwire handler) start a Dialogue. Rendering and input live in
 * the UI scene's `DialogueBox`; this module never touches Phaser.
 *
 * NOT to be confused with a **Monologue** (ADR 0014): the Player's transient,
 * non-pausing self-talk is a separate channel that does not flow through here.
 */

/** A speaker's display identity. The Portrait is optional — the narrator has
 *  none, and real Portraits arrive with the art pass; the box tolerates a
 *  missing one (CONTEXT.md "Portrait keyed by speaker; not every line needs one"). */
export interface Speaker {
  /** Shown above the line; empty string renders no name label (e.g. narrator). */
  readonly name: string;
  /** Texture key for the bust image; undefined → no Portrait shown. */
  readonly portrait?: string;
}

/** The valid speaker ids. Hand-maintained alongside SPEAKERS (kept explicit, not
 *  derived, so `SPEAKERS[id].portrait` types cleanly as `string | undefined`
 *  even for speakers that omit a Portrait). */
export type SpeakerId = 'player' | 'narrator' | 'king';

/** Speaker registry: a line names a `speaker`; the box looks up the name +
 *  Portrait here, so art wires in one place and lines stay terse. Portrait keys
 *  are intentionally absent until the art pass supplies the bust textures. */
export const SPEAKERS: Record<SpeakerId, Speaker> = {
  player: { name: 'Knight' },
  narrator: { name: '' },
  king: { name: 'King' },
};

/** One line: who speaks and what they say. */
export interface DialogueLine {
  readonly speaker: SpeakerId;
  readonly text: string;
}

/** An ordered script the box plays line by line. */
export type DialogueScript = readonly DialogueLine[];

/**
 * Start a Dialogue and resolve once the Player advances past its last line.
 *
 * The single caller-facing entry point: emits `DialogueStart` (the UI box shows
 * and Game pauses itself, ADR 0014) and returns a Promise that resolves on the
 * next `DialogueEnd`. The cutscene director will `await` this for a `say` step;
 * a conversation handler can fire-and-forget or await it too. Assumes one
 * Dialogue at a time (guaranteed in practice — a Dialogue pauses Game, so
 * nothing in-world can start a second).
 */
export function playDialogue(script: DialogueScript): Promise<void> {
  return new Promise((resolve) => {
    const onEnd = () => {
      eventBus.off(GameEvent.DialogueEnd, onEnd);
      resolve();
    };
    eventBus.on(GameEvent.DialogueEnd, onEnd);
    eventBus.emit(GameEvent.DialogueStart, script);
  });
}

/** The entrance's Run-opening conversation, fired once by the map-authored
 *  `intro` Tripwire when the Player first steps into the entrance Room. A plain
 *  modal conversation (no choreography) — the conversation-Tripwire caller path
 *  of ADR 0014, not a Cutscene. A no-name narrator line, the King's charge, the
 *  Player's reply. */
export const INTRO_DIALOGUE: DialogueScript = [
  { speaker: 'narrator', text: 'The dungeon yawns open before you, cold and waiting.' },
  { speaker: 'player', text: "So this is the necromancer's lair..." },
  { speaker: 'narrator', text: 'The sounds of gnawing bone animated by arcane malice are accompanied by the stench of rot.' },
  { speaker: 'player', text: "FOUL BONES!! Tell me where your master keeps his secrets, that I might bring them to light!" },
  { speaker: 'narrator', text: "The Knight's voice rebounds off the cold stone, shaking the room. The skeletons hiss with undying hatred." },
  { speaker: 'player', text: "SO BE IT! Meet your doom!" },
];
