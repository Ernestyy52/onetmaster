import type { PublicQuestion, QuestionItem, ReviewStatus, SubjectId } from './types';

export interface SelectOptions {
  subjects?: SubjectId[];
  /** ids already used in this run — never repeated within a run */
  usedIds: ReadonlySet<string>;
  /** variant families already used in this run — never repeated within a run */
  usedFamilies: ReadonlySet<string>;
  /** how many times the player has seen each family across all runs */
  seenFamilies: Readonly<Record<string, number>>;
  /** after a wrong answer: prefer a basic item of this skill from a different family */
  remediateSkill?: string;
  /** default difficulty to start with (handoff: start at medium) */
  targetDifficulty?: 1 | 2 | 3;
  allowedStatuses: readonly ReviewStatus[];
  /** deterministic tie-break, 0..1 */
  rng?: () => number;
}

export interface Selection {
  question: QuestionItem;
  /** true when every unseen family is exhausted and an already-seen family is reused */
  isReview: boolean;
}

/**
 * Pick the next question:
 * 1. Never repeat an id or a variant family inside one run.
 * 2. After a wrong answer, prefer a difficulty-1 item of the same skill (different family).
 * 3. Otherwise prefer families the player has never seen, closest to the target difficulty.
 * 4. If only seen families remain, reuse one and mark it as "ทบทวน" (review).
 */
export function selectNextQuestion(pool: readonly QuestionItem[], opts: SelectOptions): Selection | null {
  const rng = opts.rng ?? Math.random;
  const target = opts.targetDifficulty ?? 2;
  const eligible = pool.filter(
    (q) =>
      opts.allowedStatuses.includes(q.review_status) &&
      (!opts.subjects || opts.subjects.includes(q.subject)) &&
      !opts.usedIds.has(q.id) &&
      !opts.usedFamilies.has(q.variant_family_id),
  );
  if (eligible.length === 0) return null;

  const seen = (q: QuestionItem) => opts.seenFamilies[q.variant_family_id] ?? 0;

  if (opts.remediateSkill) {
    const remedial = eligible.filter((q) => q.skill_id === opts.remediateSkill);
    if (remedial.length) {
      const pick = pickBest(remedial, (q) => q.difficulty * 10 + seen(q), rng);
      return { question: pick, isReview: seen(pick) > 0 };
    }
  }

  const unseen = eligible.filter((q) => seen(q) === 0);
  if (unseen.length) {
    const pick = pickBest(unseen, (q) => Math.abs(q.difficulty - target), rng);
    return { question: pick, isReview: false };
  }
  const pick = pickBest(eligible, (q) => seen(q) * 10 + Math.abs(q.difficulty - target), rng);
  return { question: pick, isReview: true };
}

function pickBest(items: QuestionItem[], score: (q: QuestionItem) => number, rng: () => number): QuestionItem {
  const best = Math.min(...items.map(score));
  const ties = items.filter((q) => score(q) === best);
  return ties[Math.floor(rng() * ties.length) % ties.length];
}

export function toPublic(q: QuestionItem): PublicQuestion {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { answer_key, explanation, distractor_rationale, source_refs, ...rest } = q;
  return rest;
}

/** Shuffle options by stable id so position changes but the key stays valid. */
export function shuffleOptions<T extends { options: { id: string; text: string }[] }>(q: T, rng: () => number): T {
  const options = [...q.options];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { ...q, options };
}
