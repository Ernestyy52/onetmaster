// UI controller: turns world interactions into API calls and dialogue.
import { getApi, requestId } from '../api';
import type { RunView } from '../api/types';
import { bus, type InteractTarget } from '../game/eventBus';
import { ENEMIES, type PlayerAction } from '../shared/combat';
import { SUBJECTS } from '../shared/data/catalog';
import { QUESTS } from '../shared/story';
import { JOBS } from '../shared/data/jobs';
import { MAX_SLOTS } from '../api/saveFormat';
import type { Appearance, JobId, RewardSummary, SubjectId } from '../shared/types';
import { toast, useGame, type Dialogue, type DialogueChoice } from '../state/store';

const api = () => getApi();
const S = () => useGame.getState();

function name() {
  return S().progression?.profile?.nickname ?? 'นักผจญภัย';
}

export async function refreshProgression() {
  const progression = await api().getProgression();
  S().set({ progression });
  bus.emit('world:refresh');
  return progression;
}

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    S().set({ busy: true });
    return await fn();
  } catch (e) {
    console.error(e);
    toast(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
    return undefined;
  } finally {
    S().set({ busy: false });
  }
}

export function say(d: Omit<Dialogue, 'index'>) {
  S().set({ dialogue: { ...d, index: 0 } });
}

export function advanceDialogue() {
  const d = S().dialogue;
  if (!d) return;
  if (d.index < d.lines.length - 1) {
    S().set({ dialogue: { ...d, index: d.index + 1 } });
    return;
  }
  if (d.choices?.length) return; // wait for a choice
  S().set({ dialogue: null });
  void d.onDone?.();
}

export async function choose(c: DialogueChoice) {
  S().set({ dialogue: null });
  await c.run();
}

function showRewards(title: string, rewards: RewardSummary | null, note?: string) {
  if (!rewards || (rewards.xp === 0 && rewards.items.length === 0)) return;
  S().set({ rewardPopup: { title, rewards, note } });
}

// ───────── boot / profile ─────────

export async function boot() {
  const [progression, characters] = await Promise.all([api().getProgression(), api().listCharacters()]);
  S().set({ progression, characters, screen: 'title' });
}

function firstFreeSlot(): number | null {
  const used = new Set(S().characters.map((c) => c.slot));
  for (let slot = 1; slot <= MAX_SLOTS; slot++) if (!used.has(slot)) return slot;
  return null;
}

export async function startOrContinue() {
  const p = S().progression;
  if (p?.profile) return S().set({ screen: 'hub' });
  if (S().characters.length) return S().set({ screen: 'select' });
  S().set({ screen: 'create', createSlot: firstFreeSlot() });
}

export async function openCharacterSelect() {
  const characters = await api().listCharacters();
  S().set({ characters, screen: 'select', panel: null, dialogue: null, run: null, nearby: null, worldReady: false });
}

export function newCharacter(slot: number) {
  S().set({ screen: 'create', createSlot: slot });
}

export async function pickCharacter(slot: number) {
  const progression = await guard(() => api().selectCharacter(slot));
  if (progression) S().set({ progression, screen: 'hub' });
}

export async function createCharacter(nickname: string, appearance: Appearance) {
  const slot = S().createSlot ?? firstFreeSlot();
  if (slot === null) return toast('ช่องตัวละครเต็มแล้ว');
  const p = await guard(() => api().createCharacter(slot, nickname, appearance, requestId()));
  if (!p) return;
  const characters = await api().listCharacters();
  S().set({ progression: p, characters, screen: 'hub', createSlot: null });
}

export async function changeJob(job: JobId) {
  const p = await guard(() => api().changeJob(job, requestId()));
  if (!p) return;
  S().set({ progression: p });
  bus.emit('world:refresh');
  toast(`เปลี่ยนเป็น${JOBS[job].name}แล้ว`);
}

/** Called once the hub scene is ready: resume an unfinished battle after refresh. */
export async function onHubReady() {
  const p = S().progression;
  if (p?.activeRunId) {
    const view = await api().getRun(p.activeRunId);
    if (view && !view.result) {
      enterBattle(view, null);
      toast('กลับมาที่การต่อสู้เดิม');
      return;
    }
  }
  const owlFirst = p?.story.quests.q_meet_owl === 'available';
  if (owlFirst) {
    setTimeout(() => toast('เดินไปหา “อาจารย์ฮูก” (มีเครื่องหมาย !) เพื่อเริ่มเรื่อง'), 600);
  }
}

