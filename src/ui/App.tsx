import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { bus } from '../game/eventBus';
import { ACTION_INFO, BASIC_ACTIONS, canUse, type PlayerAction } from '../shared/combat';
import { ACTIVE_SKILLS } from '../shared/data/jobs';
import { useGame } from '../state/store';
import { act, advanceDialogue, answer, boot, dismissExplanation, interact, leaveBattle, onHubReady, refreshProgression } from './actions';
import { BattleUI } from './battle/BattleUI';
import { ActionButton, Hud, Joystick, TopButtons } from './components/Hud';
import { DialogueBox, RewardModal, Toasts } from './components/Overlays';
import { Panels } from './panels/Panels';
import { AuthScreen, CreateScreen, SelectScreen, TitleScreen } from './screens';
import { getApi } from '../api';

function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let game: Phaser.Game | null = null;
    let cancelled = false;
    // Phaser is loaded lazily so the title screen appears immediately.
    void import('../game/createGame').then(({ createGame }) => {
      if (cancelled || !ref.current) return;
      game = createGame(ref.current);
      (window as unknown as { __game?: Phaser.Game }).__game = game;
    });
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);
  return <div className="game-canvas" ref={ref} data-testid="game-canvas" />;
}

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useGame.getState();
      if (e.key === 'Escape') {
        if (s.panel) s.set({ panel: null, roomSubject: null });
        else if (s.rewardPopup) s.set({ rewardPopup: null });
        return;
      }
      if (isTyping(e) || e.repeat) return;
      const focusedButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON';

      if (s.screen === 'hub') {
        if (e.key === 'Tab') {
          e.preventDefault();
          s.set({ panel: s.panel === 'inventory' ? null : s.panel ? s.panel : 'inventory' });
          return;
        }
        if (s.rewardPopup) return;
        if (s.dialogue) {
          if ((e.key === 'Enter' || e.key === ' ') && !focusedButton) {
            e.preventDefault();
            advanceDialogue();
          }
          return;
        }
        if (s.panel) return;
        if (e.key === 'Enter' || e.key === ' ') {
          if (focusedButton) return;
          e.preventDefault();
          bus.emit('input:interact');
        } else if (e.key.toLowerCase() === 'k') s.set({ panel: 'skills' });
        else if (e.key.toLowerCase() === 'j') s.set({ panel: 'jobs' });
        else if (e.key.toLowerCase() === 'm') s.set({ panel: 'rooms' });
        return;
      }

      if (s.screen === 'battle' && s.run && !s.busy) {
        const run = s.run;
        if (run.result) {
          if (e.key === 'Enter' && !focusedButton) void leaveBattle();
          return;
        }
        if (run.lastAnswer) {
          if (e.key === 'Enter' && !focusedButton) dismissExplanation();
          return;
        }
        if (run.turn && run.state.phase === 'question') {
          const n = Number(e.key);
          const opt = run.turn.question.options[n - 1];
          if (opt && !run.turn.eliminated.includes(opt.id)) void answer(opt.id);
          return;
        }
        if (run.state.phase === 'command') {
          const potions = s.progression?.inventory.find((i) => i.itemId === 'focus_potion')?.qty ?? 0;
          const keyOf = (a: PlayerAction) => (a in ACTIVE_SKILLS ? ACTIVE_SKILLS[a as keyof typeof ACTIVE_SKILLS].key : ACTION_INFO[a as keyof typeof ACTION_INFO].key);
          const options: PlayerAction[] = [...BASIC_ACTIONS, ...(run.state.skills ?? [])];
          const action = options.find((a) => keyOf(a).toLowerCase() === e.key.toLowerCase());
          if (action && canUse(run.state, action, potions)) void act(action);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const screen = useGame((s) => s.screen);
  const error = useGame((s) => s.error);
  const worldReady = useGame((s) => s.worldReady);
  useKeyboard();

  useEffect(() => {
    const set = useGame.getState().set;
    const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    set({ isTouch: touch });
    const offs = [
      bus.on('hub:nearby', (t) => set({ nearby: t })),
      bus.on('hub:interact', (t) => interact(t)),
      bus.on('hub:ready', () => {
        set({ worldReady: true });
        void refreshProgression().then(() => onHubReady());
      }),
    ];
    void boot();
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('test')) {
      const helpers: Record<string, unknown> = {
        store: useGame,
        get api() {
          return getApi();
        },
        bus,
        answerFor: () => null,
      };
      (window as unknown as Record<string, unknown>).__onet = helpers;
      // Offline-only test helper: correct option for the current question (keys ship with offline
      // builds anyway). Online builds constant-fold this away, so no answer keys reach them.
      if (!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)) {
        void import('../shared/data/questions').then(({ QUESTION_BANK }) => {
          helpers.answerFor = () => {
            const t = useGame.getState().run?.turn;
            return t ? (QUESTION_BANK.find((q) => q.id === t.question.id)?.answer_key ?? null) : null;
          };
        });
      }
    }
    return () => offs.forEach((o) => o());
  }, []);

  const inWorld = screen === 'hub' || screen === 'battle';
  return (
    <div className={`app screen-${screen}`}>
      {inWorld && <GameCanvas />}
      {inWorld && !worldReady && (
        <div className="world-loading" role="status"><div><div className="spinner" />กำลังโหลดโถงใหญ่…</div></div>
      )}
      <div className="ui-layer">
        {screen === 'loading' && <div className="screen"><p>กำลังโหลด…</p></div>}
        {screen === 'auth' && <AuthScreen />}
        {screen === 'title' && <TitleScreen />}
        {screen === 'select' && <SelectScreen />}
        {screen === 'create' && <CreateScreen />}
        {screen === 'hub' && (
          <>
            <Hud />
            <TopButtons />
            <ActionButton />
            <Joystick />
            <DialogueBox />
            <Panels />
          </>
        )}
        {screen === 'battle' && (
          <>
            <Hud battle />
            <BattleUI />
          </>
        )}
        <RewardModal />
        <Toasts />
        {error && <div className="error-banner" role="alert">{error}</div>}
      </div>
    </div>
  );
}
