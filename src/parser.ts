import { PLAYERS, type Draft, type Player } from './domain';

const aliases: Record<Player, string[]> = { Bharat: ['bharat', 'bhaarat', 'barat'], Gaurav: ['gaurav', 'gorav', 'gourav'], Shibbu: ['shibbu', 'shibu', 'shiboo', 'sheboo'], Vikram: ['vikram', 'vickram','bickram','vikaram'], Sushil: ['sushil', 'sushheel', 'susheel'], Hitesh: ['hitesh','hatesh','hetesh'], Sagar: ['sagar', 'saagar', 'sagarr'] };
const wordNumbers: Array<[RegExp, string]> = [[/twenty[-\s]?one/g, '21'], [/twenty[-\s]?two/g, '22'], [/twenty[-\s]?three/g, '23'], [/twenty/g, '20'], [/nineteen/g, '19'], [/eighteen/g, '18'], [/seventeen/g, '17'], [/sixteen/g, '16'], [/fifteen/g, '15'], [/fourteen/g, '14'], [/thirteen/g, '13'], [/twelve/g, '12'], [/eleven/g, '11'], [/ten/g, '10'], [/nine/g, '9'], [/eight/g, '8'], [/seven/g, '7'], [/six/g, '6'], [/five/g, '5'], [/four/g, '4'], [/three/g, '3'], [/two/g, '2'], [/one/g, '1'], [/zero/g, '0']];
const shorthand = new Map<string, Player>();
for (const player of PLAYERS) {
  for (const length of [1, 2]) {
    const key = player.slice(0, length).toLowerCase();
    if (PLAYERS.filter((candidate) => candidate.slice(0, length).toLowerCase() === key).length === 1) shorthand.set(key, player);
  }
}
function normalise(input: string) { let value = input.toLowerCase().replace(/[–—]/g, '-').replace(/&/g, ' and '); for (const [pattern, replacement] of wordNumbers) value = value.replace(pattern, replacement); return value.replace(/[^a-z0-9\s.-]/g, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim(); }
function playersIn(text: string): Player[] { const found: Array<{ player: Player; index: number }> = []; for (const player of PLAYERS) { const names = [...aliases[player], ...[...shorthand.entries()].filter(([, owner]) => owner === player).map(([key]) => key)]; const indexes = names.map((alias) => text.search(new RegExp(`\\b${alias}\\b`))).filter((index) => index >= 0); if (indexes.length) found.push({ player, index: Math.min(...indexes) }); } return found.sort((a, b) => a.index - b.index).map(({ player }) => player); }
export type ParseResult = { draft?: Draft; message: string };
export function parseCommand(input: string): ParseResult {
  const text = normalise(input); if (!text) return { message: 'Say both teams and, optionally, the score.' };
  const divider = /\b(beat|beats|defeated|defeat|defeats|defets|def|wins|win|w|lost to|lose to|l)\b/.exec(text);
  if (!divider || divider.index === undefined) return { message: 'Use a result word between the teams, such as “beat”, “def”, “win”, or “lost to”.' };
  const teamA = playersIn(text.slice(0, divider.index)); const teamB = playersIn(text.slice(divider.index + divider[0].length));
  if (teamA.length !== 2 || teamB.length !== 2) return { message: 'Use two player names on each side of the result word.' };
  if (new Set([...teamA, ...teamB]).size !== 4) return { message: 'Each match needs four different players.' };
  const scores = text.match(/\b\d{1,2}\b/g)?.map(Number) ?? [];
  const scoreA = scores.at(-2) ?? null; const scoreB = scores.at(-1) ?? null;
  const lost = /^(lost to|lose to|l)$/.test(divider[0]); const winner = lost ? 'B' : 'A';
  return { draft: { teamA: [teamA[0], teamA[1]], teamB: [teamB[0], teamB[1]], scoreA, scoreB, winner, playedAt: new Date().toISOString(), command: input }, message: scoreA === null ? 'Teams and winner understood. Scores are optional.' : 'Result understood. Check it before saving.' };
}
