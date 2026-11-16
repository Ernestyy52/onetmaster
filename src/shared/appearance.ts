// Character appearance: gender picks the body sprite. Every character starts in the SAME basic
// outfit (male and female sheets share it; only the hair differs). Appearance never changes stats —
// jobs do. Sprite keys must exist in public/assets/manifest.json (48×64, 4 dirs × 10 frames).
import { ITEMS } from './data/catalog';
import type { Appearance, EquipSlot, Gender, Progression } from './types';

export const GENDERS: { id: Gender; label: string }[] = [
  { id: 'male', label: 'ชาย' },
  { id: 'female', label: 'หญิง' },
];

/** Name shown for the shared starter outfit. */
export const BASIC_OUTFIT_LABEL = 'ชุดพื้นฐาน';

/** Male keeps the original asset id (visual contract: never rename an asset_id). */
const SPRITES: Record<Gender, string> = {
  male: 'player_swordsman',
  female: 'player_female_basic',
};

export const PLAYER_SPRITES: string[] = Object.values(SPRITES);

export const DEFAULT_APPEARANCE: Appearance = { gender: 'male' };

export function isAppearance(a: unknown): a is Appearance {
  const v = a as Appearance | null;
  return !!v && typeof v === 'object' && (v.gender === 'male' || v.gender === 'female');
}

/**
 * Accepts the current form, earlier `{gender, outfit}` objects (outfit is dropped) and the old
 * string form ('swordsman' | 'mage') from saves written before gender existed (→ male).
 */
export function normalizeAppearance(raw: unknown): Appearance {
  if (isAppearance(raw)) return { gender: raw.gender };
  return { ...DEFAULT_APPEARANCE };
}

/** Draw order of equipment overlays, bottom to top. */
export const LAYER_ORDER: EquipSlot[] = ['armor', 'shoes', 'charm', 'weapon'];

/** Overlay sheet keys for what the character is wearing, bottom to top. */
export function equipmentLayers(p: Pick<Progression, 'equipment' | 'inventory'>): string[] {
  const keys: string[] = [];
  for (const slot of LAYER_ORDER) {
    const inst = p.inventory.find((i) => i.instanceId === p.equipment[slot]);
    const visual = inst ? ITEMS[inst.itemId]?.visual : undefined;
    if (visual) keys.push(visual);
  }
  return keys;
}

export function spriteKey(a: Appearance | null | undefined): string {
  return SPRITES[normalizeAppearance(a).gender];
}
