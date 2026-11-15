import { useState } from 'react';
import { freshCharacter, MAX_SLOTS } from '../api/saveFormat';
import { JOBS } from '../shared/data/jobs';
import { NICKNAME_MAX, validateNickname } from '../shared/nickname';
import { BASIC_OUTFIT_LABEL, DEFAULT_APPEARANCE, equipmentLayers, GENDERS } from '../shared/appearance';
import type { Appearance, Gender } from '../shared/types';
import { useGame } from '../state/store';
import { ONLINE } from '../api';
import { boot, createCharacter, newCharacter, pickCharacter, startOrContinue } from './actions';
import { Icon, Portrait } from './components/common';
import { SUBJECT_ORDER, SUBJECTS } from '../shared/data/catalog';
/** What a new character wears (wooden sword + apprentice robe), so the preview matches the game. */
const STARTER_LAYERS = equipmentLayers(freshCharacter(0));

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
        <p className="muted small">ต้นแบบ · {ONLINE ? 'บัญชีออนไลน์ บันทึกบนเซิร์ฟเวอร์' : 'โหมดออฟไลน์ บันทึกในเครื่องนี้'} · โจทย์ทั้งหมดเป็นฉบับร่างรอครูตรวจ</p>
      </div>
    </div>
  );
}

/** Online builds only: sign in or create an account before the title screen. */
export function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const error = useGame((s) => s.error);
  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 8;
  const retry = async () => {
    setBusy(true);
    useGame.getState().set({ error: null });
    try { await boot(); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const auth = await import('../api/auth');
      if (mode === 'in') await auth.signIn(email.trim(), password);
      else if (await auth.signUp(email.trim(), password)) {
        setMsg({ text: 'สร้างบัญชีแล้ว — เปิดอีเมลเพื่อยืนยัน แล้วกลับมาเข้าสู่ระบบ', bad: false });
        setMode('in');
        return;
      }
      await boot();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ', bad: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="screen create-screen">
      <form className="title-card panel" data-testid="auth-screen" onSubmit={(e) => { e.preventDefault(); if (valid) void submit(); }}>
        <h1 className="h-sm">{mode === 'in' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}</h1>
        <p className="muted small">บัญชีใช้บันทึกความคืบหน้าบนเซิร์ฟเวอร์ เล่นต่อจากเครื่องอื่นได้ · ให้ผู้ปกครองหรือครูช่วยตั้งค่า</p>
        <label className="field">
          <span>อีเมล</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-email" autoFocus />
        </label>
        <label className="field">
          <span>รหัสผ่าน (อย่างน้อย 8 ตัว)</span>
          <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-password" />
        </label>
        {(msg || error) && <p className={`field-msg ${msg?.bad || (!msg && error) ? 'bad' : ''}`} role={msg?.bad || (!msg && error) ? 'alert' : 'status'}>{msg?.text ?? error}</p>}
        {error && !msg && <button type="button" className="btn" disabled={busy} onClick={() => void retry()}>ลองเชื่อมต่ออีกครั้ง</button>}
        <button type="submit" className="btn primary big" disabled={!valid || busy} data-testid="btn-auth">{busy ? 'กำลังดำเนินการ…' : mode === 'in' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
          {mode === 'in' ? 'ยังไม่มีบัญชี? สร้างบัญชี' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}
        </button>
      </form>
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
                    <Portrait appearance={c.appearance} layers={c.layers} size={56} />
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
              <input type="radio" name="gender" value={g.id} checked={look.gender === g.id} onChange={() => setLook({ gender: g.id as Gender })} />
              <Portrait appearance={{ gender: g.id }} layers={STARTER_LAYERS} size={72} />
              <span>{g.label}</span>
            </label>
          ))}
        </fieldset>
        <div className="create-preview" data-testid="create-preview">
          <Portrait appearance={look} layers={STARTER_LAYERS} size={96} />
          <div>
            <strong>{check.ok ? check.value : 'ชื่อเล่น'}</strong>
            <div className="muted small">Lv.1 · {JOBS.novice.name}</div>
            <div className="muted small">{GENDERS.find((g) => g.id === look.gender)!.label} · {BASIC_OUTFIT_LABEL}</div>
            <div className="muted small">ทุกคนเริ่มด้วยชุดพื้นฐานเดียวกัน · เพศไม่มีผลต่อความสามารถ · เลือกอาชีพได้หลังจบบทนำ</div>
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
