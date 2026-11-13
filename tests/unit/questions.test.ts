import { describe, expect, it } from 'vitest';
import { QUESTION_BANK } from '../../src/shared/data/questions';
import { selectNextQuestion, shuffleOptions, toPublic } from '../../src/shared/questionSelector';
import type { QuestionItem } from '../../src/shared/types';

const ALLOWED = ['review', 'approved', 'published'] as const;

describe('question bank', () => {
  it('has 20–30 prototype items across all four subjects', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(20);
    expect(QUESTION_BANK.length).toBeLessThanOrEqual(30);
    for (const s of ['thai', 'english', 'math', 'science']) expect(QUESTION_BANK.some((q) => q.subject === s)).toBe(true);
  });

  it('every item is well-formed', () => {
    const ids = new Set<string>();
    for (const q of QUESTION_BANK) {
      expect(ids.has(q.id), `duplicate id ${q.id}`).toBe(false);
      ids.add(q.id);
      const optIds = q.options.map((o) => o.id);
      expect(new Set(optIds).size, `${q.id} duplicate option ids`).toBe(optIds.length);
      expect(new Set(q.options.map((o) => o.text)).size, `${q.id} duplicate option text`).toBe(optIds.length);
      expect(optIds.filter((id) => id === q.answer_key), `${q.id} exactly one key`).toHaveLength(1);
      for (const id of optIds) if (id !== q.answer_key) expect(q.distractor_rationale[id], `${q.id} rationale for ${id}`).toBeTruthy();
      expect(q.explanation.length).toBeGreaterThan(10);
      expect(q.variant_family_id).toMatch(/^fam\./);
    }
  });

  it('public questions never contain the key or explanation', () => {
    const pub = toPublic(QUESTION_BANK[0]) as Record<string, unknown>;
    expect(pub.answer_key).toBeUndefined();
    expect(pub.explanation).toBeUndefined();
    expect(pub.distractor_rationale).toBeUndefined();
  });

  it('shuffling keeps stable option ids', () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const q = QUESTION_BANK[0];
    const s = shuffleOptions(q, rng);
    expect(s.options.map((o) => o.id).sort()).toEqual(q.options.map((o) => o.id).sort());
    expect(s.options.find((o) => o.id === q.answer_key)?.text).toBe(q.options.find((o) => o.id === q.answer_key)?.text);
  });
});

describe('selector', () => {
  const base = { usedIds: new Set<string>(), usedFamilies: new Set<string>(), seenFamilies: {}, allowedStatuses: ALLOWED, rng: () => 0 };

  it('never repeats an id or variant family within a run', () => {
    const usedIds = new Set<string>();
    const usedFamilies = new Set<string>();
    const picked: QuestionItem[] = [];
    for (;;) {
      const s = selectNextQuestion(QUESTION_BANK, { ...base, subjects: ['math'], usedIds, usedFamilies });
      if (!s) break;
      picked.push(s.question);
      usedIds.add(s.question.id);
      usedFamilies.add(s.question.variant_family_id);
    }
    const fams = picked.map((q) => q.variant_family_id);
    expect(new Set(fams).size).toBe(fams.length);
    // m-001 and m-008 share a family, so one math item must be left out
    expect(picked.length).toBe(QUESTION_BANK.filter((q) => q.subject === 'math').length - 1);
  });

  it('after a wrong answer prefers a basic item of the same skill', () => {
    const s = selectNextQuestion(QUESTION_BANK, {
      ...base, subjects: ['math'], usedIds: new Set(['m-001']), usedFamilies: new Set(['fam.math.frac_remaining']),
      remediateSkill: 'math.fraction_of_quantity',
    })!;
    expect(s.question.id).toBe('m-002');
    expect(s.question.difficulty).toBe(1);
  });

  it('prefers unseen families and flags reuse as review', () => {
    const allSeen = Object.fromEntries(QUESTION_BANK.map((q) => [q.variant_family_id, 1]));
    const s = selectNextQuestion(QUESTION_BANK, { ...base, subjects: ['science'], seenFamilies: allSeen })!;
    expect(s.isReview).toBe(true);
    const fresh = selectNextQuestion(QUESTION_BANK, { ...base, subjects: ['science'], seenFamilies: { 'fam.sci.fair_test_light': 3 } })!;
    expect(fresh.isReview).toBe(false);
    expect(fresh.question.variant_family_id).not.toBe('fam.sci.fair_test_light');
  });

  it('only serves allowed review statuses', () => {
    const drafts = QUESTION_BANK.map((q) => ({ ...q, review_status: 'draft' as const }));
    expect(selectNextQuestion(drafts, base)).toBeNull();
  });
});