// ───────── interactions ─────────

export function interact(t: InteractTarget) {
  if (S().dialogue || S().panel || S().busy) return;
  switch (t.kind) {
    case 'npc':
      return talkOwl();
    case 'board':
      return S().set({ panel: 'board' });
    case 'door':
      return openDoor(t.subject);
    case 'enemy':
      return t.enemyId === 'gear_warden' ? bossIntro(t.id) : startBattle(t.enemyId, t.id);
  }
}

function acceptChoice(questId: string, after?: () => void): DialogueChoice {
  return {
    label: `รับภารกิจ: ${QUESTS[questId].title}`,
    primary: true,
    run: async () => {
      const p = await guard(() => api().acceptQuest(questId, requestId()));
      if (!p) return;
      S().set({ progression: p });
      bus.emit('world:refresh');
      toast(`รับภารกิจ “${QUESTS[questId].title}” แล้ว`);
      after?.();
    },
  };
}

const later: DialogueChoice = { label: 'ไว้ก่อน', run: () => {} };

export function talkOwl() {
  const p = S().progression;
  if (!p) return;
  const q = p.story.quests;
  const speaker = 'อาจารย์ฮูก';
  if (q.q_meet_owl === 'available' || q.q_meet_owl === 'active') {
    say({
      speaker, portrait: 'owl',
      lines: [
        `ฮู้ว… ยินดีต้อนรับสู่สถาบันนักผจญภัย ${name()}!`,
        'เมื่อคืนหอจดหมายเหตุถูกเปิดออก ตราแห่งความรู้ทั้งสี่แตกกระจาย และ “ม่านลืมเลือน” เริ่มคืบคลานเข้ามาในเมือง',
        'เข็มทิศเวทในมือเจ้ากำลังเรืองแสง… มันตอบสนองต่อความพยายามในการเรียนรู้ เจ้าคือคนที่เราตามหา',
        'เริ่มจากสิ่งใกล้ตัวก่อน หมอกลืมเลือนสีม่วงกำลังลอยอยู่ในลานนี้ ระหว่างต่อสู้จะมีโจทย์ให้คิด ตอบถูกได้ “แต้มพลัง” ไว้ใช้สกิล',
      ],
      onDone: async () => {
        const r = await guard(() => api().talk('owl', requestId()));
        if (!r) return;
        S().set({ progression: r.progression });
        bus.emit('world:refresh');
        showRewards('ภารกิจสำเร็จ: พบอาจารย์ฮูก', r.rewards);
        say({ speaker, portrait: 'owl', lines: ['พร้อมจะช่วยลานกลางหรือยัง?'], choices: [acceptChoice('q_clear_fog'), later] });
      },
    });
    return;
  }
  if (q.q_clear_fog === 'available')
    return say({ speaker, portrait: 'owl', lines: ['หมอกลืมเลือนยังลอยอยู่ในลานกลาง ช่วยไล่มันไปที'], choices: [acceptChoice('q_clear_fog'), later] });
  if (q.q_clear_fog === 'active')
    return say({
      speaker, portrait: 'owl',
      lines: [
        'หมอกลืมเลือนลอยอยู่แถวสนามหญ้า เดินเข้าไปใกล้ ๆ แล้วกด Enter หรือแตะที่มันเพื่อต่อสู้',
        'ก่อนออกคำสั่ง ให้ดู “เจตนา” ของศัตรูก่อนเสมอ ถ้ามันตั้งการ์ด ลองตอบโจทย์แล้วใช้ “เจาะเกราะ”',
      ],
    });
  if (q.q_math_door === 'available')
    return say({
      speaker, portrait: 'owl',
      lines: ['เก่งมาก! แต่ประตูโรงกลจักรยังเงียบสนิท…', 'ผู้พิทักษ์เฟืองที่คอยจ่ายพลังให้ประตูควบคุมตัวเองไม่ได้ เจ้าต้องไปหยุดมัน'],
      choices: [acceptChoice('q_math_door', () => toast('ผู้พิทักษ์เฟืองปรากฏตัวหน้าประตูคณิตศาสตร์ (ทางขวาบน)')), later],
    });
  if (q.q_math_door === 'active')
    return say({
      speaker, portrait: 'owl',
      lines: ['ผู้พิทักษ์เฟืองจะ “ชาร์จพลัง” ก่อนยิงลำแสงในเทิร์นถัดไป ถ้าเห็นมันชาร์จ ให้เตรียมตั้งโล่', 'โจทย์ของมันเป็นเรื่องเศษส่วน อยากทบทวนก่อนไหม?'],
      choices: [{ label: 'ดูบทสอนเศษส่วน (1 นาที)', primary: true, run: () => S().set({ panel: 'lesson' }) }, later],
    });
  if (q.q_math_door === 'ready')
    return say({ speaker, portrait: 'owl', lines: ['ประตูได้รับพลังแล้ว! ไปแตะประตูโรงกลจักรเพื่อเปิดมันเลย'] });
  return say({
    speaker, portrait: 'owl',
    lines: p.job === 'novice'
      ? ['เจ้าจบบทนำแล้ว ตราชิ้นแรกกำลังกลับมาส่องแสง', 'ถึงเวลาเลือกเส้นทางของเจ้าแล้ว — นักดาบ ผู้พิทักษ์ นักเวท หรือนักธนู แต่ละอาชีพมีสกิลต่างกัน เปลี่ยนภายหลังได้เสมอ']
      : [`${JOBS[p.job].name}ผู้กล้า ห้องเรียนอื่น ๆ จะเปิดในรุ่นถัดไปของเกม`, 'ระหว่างนี้ฝึกกับหมอกลืมเลือนเพื่อเก็บ XP และ Job Level ได้ อยากลองอาชีพอื่นก็บอกข้าได้'],
    choices: [{ label: p.job === 'novice' ? 'เลือกอาชีพ' : 'ดู/เปลี่ยนอาชีพ', primary: true, run: () => S().set({ panel: 'jobs' }) }, later],
  });
}

