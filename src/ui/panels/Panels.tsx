import { useState } from 'react';
import { ITEMS, SUBJECT_ORDER, SUBJECTS } from '../../shared/data/catalog';
import { ACTIVE_SKILLS, FIRST_JOBS, JOBS } from '../../shared/data/jobs';
import { canChangeJob, canEquipFor, jobLevelBar } from '../../shared/jobs';
import { combatStats, MASTERY_LABEL } from '../../shared/progression';
import { QUEST_ORDER, QUESTS } from '../../shared/story';
import type { EquipSlot, QuestStatus } from '../../shared/types';
import { useGame } from '../../state/store';
import { ONLINE } from '../../api';
import { acceptFromBoard, changeJob, equip, openCharacterSelect, openDoor, resetSave, roomBlurb, roomStatus, signOutOnline } from '../actions';
import { Bar, Icon, Modal } from '../components/common';

const SLOT_LABEL: Record<EquipSlot, string> = { weapon: 'อาวุธ', armor: 'ชุด', shoes: 'รองเท้า', charm: 'เครื่องราง' };

export function Panels() {
  const panel = useGame((s) => s.panel);
  switch (panel) {
    case 'inventory': return <Inventory />;
    case 'skills': return <SkillBook />;
    case 'jobs': return <JobsPanel />;
    case 'rooms': return <RoomMenu />;
    case 'room': return <RoomPanel />;
    case 'lesson': return <LessonPanel />;
    case 'board': return <QuestBoard />;
    case 'menu': return <MenuPanel />;
    default: return null;
  }
}

const close = () => useGame.getState().set({ panel: null, roomSubject: null });

function Inventory() {
  const p = useGame((s) => s.progression)!;
  const [sel, setSel] = useState<string | null>(p.inventory[0]?.instanceId ?? null);
  const stats = combatStats(p);
  const equippedIds = new Set(Object.values(p.equipment));
  const selected = p.inventory.find((i) => i.instanceId === sel);
  const def = selected ? ITEMS[selected.itemId] : null;
  return (
    <div className="side-panel panel" role="dialog" aria-label="กระเป๋า" data-testid="inventory">
      <header className="modal-head"><h2><Icon name="bag" size={24} /> กระเป๋า</h2><button className="btn icon-btn" onClick={close} aria-label="ปิด">✕</button></header>
      <div className="inv-stats">
        <span>HP {p.maxHp}</span><span>ATK {stats.atk}</span><span>DEF {stats.def}</span>
      </div>
      <div className="slots">
        {(Object.keys(SLOT_LABEL) as EquipSlot[]).map((slot) => {
          const inst = p.inventory.find((i) => i.instanceId === p.equipment[slot]);
          return (
            <div key={slot} className="slot">
              <span className="slot-label">{SLOT_LABEL[slot]}</span>
              {inst ? <Icon name={ITEMS[inst.itemId].icon} size={28} title={ITEMS[inst.itemId].name} /> : <span className="slot-empty">—</span>}
            </div>
          );
        })}
      </div>
      <div className="inv-grid">
        {p.inventory.map((it) => (
          <button key={it.instanceId} className={`inv-cell ${sel === it.instanceId ? 'sel' : ''}`} onClick={() => setSel(it.instanceId)} aria-label={ITEMS[it.itemId].name} data-testid={`item-${it.itemId}`}>
            <Icon name={ITEMS[it.itemId].icon} size={32} />
            {it.qty > 1 && <span className="qty">{it.qty}</span>}
            {equippedIds.has(it.instanceId) && <span className="eq">E</span>}
          </button>
        ))}
      </div>
      {def && selected && (
        <div className="item-detail">
          <strong>{def.name}</strong>
          <p>{def.description}</p>
          <p className="muted">
            {def.atk ? `ATK +${def.atk} ` : ''}{def.def ? `DEF +${def.def} ` : ''}{def.heal ? `ฟื้น HP ${def.heal}` : ''}
            {def.kind === 'badge' ? 'ตราภารกิจ' : ''}
          </p>
          {def.jobs && <p className="muted small">ใช้ได้เฉพาะ: {def.jobs.map((j) => JOBS[j].name).join(', ')}</p>}
          {def.kind === 'equipment' && (
            equippedIds.has(selected.instanceId)
              ? <span className="tag">สวมใส่อยู่</span>
              : canEquipFor(def, p.job)
                ? <button className="btn primary" onClick={() => void equip(selected.instanceId)} data-testid="btn-equip">สวมใส่</button>
                : <span className="tag">{JOBS[p.job].name}ใช้ไม่ได้</span>
          )}
        </div>
      )}
    </div>
  );
}

