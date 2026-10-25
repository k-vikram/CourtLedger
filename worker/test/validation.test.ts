import { describe, expect, it } from 'vitest';
import { validateMatch, type MatchInput } from '../src/validation';

const base: MatchInput = {
  playedAt: '2026-10-25T12:00:00.000Z',
  teamA: ['Bharat', 'Vikram'],
  teamB: ['Gaurav', 'Sagar'],
  scoreA: 21,
  scoreB: 17,
  winner: 'A',
};

describe('match validation', () => {
  it.each([21, 22, 23, 24, 25, 26, 27, 28, 29, 30])('accepts winning score %i', (winningScore) => {
    expect(validateMatch({ ...base, scoreA: winningScore, scoreB: winningScore - 1 })).toBeNull();
  });

  it.each([7, 11, 15])('retains short-game winning score %i', (winningScore) => {
    expect(validateMatch({ ...base, scoreA: winningScore, scoreB: winningScore - 2 })).toBeNull();
  });

  it('rejects unsupported winning scores below 21', () => {
    expect(validateMatch({ ...base, scoreA: 20, scoreB: 18 })).toContain('must finish');
  });

  it('requires the selected winner to have the higher score', () => {
    expect(validateMatch({ ...base, winner: 'B' })).toContain('selected winner');
  });

  it('rejects duplicate players', () => {
    expect(validateMatch({ ...base, teamB: ['Gaurav', 'Vikram'] })).toContain('four different');
  });
});
