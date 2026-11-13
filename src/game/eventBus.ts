// Typed event bus between Phaser (world) and React (UI). No iframe, same page.
import type { CombatEvent, CombatState } from '../shared/combat';
import type { SubjectId } from '../shared/types';

export type InteractTarget =
  | { kind: 'npc'; id: 'owl'; label: string }
  | { kind: 'board'; id: 'quest_board'; label: string }
  | { kind: 'door'; id: string; subject: SubjectId; label: string }
  | { kind: 'enemy'; id: string; enemyId: string; label: string };

export interface GameEvents {
  /** Phaser → React: player is close enough to interact (or null) */
  'hub:nearby': InteractTarget | null;
  /** Phaser → React: player chose to interact (Enter / tap / arrived after click) */
  'hub:interact': InteractTarget;
  /** Phaser → React: hub finished loading */
  'hub:ready': undefined;
  /** React → Phaser: story/progression changed (doors, boss visibility, NPC markers) */
  'world:refresh': undefined;
  /** React → Phaser: interact with whatever is nearby (Enter key / action button) */
  'input:interact': undefined;
  /** React → Phaser: enter / leave battle */
  'battle:enter': { enemyId: string; sourceId: string | null };
  'battle:exit': { won: boolean };
  /** React → Phaser: animate these combat events, then update to `state` */
  'battle:fx': { events: CombatEvent[]; state: CombatState };
  /** React → Phaser: sync shield/weak-point visuals without animation (e.g. after resume) */
  'battle:state': CombatState;
  /** Phaser → React: finished playing a `battle:fx` batch */
  'battle:fx-done': undefined;
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(event: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(event: K, ...payload: E[K] extends undefined ? [] : [E[K]]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<E[K]>)(payload[0] as E[K]);
  }

  clear() {
    this.handlers.clear();
  }
}

export const bus = new EventBus<GameEvents>();