export async function acceptFromBoard(questId: string) {
  await acceptChoice(questId, questId === 'q_math_door' ? () => toast('ผู้พิทักษ์เฟืองปรากฏตัวหน้าประตูคณิตศาสตร์') : undefined).run();
}

export async function openDoor(subject: SubjectId) {
  const p = S().progression;
  if (!p) return;
  if (subject === 'math') {
    if (p.story.quests.q_math_door === 'ready') {
      const r = await guard(() => api().completeQuest('q_math_door', requestId()));
      if (!r) return;
      S().set({ progression: r.progression });
      bus.emit('world:refresh');
      showRewards('ประตูโรงกลจักรเปิดแล้ว!', r.rewards, 'บทนำสำเร็จ · กลับไปคุยกับอาจารย์ฮูกเพื่อเลือกอาชีพ');
      return;
    }
    if (p.story.flags.door_math_open) {
      S().set({ panel: 'room', roomSubject: 'math' });
      return;
    }
    say({
      speaker: 'ประตูโรงกลจักร', portrait: 'door',
      lines: p.story.quests.q_math_door === 'active'
        ? ['เฟืองในประตูหยุดหมุน… พลังงานถูกผู้พิทักษ์เฟืองดูดไป', 'ปราบผู้พิทักษ์เฟืองที่ยืนขวางอยู่ด้านหน้าก่อน']
        : ['ประตูถูกผนึกด้วยเฟืองที่หยุดนิ่ง ต้องมีพลังงานจึงจะเปิดได้', 'ลองถามอาจารย์ฮูกดูว่าต้องทำอย่างไร'],
    });
    return;
  }
  S().set({ panel: 'room', roomSubject: subject });
}

function bossIntro(sourceId: string) {
  say({
    speaker: ENEMIES.gear_warden.name, portrait: 'enemy',
    lines: ['คลิก… คลิก… พลังงานไม่สมดุล… ผู้บุกรุกต้องถูกหยุด!'],
    choices: [
      { label: 'เริ่มต่อสู้', primary: true, run: () => startBattle('gear_warden', sourceId) },
      { label: 'ดูบทสอนก่อน', run: () => S().set({ panel: 'lesson' }) },
      later,
    ],
  });
}

// ───────── battle ─────────

function enterBattle(view: RunView, sourceId: string | null) {
  S().set({ run: view, screen: 'battle', nearby: null, panel: null });
  bus.emit('battle:enter', { enemyId: view.enemyId, sourceId });
}