function JobsPanel() {
  const p = useGame((s) => s.progression)!;
  const busy = useGame((s) => s.busy);
  const bar = jobLevelBar(p);
  const cur = JOBS[p.job];
  const stats = combatStats(p);
  return (
    <Modal title={<><Icon name="badge" size={24} /> อาชีพ</>} onClose={close} wide testId="jobs-panel">
      <section className="job-current" data-testid="job-current">
        <h3><Icon name={cur.icon} size={22} /> {cur.name} <span className="muted small">· {cur.role}</span></h3>
        <div className="stat-row">
          <span className="stat-label">Job Lv.{bar.level}</span>
          {bar.max ? <span className="muted small">เลเวลสูงสุดของอาชีพนี้</span> : <><Bar value={bar.into} max={bar.needed} color="#7cc4ff" label="Job XP" height={6} /><span className="stat-num">{bar.into}/{bar.needed}</span></>}
        </div>
        <p className="muted small">HP {stats.maxHp} · ATK {stats.atk} · DEF {stats.def} · แต้มพลังสูงสุด {stats.maxFocus}</p>
        <p className="muted small">Job Level ได้จากการชนะการต่อสู้ แยกจาก Adventure Level และไม่มีผลต่อการวัดความชำนาญรายวิชา</p>
      </section>
      <ul className="job-list">
        {FIRST_JOBS.map((id) => {
          const j = JOBS[id];
          const sk = j.active ? ACTIVE_SKILLS[j.active] : null;
          const check = canChangeJob(p, id);
          const lv = p.jobs[id]?.level;
          return (
            <li key={id} className={`job-card ${p.job === id ? 'sel' : ''}`} data-testid={`job-${id}`}>
              <div className="job-head"><Icon name={j.icon} size={28} /><strong>{j.name}</strong><span className="tag">{j.role}</span>{lv ? <span className="muted small">Job Lv.{lv}</span> : null}</div>
              <p className="small">{j.desc}</p>
              {sk && <p className="small"><strong>สกิล:</strong> {sk.name} <kbd>{sk.key}</kbd> — {sk.desc}</p>}
              {j.passive && <p className="small"><strong>ติดตัว:</strong> {j.passive.name} — {j.passive.desc}</p>}
              {p.job === id ? (
                <span className="tag ok">อาชีพปัจจุบัน</span>
              ) : (
                <button className="btn primary" disabled={busy || !check.ok} onClick={() => void changeJob(id)} data-testid={`btn-job-${id}`}>
                  {check.ok ? `เปลี่ยนเป็น${j.name}` : check.reason}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function SkillBook() {
  const p = useGame((s) => s.progression)!;
  const entries = Object.values(p.mastery);
  return (
    <Modal title={<><Icon name="skillbook" size={24} /> สมุดทักษะ</>} onClose={close} wide testId="skillbook">
      <p className="muted">ความชำนาญแยกจาก XP ตัวละคร: ฝึกอยู่ → ทำได้ด้วยคำใบ้ → ทำได้ด้วยตนเอง (ตอบถูกโดยไม่ใช้คำใบ้ในโจทย์ต่างรูปแบบอย่างน้อย 2 แบบ)</p>
      {entries.length === 0 && <p>ยังไม่มีบันทึก ลองต่อสู้และตอบโจทย์ดูก่อน</p>}
      {SUBJECT_ORDER.map((s) => {
        const list = entries.filter((e) => e.subject === s);
        if (!list.length) return null;
        return (
          <section key={s} className="mastery-sec">
            <h3 style={{ color: SUBJECTS[s].color }}><Icon name={SUBJECTS[s].icon} size={22} /> {SUBJECTS[s].nameTh}</h3>
            <ul className="mastery-list">
              {list.map((m) => (
                <li key={m.skill_id}>
                  <span>{SKILL_NAMES[m.skill_id] ?? m.skill_id}</span>
                  <span className={`mastery-tag ${m.level}`}>{MASTERY_LABEL[m.level]}</span>
                  <span className="muted">ถูก {m.correct}/{m.attempts}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Modal>
  );
}

const SKILL_NAMES: Record<string, string> = {
  'math.fraction_of_quantity': 'เศษส่วนของจำนวน', 'math.fraction_compare': 'เปรียบเทียบเศษส่วน', 'math.fraction_add': 'บวกเศษส่วน',
  'math.ratio': 'อัตราส่วน', 'math.measurement': 'การวัด/ความยาวรอบรูป', 'math.percent': 'ร้อยละ',
  'thai.evidence': 'หาหลักฐานจากข้อความ', 'thai.vocabulary': 'ความหมายคำ', 'thai.grammar': 'ลักษณนาม', 'thai.spelling': 'การสะกดคำ',
  'thai.inference': 'อ่านแล้วสรุป', 'thai.main_idea': 'ใจความสำคัญ',
  'english.sign_reading': 'Reading signs', 'english.dialogue': 'Dialogue', 'english.vocabulary': 'Vocabulary', 'english.directions': 'Directions', 'english.grammar': 'Grammar',
  'science.variables': 'ตัวแปรการทดลอง', 'science.data_reading': 'อ่านตารางผลทดลอง', 'science.matter': 'การเปลี่ยนสถานะ', 'science.ecosystem': 'ห่วงโซ่อาหาร', 'science.light': 'แสงและวัตถุ',
};

function RoomMenu() {
  return (
    <Modal title="เลือกห้องวิชา" onClose={close} wide testId="room-menu">
      <div className="room-grid">
        {SUBJECT_ORDER.map((s) => {
          const open = roomStatus(s) === 'open';
          return (
            <button key={s} className="room-card" style={{ borderColor: SUBJECTS[s].color }} onClick={() => { close(); void openDoor(s); }}>
              <Icon name={SUBJECTS[s].icon} size={36} />
              <strong>{SUBJECTS[s].nameTh}</strong>
              <span>{SUBJECTS[s].roomName}</span>
              <span className={`tag ${open ? 'ok' : ''}`}>{open ? 'เปิดแล้ว' : 'ยังปิดอยู่'}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function RoomPanel() {
  const subject = useGame((s) => s.roomSubject) ?? 'math';
  const info = SUBJECTS[subject];
  const open = roomStatus(subject) === 'open';
  const set = useGame((s) => s.set);
  return (
    <Modal title={<><Icon name={info.icon} size={26} /> {info.nameTh} · {info.roomName}</>} onClose={close} wide testId="room-panel">
      <p>{roomBlurb[subject]}</p>
      {!open && <p className="notice">ห้องนี้ยังปิดอยู่ในต้นแบบ {subject === 'math' ? '— ทำภารกิจ “ปลุกประตูโรงกลจักร” ให้สำเร็จก่อน' : '— จะเปิดในรุ่นทดลองครบสี่วิชา'}</p>}
      <div className="room-points">
        <button className="room-point" disabled={subject !== 'math'} onClick={() => set({ panel: 'lesson' })}>
          <strong>แท่นเรียนรู้</strong><span>บทสอน 60–90 วินาทีพร้อมตัวอย่าง</span>
        </button>
        <button className="room-point" disabled>
          <strong>ประตูภารกิจ</strong><span>ด่าน 5–8 นาที · รุ่นถัดไป</span>
        </button>
        <button className="room-point" onClick={() => set({ panel: 'skills' })}>
          <strong>สมุดทักษะ</strong><span>ดูทักษะที่ฝึกแล้ว</span>
        </button>
      </div>
    </Modal>
  );
}

function LessonPanel() {
  const [shown, setShown] = useState(false);
  return (
    <Modal title="แท่นเรียนรู้ · เศษส่วนของจำนวน" onClose={close} wide testId="lesson">
      <ol className="lesson-steps">
        <li><strong>แบ่งเท่า ๆ กัน</strong> — ตัวส่วนบอกว่าแบ่งทั้งหมดเป็นกี่ส่วน: 3/8 ของ 24 → แบ่ง 24 เป็น 8 ส่วน ได้ส่วนละ 24 ÷ 8 = 3</li>
        <li><strong>นับส่วนที่ต้องการ</strong> — ตัวเศษบอกว่าเอากี่ส่วน: 3 ส่วน = 3 × 3 = 9</li>
        <li><strong>อ่านโจทย์ให้ดี</strong> — ถามส่วนที่ “ใช้ไป” หรือ “เหลือ”? ถ้าถามส่วนที่เหลือ ต้องลบออก: 24 − 9 = 15</li>
      </ol>
      <div className="lesson-example panel-inset">
        <p><strong>ลองคิด:</strong> เฟืองมี 30 ซี่ หัก 2/5 ไป เหลือกี่ซี่?</p>
        {shown ? <p>30 ÷ 5 = 6 → หักไป 2 × 6 = 12 ซี่ → เหลือ 30 − 12 = <strong>18 ซี่</strong></p> : <button className="btn" onClick={() => setShown(true)}>ดูวิธีคิด</button>}
      </div>
      <button className="btn primary wide-btn" onClick={close}>เข้าใจแล้ว</button>
    </Modal>
  );
}

const STATUS_LABEL: Record<QuestStatus, string> = { locked: 'ล็อก', available: 'รับได้', active: 'กำลังทำ', ready: 'ส่งได้', done: 'สำเร็จ' };

function QuestBoard() {
  const story = useGame((s) => s.progression!.story);
  return (
    <Modal title={<><Icon name="quest" size={24} /> กระดานภารกิจ</>} onClose={close} wide testId="quest-board">
      <ul className="quest-list">
        {QUEST_ORDER.map((id) => {
          const q = QUESTS[id];
          const st = story.quests[id];
          return (
            <li key={id} className={`quest-item ${st}`}>
              <div>
                <strong>{q.title}</strong> <span className={`tag ${st === 'done' ? 'ok' : ''}`}>{STATUS_LABEL[st]}</span>
                <p className="muted">{st === 'locked' ? 'ทำภารกิจก่อนหน้าให้สำเร็จก่อน' : q.summary}</p>
                <p className="muted small">รางวัล: {q.reward.xp} XP{q.reward.items.length ? ` · ${q.reward.items.map((i) => ITEMS[i.itemId].name).join(', ')}` : ''}</p>
              </div>
              {st === 'available' && id !== 'q_meet_owl' && (
                <button className="btn primary" onClick={() => { close(); void acceptFromBoard(id); }}>รับภารกิจ</button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small">ภารกิจจากครู (รหัสห้องเรียน) จะเปิดเมื่อเชื่อมต่อบัญชีออนไลน์ในรุ่นถัดไป</p>
    </Modal>
  );
}

function MenuPanel() {
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title="เมนู" onClose={close} testId="menu">
      <p className="muted">{ONLINE ? 'บัญชีออนไลน์ — ความคืบหน้าบันทึกบนเซิร์ฟเวอร์ เล่นต่อจากเครื่องอื่นได้' : 'โหมดออฟไลน์ — ความคืบหน้าบันทึกในเครื่องนี้เท่านั้น'}</p>
      <h3>การควบคุม</h3>
      <ul className="controls-list">
        <li>เดิน: WASD / ลูกศร · คลิกหรือแตะพื้น · จอยซ้ายล่าง (จอสัมผัส)</li>
        <li>โต้ตอบ: Enter หรือปุ่มขวาล่าง · กระเป๋า: Tab · สมุดทักษะ: K · เลือกห้อง: M</li>
        <li>ต่อสู้: Q โจมตี · W ป้องกัน · E เจาะเกราะ · R ตั้งโล่ · F ยา · T สกิลอาชีพ · 1–4 เลือกคำตอบ</li>
        <li>อาชีพ: J หรือแตะป้ายอาชีพใต้ชื่อ</li>
      </ul>
      <button className="btn" onClick={() => void openCharacterSelect()} data-testid="btn-switch-character">เปลี่ยนตัวละคร</button>
      {ONLINE ? (
        <button className="btn" onClick={() => void signOutOnline()} data-testid="btn-sign-out">ออกจากระบบ</button>
      ) : confirm ? (
        <div className="row">
          <button className="btn danger" onClick={() => void resetSave()}>ยืนยันลบข้อมูลทั้งหมด</button>
          <button className="btn" onClick={() => setConfirm(false)}>ยกเลิก</button>
        </div>
      ) : (
        <button className="btn" onClick={() => setConfirm(true)}>ลบเซฟทั้งหมด (ทุกตัวละคร)</button>
      )}
    </Modal>
  );
}
