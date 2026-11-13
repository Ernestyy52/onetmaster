import { useState } from 'react';
import type { Appearance } from '../shared/types';
import { useGame } from '../state/store';
import { createProfile, startOrContinue } from './actions';
import { Icon, Portrait } from './components/common';
import { SUBJECT_ORDER, SUBJECTS } from '../shared/data/catalog';

export function TitleScreen() {
  const p = useGame((s) => s.progression);
  const hasSave = !!p?.profile;
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
          {hasSave ? `เล่นต่อ · ${p!.profile!.nickname} Lv.${p!.level}` : 'เริ่มผจญภัย'}
        </button>
        <p className="muted small">ต้นแบบ · บันทึกในเครื่องนี้ · โจทย์ทั้งหมดเป็นฉบับร่างรอครูตรวจ</p>
      </div>
    </div>
  );
}

export function CreateScreen() {
  const [name, setName] = useState('');
  const [look, setLook] = useState<Appearance>('swordsman');
  const busy = useGame((s) => s.busy);
  const valid = name.trim().length > 0;
  return (
    <div className="screen create-screen">
      <form
        className="title-card panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void createProfile(name, look);
        }}
      >
        <h1 className="h-sm">สร้างตัวละคร</h1>
        <label className="field">
          <span>ชื่อเล่น (แสดงในเกม ไม่ต้องใช้ชื่อจริง)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="เช่น ต้นกล้า" autoFocus data-testid="input-nickname" />
        </label>
        <fieldset className="looks">
          <legend>เลือกรูปลักษณ์</legend>
          {(['swordsman', 'mage'] as Appearance[]).map((a) => (
            <label key={a} className={`look ${look === a ? 'sel' : ''}`}>
              <input type="radio" name="look" value={a} checked={look === a} onChange={() => setLook(a)} />
              <Portrait appearance={a} size={72} />
              <span>{a === 'swordsman' ? 'นักดาบฝึกหัด' : 'นักเวทฝึกหัด'}</span>
            </label>
          ))}
        </fieldset>
        <p className="muted small">รอบต้นแบบ ทั้งสองแบบมีความสามารถเท่ากัน ต่างกันที่รูปลักษณ์</p>
        <button type="submit" className="btn primary big" disabled={!valid || busy} data-testid="btn-create">เข้าสู่โถงใหญ่</button>
      </form>
    </div>
  );
}
