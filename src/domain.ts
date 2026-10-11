export const PLAYERS = ['Bharat', 'Gaurav', 'Shibbu', 'Vikram', 'Sushil', 'Hitesh', 'Sagar'] as const;
export type Player = (typeof PLAYERS)[number];

export type Match = {
  id: string;
  playedAt: string;
  teamA: [Player, Player];
  teamB: [Player, Player];
  scoreA: number;
  scoreB: number;
  command?: string;
  createdAt: string;
};

export type Draft = Omit<Match, 'id' | 'createdAt'>;

export type PlayerStat = { player: Player; played: number; won: number; lost: number; pointsFor: number; pointsAgainst: number };
export type PairStat = { pair: [Player, Player]; played: number; won: number; lost: number };

export const isPlayer = (value: string): value is Player => (PLAYERS as readonly string[]).includes(value);

export function teamKey(team: readonly Player[]) {
  return [...team].sort().join('|');
}

export function getStats(matches: Match[]) {
  const standings = new Map<Player, PlayerStat>(PLAYERS.map((player) => [player, { player, played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 }]));
  const pairs = new Map<string, PairStat>();

  for (const match of matches) {
    const teamAWon = match.scoreA > match.scoreB;
    for (const [team, score, opponentScore, won] of [
      [match.teamA, match.scoreA, match.scoreB, teamAWon],
      [match.teamB, match.scoreB, match.scoreA, !teamAWon],
    ] as const) {
      for (const player of team) {
        const stat = standings.get(player)!;
        stat.played += 1;
        stat.won += Number(won);
        stat.lost += Number(!won);
        stat.pointsFor += score;
        stat.pointsAgainst += opponentScore;
      }
      const key = teamKey(team);
      const existing = pairs.get(key) ?? { pair: [...team].sort() as [Player, Player], played: 0, won: 0, lost: 0 };
      existing.played += 1;
      existing.won += Number(won);
      existing.lost += Number(!won);
      pairs.set(key, existing);
    }
  }

  return {
    standings: [...standings.values()].sort((a, b) => b.won - a.won || b.played - a.played || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)),
    pairs,
  };
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function pct(won: number, played: number) {
  return played ? `${Math.round((won / played) * 100)}%` : '—';
}
