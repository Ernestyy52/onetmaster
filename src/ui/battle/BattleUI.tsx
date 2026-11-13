import { ACTION_INFO, canUse, ENEMIES, INTENT_INFO, type PlayerAction } from '../../shared/combat';
import { ITEMS, SUBJECTS } from '../../shared/data/catalog';
import type { Stimulus } from '../../shared/types';
import { useGame } from '../../state/store';
import { act, answer, dismissExplanation, fleeBattle, leaveBattle, requestHint } from '../actions';
import { Bar, Icon } from '../components/common';

const ACTIONS: PlayerAction[] = ['attack', 'defend', 'pierce', 'shield', 'potion'];
const LETTERS = ['ก', 'ข', 'ค', 'ง'];

export function BattleUI() {
  const run = useGame((s) => s.run);
  if (!run) return null;
  const enemy = ENEMIES[run.enemyId];
  const s = run.state;
  return (
    <>
      <div className="enemy-bar panel" data-testid="enemy-bar">
        <div className="enemy-name">
          <strong>{enemy.name}</strong>
          {enemy.kind === 'boss' && <span className="tag boss">บอส</span>}
          <span className="muted small">เทิร์น {s.turn}</span>
        </div>
        <Bar value={s.enemyHp} max={s.enemyMaxHp} color="#ff7b54" label="พลังชีวิตศัตรู" />
        <div className="intent" data-testid="intent">
          <span className="intent-label">เจตนา:</span> <strong>{INTENT_INFO[s.intent].label}</strong>
          <span className="muted"> — {INTENT_INFO[s.intent].hint}</span>
          {s.enemyShield && !s.weakPoint && <span className="tag shield">โล่</span>}
          {s.weakPoint && <span className="tag weak">จุดอ่อนเปิด</span>}
        </div>
      </div>
      <aside className="battle-panel panel" data-testid="battle-panel">
        <BattleBody />
      </aside>
    </>
  );
}

function BattleBody() {
  const run = useGame((s) => s.run)!;
  const busy = useGame((s) => s.busy);
  if (run.result) return <Result />;
  if (run.lastAnswer) return <Explanation />;
  if (run.turn && run.state.phase === 'question') return <QuestionCard />;
  if (run.state.phase === 'command') return <Commands />;
  return <p className="muted">{busy ? '…' : ''}</p>;
}

