import { ITEMS } from '../../shared/data/catalog';
import { useGame } from '../../state/store';
import { advanceDialogue, choose } from '../actions';
import { Icon, Modal, NpcPortrait } from './common';

export function DialogueBox() {
  const d = useGame((s) => s.dialogue);
  if (!d) return null;
  const last = d.index === d.lines.length - 1;
  return (
    <div className="dialogue panel" role="dialog" aria-live="polite" data-testid="dialogue" onClick={() => !d.choices?.length || !last ? advanceDialogue() : undefined}>
      {d.portrait && <div className="dialogue-portrait"><NpcPortrait kind={d.portrait} size={56} /></div>}
      <div className="dialogue-body">
        <div className="dialogue-speaker">{d.speaker}</div>
        <p className="dialogue-text">{d.lines[d.index]}</p>
        {last && d.choices?.length ? (
          <div className="dialogue-choices">
            {d.choices.map((c, i) => (
              <button
                key={c.label}
                className={`btn ${c.primary ? 'primary' : ''}`}
                data-autofocus={i === 0 || undefined}
                autoFocus={i === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  void choose(c);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : (
          <button className="btn primary dialogue-next" onClick={(e) => { e.stopPropagation(); advanceDialogue(); }} data-testid="dialogue-next">
            {last ? 'ตกลง' : 'ต่อไป'} <kbd>Enter</kbd>
          </button>
        )}
      </div>
    </div>
  );
}

export function RewardModal() {
  const r = useGame((s) => s.rewardPopup);
  const set = useGame((s) => s.set);
  if (!r) return null;
  const leveled = r.rewards.levelAfter > r.rewards.levelBefore;
  return (
    <Modal title={r.title} onClose={() => set({ rewardPopup: null })} testId="reward-modal">
      <div className="reward">
        {leveled && <div className="levelup" data-testid="levelup">เลเวลอัป! Lv.{r.rewards.levelBefore} → Lv.{r.rewards.levelAfter}</div>}
        <div className="reward-xp">+{r.rewards.xp} XP</div>
        {r.rewards.items.length > 0 && (
          <ul className="reward-items">
            {r.rewards.items.map((it, i) => (
              <li key={i}><Icon name={ITEMS[it.itemId].icon} size={28} /> {ITEMS[it.itemId].name} ×{it.qty}</li>
            ))}
          </ul>
        )}
        {r.note && <p className="muted">{r.note}</p>}
        <button className="btn primary wide-btn" data-autofocus onClick={() => set({ rewardPopup: null })}>รับรางวัล</button>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast panel">{t.text}</div>
      ))}
    </div>
  );
}
