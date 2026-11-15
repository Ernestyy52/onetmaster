import { useState } from 'react';
import { MAX_SLOTS } from '../api/saveFormat';
import { JOBS } from '../shared/data/jobs';
import { NICKNAME_MAX, validateNickname } from '../shared/nickname';
import { DEFAULT_APPEARANCE, GENDERS, OUTFITS } from '../shared/appearance';
import type { Appearance, Gender, Outfit } from '../shared/types';
import { useGame } from '../state/store';
import { createCharacter, newCharacter, pickCharacter, startOrContinue } from './actions';
import { Icon, Portrait } from './components/common';
import { SUBJECT_ORDER, SUBJECTS } from '../shared/data/catalog';

export function TitleScreen() {
  const p = useGame((s) => s.progression);
  const characters = useGame((s) => s.characters);
  const set = useGame((s) => s.set);
  const current = p?.profile ? p : null;
  return (
    <div className="screen title-screen">
      <div className="title-card panel">
        <p className="eyebrow">เกม RPG เตรียมสอบ O-NET ป.6</p>
        <h1>หอคอยสี่วิชา</h1>
        <div className="subject-row">
          {SUBJECT_ORDER.map((s) => (
            <span key={s} className="subject-chip" style={{ background: SUBJECTS[s].color }}>
              <Icon name={SUBJECTS[s].icon} size={18} /> {SUBJECTS[s].nameTh}
            </span>
          ))}
        </div>
        <p className="lead">ตราแห่งความรู้ทั้งสี่แตกกระจาย ใช้ความรู้เปิดจุดอ่อนของศัตรู แล้วฟื้นฟูสถาบันนักผจญภัย</p>
        <button className="btn primary big" onClick={() => void startOrContinue()} data-testid="btn-start" autoFocus>
          {current ? `เล่นต่อ · ${current.profile!.nickname} Lv.${current.level}` : characters.length ? 'เลือกตัวละคร' : 'เริ่มผจญภัย'}
        </button>
        {current && (
          <button className="btn" onClick={() => set({ screen: 'select' })} data-testid="btn-characters">
            เปลี่ยน/สร้างตัวละคร
          </button>
        )}
        <p className="muted small">ต้นแบบ · โหมดออฟไลน์ บันทึกในเครื่องนี้ · โจทย์ทั้งหมดเป็นฉบับร่างรอครูตรวจ</p>
      </div>
    </div>
  );
}

export function SelectScreen() {
  const characters = useGame((s) => s.characters);
  const busy = useGame((s) => s.busy);
  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => i + 1);
  return (
    <div className="screen create-screen">
      <div className="title-card panel" data-testid="select-screen">
        <h1 className="h-sm">เลือกตัวละคร</h1>
        <p className="muted small">ความชำนาญรายวิชา (สมุดทักษะ) เป็นของผู้เล่น ใช้ร่วมกันทุกตัวละคร</p>
        <ul className="char-slots">
          {slots.map((slot) => {
            const c = characters.find((x) => x.slot === slot);
            return (
              <li key={slot}>
                {c ? (
                  <button className="btn char-slot" disabled={busy} onClick={() => void pickCharacter(slot)} data-testid={`slot-${slot}`}>
                    <Portrait appearance={c.appearance} size={56} />
                    <span className="char-info">
                      <strong>{c.nickname}</strong>
                      <span className="muted small">Lv.{c.level} · {JOBS[c.job].name} Job Lv.{c.jobLevel}</span>
                    </span>
                  </button>
                ) : (
                  <button className="btn char-slot empty" disabled={busy} onClick={() => newCharacter(slot)} data-testid={`slot-${slot}-new`}>
                    <span className="char-plus" aria-hidden>＋</span>
                    <span className="char-info"><strong>สร้างตัวละครใหม่</strong><span className="muted small">ช่องที่ {slot}</span></span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function CreateScreen() {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [look, setLook] = useState<Appearance>(DEFAULT_APPEARANCE);
  const busy = useGame((s) => s.busy);
  const characters = useGame((s) => s.characters);
  const set = useGame((s) => s.set);
  const check = validateNickname(name, characters.map((c) => c.nickname));
  return (
    <div className="screen create-screen">
      <form
        className="title-card panel"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (check.ok) void createCharacter(check.value, look);
        }}
      >
        <h1 className="h-sm">สร้างตัวละคร</h1>
        <label className="field">
          <span>ชื่อเล่น (แสดงในเกม ไม่ต้องใช้ชื่อจริง)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            maxLength={NICKNAME_MAX + 4}
            placeholder="เช่น ต้นกล้า"
            autoFocus
            aria-invalid={touched && !check.ok}
            aria-describedby="nickname-msg"
            data-testid="input-nickname"
          />
          <span id="nickname-msg" className={`field-msg ${touched && !check.ok ? 'bad' : ''}`} role="status">
            {touched && !check.ok ? check.reason : `2–${NICKNAME_MAX} ตัวอักษร ไทย/อังกฤษ/ตัวเลข`}
          </span>
        </label>
        <fieldset className="looks" data-testid="pick-gender">
          <legend>เพศของตัวละคร</legend>
          {GENDERS.map((g) => (
            <label key={g.id} className={`look ${look.gender === g.id ? 'sel' : ''}`} data-testid={`gender-${g.id}`}>
              <input type="radio" name="gender" value={g.id} checked={look.gender === g.id} onChange={() => setLook({ ...look, gender: g.id as Gender })} />
              <Portrait appearance={{ ...look, gender: g.id }} size={72} />
              <span>{g.label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="looks" data-testid="pick-outfit">
          <legend>ชุด</legend>
          {OUTFITS.map((o) => (
            <label key={o.id} className={`look ${look.outfit === o.id ? 'sel' : ''}`} data-testid={`outfit-${o.id}`}>
              <input type="radio" name="outfit" value={o.id} checked={look.outfit === o.id} onChange={() => setLook({ ...look, outfit: o.id as Outfit })} />
              <Portrait appearance={{ ...look, outfit: o.id }} size={56} />
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
        <div className="create-preview" data-testid="create-preview">
          <Portrait appearance={look} size={96} />
          <div>
            <strong>{check.ok ? check.value : 'ชื่อเล่น'}</strong>
            <div className="muted small">Lv.1 · {JOBS.novice.name}</div>
            <div className="muted small">{GENDERS.find((g) => g.id === look.gender)!.label} · {OUTFITS.find((o) => o.id === look.outfit)!.label}</div>
            <div className="muted small">เพศและชุดไม่มีผลต่อความสามารถ · เลือกอาชีพได้หลังจบบทนำ</div>
          </div>
        </div>
        <button type="submit" className="btn primary big" disabled={!check.ok || busy} data-testid="btn-create">เข้าสู่โถงใหญ่</button>
        {characters.length > 0 && (
          <button type="button" className="btn ghost" onClick={() => set({ screen: 'select' })}>กลับไปเลือกตัวละคร</button>
        )}
      </form>
    </div>
  );
}