function StimulusView({ s }: { s: Stimulus }) {
  if (s.kind === 'table')
    return (
      <div className="stimulus table-wrap">
        <table>
          <caption>{s.caption}</caption>
          <thead><tr>{s.headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{s.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
  return (
    <div className="stimulus note">
      <div className="note-title">{s.title}</div>
      {s.lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

function QuestionHeader() {
  const turn = useGame((s) => s.run!.turn)!;
  const q = turn.question;
  const subj = SUBJECTS[q.subject];
  return (
    <div className="q-head">
      <span className="subject-chip" style={{ background: subj.color }}><Icon name={subj.icon} size={18} /> {subj.nameTh}</span>
      {turn.isReview && <span className="tag">ทบทวน</span>}
      {q.review_status !== 'published' && <span className="tag draft" title="โจทย์ต้นแบบ รอครูตรวจก่อนใช้จริง">ร่าง · รอครูตรวจ</span>}
    </div>
  );
}

function QuestionCard() {
  const run = useGame((s) => s.run)!;
  const busy = useGame((s) => s.busy);
  const turn = run.turn!;
  const q = turn.question;
  return (
    <div className="question" data-testid="question-card">
      <p className="q-intro">{run.state.enemyShield ? 'ศัตรูตั้งโล่! ตอบให้ถูกเพื่อรับแต้มพลังไว้เจาะเกราะ' : 'ตอบให้ถูกเพื่อรับแต้มพลัง'}</p>
      <QuestionHeader />
      <p className="q-stem" data-testid="question-stem">{q.stem}</p>
      {q.stimulus && <StimulusView s={q.stimulus} />}
      <div className="options" role="group" aria-label="ตัวเลือก">
        {q.options.map((o, i) => {
          const out = turn.eliminated.includes(o.id);
          return (
            <button key={o.id} className="btn option" disabled={busy || out} onClick={() => void answer(o.id)} data-option={o.id} aria-keyshortcuts={String(i + 1)}>
              <span className="opt-letter">{LETTERS[i]}</span>
              <span className={out ? 'struck' : ''}>{o.text}</span>
            </button>
          );
        })}
      </div>
      <button className="btn hint-btn" disabled={busy || turn.hintsLeft <= 0 || turn.eliminated.length > 0} onClick={() => void requestHint()}>
        💡 สกิลช่วยคิด: ตัดตัวเลือกผิด 1 ข้อ (เหลือ {turn.hintsLeft})
      </button>
    </div>
  );
}

function Explanation() {
  const run = useGame((s) => s.run)!;
  const a = run.lastAnswer!;
  const q = run.turn?.question;
  return (
    <div className="question" data-testid="explanation">
      {q && <QuestionHeader />}
      {q && <p className="q-stem">{q.stem}</p>}
      {q && (
        <div className="options">
          {q.options.map((o, i) => (
            <div key={o.id} className={`option result ${o.id === a.correctOptionId ? 'correct' : o.id === a.chosenOptionId ? 'wrong' : ''}`}>
              <span className="opt-letter">{LETTERS[i]}</span><span>{o.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className={`verdict ${a.correct ? 'ok' : 'no'}`} data-testid="verdict">
        {a.correct ? '✓ ถูกต้อง! ได้แต้มพลัง +1' : '✗ ยังไม่ถูก — ไม่เป็นไร ใช้ป้องกันพื้นฐานได้'}
      </div>
      {!a.correct && a.rationale && <p className="rationale">ตัวเลือกที่เลือก: {a.rationale}</p>}
      <p className="explain"><strong>วิธีคิด:</strong> {a.explanation}</p>
      {!a.correct && <p className="muted small">บันทึกทักษะนี้ไว้ในสมุดทักษะแล้ว โจทย์ถัดไปจะให้ลองเรื่องเดิมในสถานการณ์ใหม่</p>}
      <button className="btn primary wide-btn" onClick={dismissExplanation} data-testid="btn-continue" autoFocus>ไปต่อ <kbd>Enter</kbd></button>
    </div>
  );
}

function Commands() {
  const run = useGame((s) => s.run)!;
  const busy = useGame((s) => s.busy);
  const potions = useGame((s) => s.progression?.inventory.find((i) => i.itemId === 'focus_potion')?.qty ?? 0);
  const s = run.state;
  const tip =
    s.intent === 'beam' ? 'ศัตรูจะยิงลำแสงแรง — “ตั้งโล่” หรือ “ป้องกัน” จะช่วยได้'
      : s.weakPoint ? 'จุดอ่อนเปิดอยู่ — “โจมตี” ตอนนี้แรง 2 เท่า!'
        : s.enemyShield && s.focus > 0 ? 'มีโล่อยู่ — ใช้ “เจาะเกราะ” เพื่อเปิดจุดอ่อน'
          : s.enemyShield ? 'มีโล่อยู่ โจมตีปกติจะแรงน้อยลง' : 'เลือกคำสั่ง';
  return (
    <div className="commands" data-testid="commands">
      <p className="tip">{tip}</p>
      <div className="skill-grid">
        {ACTIONS.map((a) => {
          const info = ACTION_INFO[a];
          const ok = !busy && canUse(s, a, potions);
          return (
            <button key={a} className={`btn skill ${a}`} disabled={!ok} onClick={() => void act(a)} data-action={a} aria-keyshortcuts={info.key} title={info.desc}>
              <span className="skill-name">{info.label}{a === 'potion' ? ` ×${potions}` : ''}</span>
              <span className="skill-meta">{info.cost ? `ใช้พลัง ${info.cost}` : a === 'potion' ? 'ฟื้น 25' : 'ฟรี'}</span>
              <kbd>{info.key}</kbd>
            </button>
          );
        })}
      </div>
      <button className="btn ghost small" onClick={() => void fleeBattle()} disabled={busy}>หนีกลับลานกลาง</button>
    </div>
  );
}

function Result() {
  const r = useGame((s) => s.run!.result)!;
  const won = r.outcome === 'won';
  const leveled = r.rewards.levelAfter > r.rewards.levelBefore;
  return (
    <div className="result" data-testid="battle-result">
      <h2 className={won ? 'win' : 'lose'}>{won ? 'ชนะแล้ว!' : 'พ่ายแพ้…'}</h2>
      {leveled && <div className="levelup" data-testid="levelup">เลเวลอัป! Lv.{r.rewards.levelBefore} → Lv.{r.rewards.levelAfter}</div>}
      <div className="reward-xp">+{r.rewards.xp} XP</div>
      {r.rewards.items.length > 0 && (
        <ul className="reward-items">
          {r.rewards.items.map((it, i) => <li key={i}><Icon name={ITEMS[it.itemId].icon} size={28} /> ได้รับ {ITEMS[it.itemId].name} ×{it.qty}</li>)}
        </ul>
      )}
      {!won && <p className="muted">XP จากโจทย์ที่ตอบถูกยังได้รับอยู่ ลองดูบทสอนแล้วกลับมาใหม่</p>}
      <button className="btn primary wide-btn" onClick={() => void leaveBattle()} data-testid="btn-leave" autoFocus>กลับลานกลาง <kbd>Enter</kbd></button>
    </div>
  );
}
