// Builds the game as an ONLINE build (dummy Supabase settings, nothing is contacted) and fails if any
// shipped file contains answer keys or explanations. Run: npm run check:online-bundle
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { QUESTION_BANK } from '../src/shared/data/questions';

const OUT = 'dist-online-check';
rmSync(OUT, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--logLevel', 'warn'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'dummy-anon-key-for-bundle-check' },
});

const files: string[] = [];
const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
walk(OUT);
const text = files.filter((f) => /\.(js|html|json|css)$/.test(f)).map((f) => [f, readFileSync(f, 'utf8')] as const);

const needles = ['answer_key', 'distractor_rationale', ...QUESTION_BANK.slice(0, 5).map((q) => q.explanation.slice(0, 30))];
const leaks = text.flatMap(([f, t]) => needles.filter((n) => t.includes(n)).map((n) => `${f}: ${n}`));
rmSync(OUT, { recursive: true, force: true });
if (leaks.length) {
  console.error('Answer data found in the online build:\n' + leaks.join('\n'));
  process.exit(1);
}
console.log(`online build clean: ${text.length} files, no answer keys or explanations`);
