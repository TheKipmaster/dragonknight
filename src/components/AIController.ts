/**
 * A minimal finite-state machine for enemy AI (ADR 0002 — the AIController
 * component, and the FSM-per-enemy decision). Each enemy registers named states
 * with optional enter/update/exit hooks and transitions between them. Kept
 * deliberately small; richer behaviour (patrol, flee, summon) is just more
 * states.
 */
export interface AIState {
  enter?(): void;
  update?(deltaMs: number): void;
  exit?(): void;
}

export class AIController {
  private readonly states = new Map<string, AIState>();
  private current?: AIState;
  private currentKey = '';

  add(key: string, state: AIState): this {
    this.states.set(key, state);
    return this;
  }

  change(key: string): void {
    if (key === this.currentKey) return;
    this.current?.exit?.();
    this.current = this.states.get(key);
    this.currentKey = key;
    this.current?.enter?.();
  }

  update(deltaMs: number): void {
    this.current?.update?.(deltaMs);
  }

  get state(): string {
    return this.currentKey;
  }
}
