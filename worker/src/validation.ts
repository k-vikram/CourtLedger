import { z } from 'zod';

const score = z.number().int().min(0).max(30).nullable();

export const matchInput = z.object({
  playedAt: z.string().datetime(),
  teamA: z.tuple([z.string().min(1), z.string().min(1)]),
  teamB: z.tuple([z.string().min(1), z.string().min(1)]),
  scoreA: score,
  scoreB: score,
  winner: z.enum(['A', 'B']),
  command: z.string().max(500).optional(),
}).strict();

export const matchUpdateInput = matchInput.extend({ revision: z.number().int().positive() });

export type MatchInput = z.infer<typeof matchInput>;

export function validateMatch(input: MatchInput) {
  const players = [...input.teamA, ...input.teamB];
  if (new Set(players).size !== 4) return 'Choose four different players.';
  if ((input.scoreA === null) !== (input.scoreB === null)) return 'Enter both scores or leave both empty.';
  if (input.scoreA !== null && input.scoreB !== null) {
    if (input.scoreA === input.scoreB) return 'A completed game cannot end in a tie.';
    const winningScore = Math.max(input.scoreA, input.scoreB);
    if (![7, 11, 15].includes(winningScore) && (winningScore < 21 || winningScore > 30)) {
      return 'The winning side must finish on 7, 11, 15, or any score from 21 to 30.';
    }
    if ((input.winner === 'A' && input.scoreA < input.scoreB) || (input.winner === 'B' && input.scoreB < input.scoreA)) {
      return 'The selected winner must have the higher score.';
    }
  }
  return null;
}
