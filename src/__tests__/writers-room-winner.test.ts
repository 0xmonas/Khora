import { describe, it, expect } from 'vitest';
import { isCreditedWinner } from '@/lib/writers-room/storage';

describe('isCreditedWinner — strict winner rule', () => {
  it('awards when one page strictly leads with >= 1 vote', () => {
    expect(isCreditedWinner([2, 1])).toBe(true);
    expect(isCreditedWinner([3, 1, 1])).toBe(true);
    expect(isCreditedWinner([1])).toBe(true); // single page with a vote
  });

  it('awards none on a tie at the top', () => {
    expect(isCreditedWinner([1, 1])).toBe(false);
    expect(isCreditedWinner([2, 2, 1])).toBe(false);
  });

  it('awards none on zero-vote days', () => {
    expect(isCreditedWinner([0, 0])).toBe(false);
    expect(isCreditedWinner([0])).toBe(false); // single page, no votes
  });

  it('awards none with no submissions', () => {
    expect(isCreditedWinner([])).toBe(false);
  });
});
