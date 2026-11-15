// Shared store read by both React (hooks) and Phaser (getState / subscribe).
import { create } from 'zustand';
import type { RunView } from '../api/types';
import type { InteractTarget } from '../game/eventBus';
import type { CharacterSummary, Progression, RewardSummary, SubjectId } from '../shared/types';

export type Screen = 'loading' | 'auth' | 'title' | 'select' | 'create' | 'hub' | 'battle';
export type Panel = 'inventory' | 'skills' | 'jobs' | 'rooms' | 'room' | 'lesson' | 'board' | 'menu' | null;

export interface DialogueChoice {
  label: string;
  run: () => void | Promise<void>;
  primary?: boolean;
}

export interface Dialogue {
  speaker: string;
  portrait?: 'owl' | 'board' | 'door' | 'enemy' | 'system';
  lines: string[];
  index: number;
  choices?: DialogueChoice[];
  onDone?: () => void | Promise<void>;
}

export interface RewardPopup {
  title: string;
  rewards: RewardSummary;
  note?: string;
}

export interface Toast {
  id: number;
  text: string;
}

export interface GameStore {
  screen: Screen;
  progression: Progression | null;
  characters: CharacterSummary[];
  /** slot the create screen will fill */
  createSlot: number | null;
  nearby: InteractTarget | null;
  dialogue: Dialogue | null;
  panel: Panel;
  roomSubject: SubjectId | null;
  run: RunView | null;
  /** waiting for API or battle animation */
  busy: boolean;
  rewardPopup: RewardPopup | null;
  toasts: Toast[];
  joystick: { x: number; y: number };
  isTouch: boolean;
  error: string | null;
  worldReady: boolean;
  set: (partial: Partial<GameStore>) => void;
}

export const useGame = create<GameStore>((set) => ({
  screen: 'loading',
  progression: null,
  characters: [],
  createSlot: null,
  nearby: null,
  dialogue: null,
  panel: null,
  roomSubject: null,
  run: null,
  busy: false,
  rewardPopup: null,
  toasts: [],
  joystick: { x: 0, y: 0 },
  isTouch: false,
  error: null,
  worldReady: false,
  set: (partial) => set(partial),
}));

/** True when the world should NOT react to WASD / taps (forms, dialogs, question cards…). */
export function worldInputBlocked(): boolean {
  const s = useGame.getState();
  if (s.screen !== 'hub' || s.dialogue || s.panel || s.rewardPopup || s.busy) return true;
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable))
    return true;
  return false;
}

let toastId = 0;
export function toast(text: string) {
  const id = ++toastId;
  useGame.setState((s) => ({ toasts: [...s.toasts, { id, text }] }));
  setTimeout(() => useGame.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
}
