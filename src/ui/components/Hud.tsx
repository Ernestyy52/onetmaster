import { useRef, useState } from 'react';
import { bus } from '../../game/eventBus';
import { JOBS } from '../../shared/data/jobs';
import { jobLevelBar } from '../../shared/jobs';
import { combatStats } from '../../shared/progression';
import { levelProgress } from '../../shared/progression';
import { activeQuest, nextAvailableQuest, prologueComplete, QUESTS } from '../../shared/story';
import { useGame } from '../../state/store';
import { Bar, Icon, Portrait } from './common';

export function Hud({ battle = false }: { battle?: boolean }) {
  const p = useGame((s) => s.progression);
  const run = useGame((s) => s.run);
  if (!p?.profile) return null;
  const lp = levelProgress(p.xp);
  const hp = battle && run ? run.state.playerHp : p.hp;
  const maxHp = battle && run ? run.state.playerMaxHp : p.maxHp;
  const focus = battle && run ? run.state.focus : 0;
  const maxFocus = battle && run ? run.state.maxFocus : combatStats(p).maxFocus;
  const jb = jobLevelBar(p);
  const set = useGame.getState().set;
  return (
    <div className="hud-tl">
      <div className="hud-card panel" data-testid="hud">
        <Portrait appearance={p.profile.appearance} size={52} />
        <div className="hud-stats">
          <div className="hud-name">
            <strong>{p.profile.nickname}</strong>
            <span className="lv" data-testid="hud-level">Lv.{p.level}</span>
          </div>
          <button
            type="button"
            className="job-chip"
            onClick={() => !battle && set({ panel: 'jobs' })}
            disabled={battle}
            aria-label={`อาชีพ ${JOBS[p.job].name} Job Level ${jb.level} — แตะเพื่อดูอาชีพ`}
            data-testid="hud-job"
          >
            <Icon name={JOBS[p.job].icon} size={16} /> {JOBS[p.job].name} · Job Lv.{jb.level}
          </button>
          <div className="stat-row"><span className="stat-label">HP</span><Bar value={hp} max={maxHp} color="#ff5d7a" label="พลังชีวิต" /><span className="stat-num">{hp}/{maxHp}</span></div>
          <div className="stat-row">
            <span className="stat-label">พลัง</span>
            <span className="pips" aria-label={`แต้มพลัง ${focus} จาก ${maxFocus}`}>
              {Array.from({ length: maxFocus }, (_, i) => <span key={i} className={`pip ${i < focus ? 'on' : ''}`} />)}
            </span>
          </div>
          <div className="stat-row"><span className="stat-label">XP</span><Bar value={lp.into} max={lp.needed} color="#ffd23f" label="ค่าประสบการณ์" height={6} /><span className="stat-num" data-testid="hud-xp">{lp.into}/{lp.needed}</span></div>
        </div>
      </div>
      {!battle && <QuestTracker />}
    </div>
  );
}

function QuestTracker() {
  const story = useGame((s) => s.progression?.story);
  if (!story) return null;
  const q = activeQuest(story);
  const next = nextAvailableQuest(story);
  const done = prologueComplete(story);
  return (
    <div className="quest-tracker panel" data-testid="quest-tracker">
      <div className="qt-head"><Icon name="quest" size={20} /> <span>บทนำ · คืนที่ตราแตก</span></div>
      {q ? (
        <>
          <div className="qt-title">{q.title}{story.quests[q.id] === 'ready' ? ' ✓' : ''}</div>
          <div className="qt-sum">{story.quests[q.id] === 'ready' ? 'ไปแตะประตูโรงกลจักรเพื่อส่งภารกิจ' : q.summary}</div>
        </>
      ) : next ? (
        <>
          <div className="qt-title">{next.id === 'q_meet_owl' ? QUESTS.q_meet_owl.title : 'มีภารกิจใหม่'}</div>
          <div className="qt-sum">{next.id === 'q_meet_owl' ? next.summary : `คุยกับอาจารย์ฮูกหรือดูกระดานภารกิจ: “${next.title}”`}</div>
        </>
      ) : done ? (
        <div className="qt-sum">บทนำสำเร็จ! ฝึกต่อกับหมอกลืมเลือนเพื่อเก็บ XP</div>
      ) : null}
    </div>
  );
}

export function TopButtons() {
  const set = useGame((s) => s.set);
  return (
    <nav className="hud-tr" aria-label="เมนูเกม">
      <button className="btn hud-btn" aria-label="กระเป๋า" onClick={() => set({ panel: 'inventory' })} aria-keyshortcuts="Tab" data-testid="btn-inventory">
        <Icon name="bag" size={24} /><span className="lbl">กระเป๋า</span><kbd>Tab</kbd>
      </button>
      <button className="btn hud-btn" aria-label="สมุดทักษะ" onClick={() => set({ panel: 'skills' })} aria-keyshortcuts="K">
        <Icon name="skillbook" size={24} /><span className="lbl">สมุดทักษะ</span><kbd>K</kbd>
      </button>
      <button className="btn hud-btn" aria-label="เลือกห้อง" onClick={() => set({ panel: 'rooms' })} aria-keyshortcuts="M">
        <Icon name="book" size={24} /><span className="lbl">เลือกห้อง</span><kbd>M</kbd>
      </button>
      <button className="btn hud-btn" onClick={() => set({ panel: 'menu' })} aria-label="เมนู">
        <span className="burger">☰</span>
      </button>
    </nav>
  );
}

export function ActionButton() {
  const nearby = useGame((s) => s.nearby);
  const blocked = useGame((s) => !!(s.dialogue || s.panel || s.rewardPopup));
  if (blocked) return null;
  return (
    <div className="hud-br">
      <button
        className={`btn action-btn ${nearby ? 'ready' : ''}`}
        disabled={!nearby}
        onClick={() => bus.emit('input:interact')}
        data-testid="btn-interact"
        aria-keyshortcuts="Enter"
      >
        <span className="action-label">{nearby ? nearby.label : 'เดินเข้าใกล้เพื่อโต้ตอบ'}</span>
        <kbd>Enter</kbd>
      </button>
    </div>
  );
}

/** Virtual joystick for touch devices (bottom-left). */
export function Joystick() {
  const isTouch = useGame((s) => s.isTouch);
  const blocked = useGame((s) => !!(s.dialogue || s.panel || s.rewardPopup));
  const set = useGame((s) => s.set);
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pid = useRef<number | null>(null);
  if (!isTouch || blocked) return null;
  const R = 44;
  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    set({ joystick: { x: dx / R, y: dy / R } });
  };
  const end = () => {
    pid.current = null;
    setKnob({ x: 0, y: 0 });
    set({ joystick: { x: 0, y: 0 } });
  };
  return (
    <div
      className="joystick"
      ref={base}
      data-testid="joystick"
      onPointerDown={(e) => {
        pid.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => pid.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="จอยควบคุมการเดิน"
      role="application"
    >
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}
