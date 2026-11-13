// Validates every Tiled map in public/assets/maps against the game's schema.
import { readdirSync, readFileSync } from 'node:fs';
import { validateMap } from '../../src/shared/mapSchema';

const dir = 'public/assets/maps';
let failed = false;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const errors = validateMap(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
  if (errors.length) {
    failed = true;
    console.error(`✗ ${f}\n  - ${errors.join('\n  - ')}`);
  } else console.log(`✓ ${f}`);
}
process.exit(failed ? 1 : 0);
