export const PLAYERS = ['Bharat', 'Gaurav', 'Shibbu', 'Vikram', 'Sushil', 'Hitesh', 'Sagar'] as const;
export type Player = (typeof PLAYERS)[number];

export type Match = {
  id: string;
  playedAt: string;
  teamA: [Player, Player];
  teamB: [Player, Player];
  scoreA: number | null;
  scoreB: number | null;
  winner: 'A' | 'B';
  command?: string;
  createdAt: string;
  updatedAt?: string;
};

export type Draft = Omit<Match, 'id' | 'createdAt' | 'updatedAt'>;
export type PlayerStat = { player: Player; played: number; won: number; lost: number; pointsFor: number; pointsAgainst: number };
export type PairStat = { pair: [Player, Player]; played: number; won: number; lost: number };
export const isPlayer = (value: string): value is Player => (PLAYERS as readonly string[]).includes(value);

/** Safely accept a persisted or test-imported match without trusting its shape. */
export function normaliseMatch(value: unknown): Match | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Match>;
  if (!raw.id || !raw.playedAt || !raw.createdAt || !Array.isArray(raw.teamA) || !Array.isArray(raw.teamB) || raw.teamA.length !== 2 || raw.teamB.length !== 2 || !raw.teamA.every(isPlayer) || !raw.teamB.every(isPlayer) || new Set([...raw.teamA, ...raw.teamB]).size !== 4) return null;
  const scoreA = raw.scoreA === undefined ? null : raw.scoreA;
  const scoreB = raw.scoreB === undefined ? null : raw.scoreB;
  if (!((scoreA === null || Number.isFinite(scoreA)) && (scoreB === null || Number.isFinite(scoreB)))) return null;
  const winner = raw.winner ?? (typeof scoreA === 'number' && typeof scoreB === 'number' ? scoreA > scoreB ? 'A' : 'B' : undefined);
  if (winner !== 'A' && winner !== 'B') return null;
  return { id: raw.id, playedAt: raw.playedAt, createdAt: raw.createdAt, updatedAt: raw.updatedAt, teamA: raw.teamA as [Player, Player], teamB: raw.teamB as [Player, Player], scoreA, scoreB, winner, command: raw.command };
}

export function teamKey(team: readonly Player[]) { return [...team].sort().join('|'); }

export function getStats(matches: Match[]) {
  const standings = new Map<Player, PlayerStat>(PLAYERS.map((player) => [player, { player, played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 }]));
  const pairs = new Map<string, PairStat>();
  for (const match of matches) {
    const teamAWon = match.winner === 'A';
    for (const [team, score, opponentScore, won] of [[match.teamA, match.scoreA, match.scoreB, teamAWon], [match.teamB, match.scoreB, match.scoreA, !teamAWon]] as const) {
      for (const player of team) {
        const stat = standings.get(player)!;
        stat.played += 1; stat.won += Number(won); stat.lost += Number(!won);
        if (score !== null && opponentScore !== null) { stat.pointsFor += score; stat.pointsAgainst += opponentScore; }
      }
      const key = teamKey(team);
      const existing = pairs.get(key) ?? { pair: [...team].sort() as [Player, Player], played: 0, won: 0, lost: 0 };
      existing.played += 1; existing.won += Number(won); existing.lost += Number(!won); pairs.set(key, existing);
    }
  }
  return { standings: [...standings.values()].sort((a, b) => b.won - a.won || b.played - a.played || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)), pairs };
}
export function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)); }
export function pct(won: number, played: number) { return played ? `${Math.round((won / played) * 100)}%` : '—'; }