export async function startBattle(enemyId: string, sourceId: string | null) {
  const view = await guard(() => api().startRun(enemyId, requestId()));
  if (view) enterBattle(view, sourceId);
}

export async function requestHint() {
  const run = S().run;
  if (!run?.turn) return;
  const view = await guard(() => api().useHint(run.runId, run.turn!.turnId, requestId()));
  if (view) S().set({ run: view });
}

export async function answer(optionId: string) {
  const run = S().run;
  if (!run?.turn || run.lastAnswer) return;
  const turn = run.turn;
  const view = await guard(() => api().answer(run.runId, turn.turnId, optionId, requestId()));
  if (!view) return;
  // keep the question visible together with the explanation
  S().set({ run: { ...view, turn } });
  bus.emit('battle:state', view.state);
}

export function dismissExplanation() {
  const run = S().run;
  if (!run) return;
  S().set({ run: { ...run, turn: null, lastAnswer: null } });
}

function waitFx(timeout = 3000) {
  return new Promise<void>((resolve) => {
    const off = bus.on('battle:fx-done', () => {
      off();
      clearTimeout(t);
      resolve();
    });
    const t = setTimeout(() => {
      off();
      resolve();
    }, timeout);
  });
}

export async function act(action: PlayerAction) {
  const run = S().run;
  if (!run || run.state.phase !== 'command' || S().busy) return;
  S().set({ busy: true });
  try {
    const res = await api().action(run.runId, run.state.turn, action, requestId());
    const progression = res.view.result ? await api().getProgression() : null;
    const fx = waitFx();
    bus.emit('battle:fx', { events: res.events, state: res.view.state });
    // Show HP/focus changes while the animation plays; hide the next question and the
    // result card until it ends so the player cannot leave mid-animation.
    S().set({ run: { ...res.view, turn: null, result: null } });
    await fx;
    if (S().run?.runId !== run.runId) return;
    S().set(progression ? { run: res.view, progression } : { run: res.view });
  } catch (e) {
    console.error(e);
    toast(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
  } finally {
    S().set({ busy: false });
  }
}

export async function fleeBattle() {
  const run = S().run;
  if (!run) return;
  const p = await api().abandonRun(run.runId);
  S().set({ progression: p, run: null, screen: 'hub' });
  bus.emit('battle:exit', { won: false });
}

export async function leaveBattle() {
  const run = S().run;
  const won = run?.result?.outcome === 'won';
  const result = run?.result;
  const progression = await api().getProgression();
  S().set({ run: null, screen: 'hub', progression });
  bus.emit('battle:exit', { won });
  bus.emit('world:refresh');
  if (result?.completedQuests.length) toast(`ภารกิจสำเร็จ: ${result.completedQuests.map((q) => QUESTS[q].title).join(', ')}`);
  if (result?.readyQuests.includes('q_math_door')) toast('ประตูโรงกลจักรได้รับพลังแล้ว — ไปแตะประตูได้เลย');
}

// ───────── equipment & misc ─────────

export async function equip(instanceId: string) {
  const p = await guard(() => api().equip(instanceId));
  if (p) {
    S().set({ progression: p });
    toast('สวมใส่แล้ว');
  }
}

export async function resetSave() {
  await api().reset();
  location.reload();
}

export function roomStatus(subject: SubjectId): 'open' | 'locked' {
  const p = S().progression;
  return subject === 'math' && p?.story.flags.door_math_open ? 'open' : 'locked';
}

export const roomBlurb: Record<SubjectId, string> = {
  thai: 'ห้องสมุดซ้อนชั้น หนังสือลอยและม้วนคำสั่ง — แตะข้อความที่เป็นหลักฐานก่อนเลือกข้อสรุป',
  english: 'สถานีส่งสาร ป้ายร้าน และเรือส่งของ — อ่านประกาศเพื่อวางเส้นทางและเลือกคำตอบให้เหมาะกับคู่สนทนา',
  math: 'เฟือง สะพาน และมาตรวัดขนาดใหญ่ — ใช้เศษส่วน อัตราส่วน และการวัดเพื่อควบคุมเครื่อง',
  science: 'พืชเรืองแสง โต๊ะทดลอง และห้องสังเกตการณ์ — อ่านตารางผลทดลองและแยกตัวแปร',
};

export function subjectLabel(s: SubjectId) {
  return `${SUBJECTS[s].nameTh} · ${SUBJECTS[s].roomName}`;
}
