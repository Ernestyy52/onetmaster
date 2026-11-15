// Online GameApi: every call goes to the `game` Edge Function (supabase/functions/game), which runs
// the same rules as LocalGameApi against the account's server-side save. Writes carry UUID request
// ids, so a call that is retried after a dropped connection is answered from request_log instead of
// running twice.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import type { PlayerAction } from '../shared/combat';
import type { Appearance, CharacterSummary, EquipSlot, JobId, Progression } from '../shared/types';
import { supabase } from './supabaseClient';
import type { ActionResult, GameApi, QuestResult, RunView } from './types';

export class NotSignedInError extends Error {
  constructor() {
    super('กรุณาเข้าสู่ระบบอีกครั้ง');
    this.name = 'NotSignedInError';
  }
}

const RETRIES = [400, 1200, 3000]; // ms between attempts when the network drops

async function call<T>(op: string, ...args: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabase().functions.invoke('game', { body: { op, args } });
    if (!error) return (data as { result: T }).result;
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      if (res.status === 401) throw new NotSignedInError();
      let message = 'เกิดข้อผิดพลาด';
      try {
        message = ((await res.json()) as { error?: string }).error ?? message;
      } catch {
        /* keep generic message */
      }
      if (res.status < 500 || attempt >= RETRIES.length) throw new Error(message);
    } else if (!(error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) || attempt >= RETRIES.length) {
      throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง');
    }
    await new Promise((r) => setTimeout(r, RETRIES[attempt]));
  }
}

export class SupabaseGameApi implements GameApi {
  getProgression = () => call<Progression>('getProgression');
  listCharacters = () => call<CharacterSummary[]>('listCharacters');
  createCharacter = (slot: number, nickname: string, appearance: Appearance, requestId: string) => call<Progression>('createCharacter', slot, nickname, appearance, requestId);
  selectCharacter = (slot: number) => call<Progression>('selectCharacter', slot);
  changeJob = (job: JobId, requestId: string) => call<Progression>('changeJob', job, requestId);
  talk = (npc: string, requestId: string) => call<QuestResult>('talk', npc, requestId);
  acceptQuest = (questId: string, requestId: string) => call<Progression>('acceptQuest', questId, requestId);
  completeQuest = (questId: string, requestId: string) => call<QuestResult>('completeQuest', questId, requestId);
  startRun = (enemyId: string, requestId: string) => call<RunView>('startRun', enemyId, requestId);
  getRun = (runId: string) => call<RunView | null>('getRun', runId);
  answer = (runId: string, turnId: string, optionId: string, requestId: string) => call<RunView>('answer', runId, turnId, optionId, requestId);
  useHint = (runId: string, turnId: string, requestId: string) => call<RunView>('useHint', runId, turnId, requestId);
  action = (runId: string, turn: number, action: PlayerAction, requestId: string) => call<ActionResult>('action', runId, turn, action, requestId);
  abandonRun = (runId: string) => call<Progression>('abandonRun', runId);
  equip = (instanceId: string) => call<Progression>('equip', instanceId);
  unequip = (slot: EquipSlot) => call<Progression>('unequip', slot);
  savePosition = (tx: number, ty: number) => call<void>('savePosition', tx, ty);
  async reset(): Promise<void> {
    throw new Error('บัญชีออนไลน์ลบเซฟจากในเกมไม่ได้ — ติดต่อครู');
  }
}
