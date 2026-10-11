import { PLAYERS, type Match, type Player } from './domain';

const scores: Array<[number, number]> = [[21, 14], [21, 16], [21, 17], [21, 18], [21, 19], [21, 12], [22, 20], [23, 21]];

/** A date-seeded 60-day fixture: five or six games daily with broad repeat coverage. */
export function generateMonthTestMatches(): Match[] {
  const start = new Date();
  start.setDate(start.getDate() - 59);
  start.setHours(18, 0, 0, 0);
  const matches: Match[] = [];
  let seed = Number(start.toISOString().slice(0, 10).replace(/-/g, ''));
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let day = 0; day < 60; day += 1) {
    const games = next() > .48 ? 6 : 5;
    for (let game = 0; game < games; game += 1) {
      const order = [...PLAYERS].sort(() => next() - .5) as Player[];
      const teamA: [Player, Player] = [order[0], order[1]];
      const teamB: [Player, Player] = [order[2], order[3]];
      const winner: 'A' | 'B' = (day + game) % 3 === 0 ? 'B' : 'A';
      const pair = scores[(day * 5 + game) % scores.length];
      const [scoreA, scoreB] = winner === 'A' ? pair : [pair[1], pair[0]];
      const played = new Date(start);
      played.setDate(start.getDate() + day);
      played.setMinutes(game * 24);
      const playedAt = played.toISOString();
      matches.push({ id: `fixture-${day + 1}-${game + 1}`, playedAt, createdAt: playedAt, teamA, teamB, scoreA, scoreB, winner, command: `${teamA.join(' & ')} ${winner === 'A' ? 'def.' : 'lost to'} ${teamB.join(' & ')} ${scoreA}-${scoreB}` });
    }
  }
  return matches.sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

export function fixtureBackup() { return { schemaVersion: 2, exportedAt: new Date().toISOString(), matches: generateMonthTestMatches() }; }
