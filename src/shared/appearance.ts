// Character appearance: gender picks the body art, outfit is cosmetic. Neither changes stats —
// jobs do that. Sprite keys must exist in public/assets/manifest.json (48×64, 4 dirs × 10 frames).
import type { Appearance, Gender, Outfit } from './types';

export const GENDERS: { id: Gender; label: string }[] = [
  { id: 'male', label: 'ชาย' },
  { id: 'female', label: 'หญิง' },
];

export const OUTFITS: { id: Outfit; label: string }[] = [
  { id: 'adventurer', label: 'ชุดนักผจญภัย' },
  { id: 'robe', label: 'ชุดคลุมเวท' },
];

/** Male sheets keep their original asset ids (visual contract: never rename an asset_id). */
const SPRITES: Record<Gender, Record<Outfit, string>> = {
  male: { adventurer: 'player_swordsman', robe: 'player_mage' },
  female: { adventurer: 'player_female_adventurer', robe: 'player_female_robe' },
};

export const PLAYER_SPRITES: string[] = Object.values(SPRITES).flatMap((o) => Object.values(o));

export const DEFAULT_APPEARANCE: Appearance = { gender: 'male', outfit: 'adventurer' };

export function isAppearance(a: unknown): a is Appearance {
  const v = a as Appearance | null;
  return !!v && typeof v === 'object' && (v.gender === 'male' || v.gender === 'female') && (v.outfit === 'adventurer' || v.outfit === 'robe');
}

/**
 * Accepts the current object form and the pre-gender string form ('swordsman' | 'mage') used by
 * saves written before this change. Anything else falls back to the default.
 */
export function normalizeAppearance(raw: unknown): Appearance {
  if (isAppearance(raw)) return { gender: raw.gender, outfit: raw.outfit };
  if (raw === 'mage') return { gender: 'male', outfit: 'robe' };
  return { ...DEFAULT_APPEARANCE };
}

export function spriteKey(a: Appearance | null | undefined): string {
  const n = normalizeAppearance(a);
  return SPRITES[n.gender][n.outfit];
}
