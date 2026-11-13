// Order must match tools/assets/generate-placeholders.ts ICONS.
export const ICON_NAMES = ['sword', 'robe', 'wrench', 'boots', 'potion', 'badge', 'book', 'letter', 'gear', 'flask', 'bag', 'quest', 'skillbook'] as const;
export type IconName = (typeof ICON_NAMES)[number];
export const ICON_INDEX = Object.fromEntries(ICON_NAMES.map((n, i) => [n, i])) as Record<IconName, number>;
