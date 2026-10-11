import { useMemo, useRef, useState } from 'react';
import { formatDate, getStats, normaliseMatch, pct, teamKey, type Match, type Player } from './domain';
import { fixtureBackup, generateMonthTestMatches } from './testData';
import { workbook } from './xlsx';
import { xlsxRows } from './xlsxImport';

function download(name: string, blob: Blob) { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function rowsToMatches(rows: Record<string, unknown>[]) {
  return rows.map((row, index) => normaliseMatch({
    id: row['Match ID'] || row.id || `uploaded-${index + 1}`,
    playedAt: row['Played at'] || row.playedAt,
    createdAt: row['Created at'] || row.createdAt || row['Played at'] || row.playedAt,
    teamA: typeof row['Team A'] === 'string' ? row['Team A'].split(' + ') : row.teamA,
    teamB: typeof row['Team B'] === 'string' ? row['Team B'].split(' + ') : row.teamB,
    winner: row.Winner === 'Team A' ? 'A' : row.Winner === 'Team B' ? 'B' : row.winner,
    scoreA: row['A score'] === '' ? null : Number(row['A score'] ?? row.scoreA),
    scoreB: row['B score'] === '' ? null : Number(row['B score'] ?? row.scoreB),
    command: row['Original input'] || row.command,
  })).filter((match): match is Match => Boolean(match));
}

export default function SecretTestPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState('Upload a JSON backup or an Excel “Matches” sheet. This page never writes to your live ledger.');
  const input = useRef<HTMLInputElement>(null);
  const { standings, pairs } = useMemo(() => getStats(matches), [matches]);
  const load = async (file?: File) => {
    if (!file) return;
    try {
      let incoming: Match[] = [];
      if (file.name.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(await file.text());
        incoming = (Array.isArray(data.matches) ? data.matches as unknown[] : []).map(normaliseMatch).filter((match): match is Match => Boolean(match));
      } else {
        incoming = rowsToMatches(await xlsxRows(file));
      }
      if (!incoming.length) throw new Error('empty');
      setMatches(incoming.sort((a, b) => b.playedAt.localeCompare(a.playedAt)));
      setMessage(`${incoming.length} test matches loaded. The duplicate preview below is isolated from the live app.`);
    } catch { setMessage('Could not read that test file. Use a Court Ledger JSON backup or an Excel file with a Matches sheet.'); }
  };
  const downloadJson = () => download('court-ledger-month-test-data.json', new Blob([JSON.stringify(fixtureBackup(), null, 2)], { type: 'application/json' }));
  const downloadExcel = () => download('court-ledger-month-test-data.xlsx', workbook([{ name: 'Matches', rows: [['Match ID', 'Played at', 'Created at', 'Team A', 'Team B', 'Winner', 'A score', 'B score', 'Original input'], ...generateMonthTestMatches().map((match) => [match.id, match.playedAt, match.createdAt, match.teamA.join(' + '), match.teamB.join(' + '), `Team ${match.winner}`, match.scoreA, match.scoreB, match.command ?? ''])] }]));
  return <main className="test-lab"><header className="topbar"><div className="brand"><span className="brand-mark">⊕</span><span>Court Ledger</span></div><span className="test-badge">PRIVATE TEST LAB</span></header><section className="test-controls"><p className="eyebrow">ISOLATED DATA PREVIEW</p><h1>Render a full <em>season.</em></h1><p>{message}</p><div className="test-actions"><button className="primary-button" onClick={() => setMatches(generateMonthTestMatches())}>Load 60-day sample</button><button className="quiet-button" onClick={downloadJson}>Download JSON</button><button className="quiet-button" onClick={downloadExcel}>Download Excel</button><button className="quiet-button" onClick={() => input.current?.click()}>Upload test data</button><input ref={input} hidden type="file" accept="application/json,.json,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => load(event.target.files?.[0])} /></div></section>{matches.length > 0 && <Preview matches={matches} standings={standings} pairs={pairs} />}</main>;
}

function Preview({ matches, standings, pairs }: { matches: Match[]; standings: ReturnType<typeof getStats>['standings']; pairs: ReturnType<typeof getStats>['pairs'] }) { const [tab, setTab] = useState<'standings' | 'pairs' | 'insights' | 'history'>('standings'); return <section className="preview-shell" aria-label="Read-only duplicate preview"><p className="preview-label">READ-ONLY MAIN APP PREVIEW</p><header className="topbar"><div className="brand"><span className="brand-mark">⊕</span><span>Court Ledger</span></div></header><section className="hero"><p className="eyebrow">PRIVATE BADMINTON LEDGER</p><h1>Every game. <em>Accounted for.</em></h1><p>Seven players, one dependable record. Previewing imported test data only.</p></section><nav className="tabs">{(['standings', 'pairs', 'insights', 'history'] as const).map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name[0].toUpperCase() + name.slice(1)}</button>)}</nav>{tab === 'standings' && <section className="content"><div className="section-heading"><div><p className="eyebrow">SEASON TABLE</p><h2>Overall standings</h2></div><span>{matches.length} games</span></div><div className="table-wrap"><table><thead><tr><th>Player</th><th>P</th><th>W</th><th>L</th><th>Win %</th><th title="Points scored minus points conceded">+/-</th></tr></thead><tbody>{standings.map((stat, index) => <tr key={stat.player}><td><span className="rank">{index + 1}</span>{stat.player}</td><td>{stat.played}</td><td className="win">{stat.won}</td><td className="loss">{stat.lost}</td><td><strong>{pct(stat.won, stat.played)}</strong></td><td>{stat.pointsFor - stat.pointsAgainst}</td></tr>)}</tbody></table></div></section>}{tab === 'pairs' && <section className="content"><div className="section-heading"><div><p className="eyebrow">TEAMMATE MATRIX</p><h2>Partnership record</h2></div></div><div className="matrix-wrap"><table className="matrix"><tbody>{standings.map((row, rowIndex) => <tr key={row.player}><th>{row.player}</th>{standings.map((column, columnIndex) => { const pair = pairs.get(teamKey([row.player, column.player] as Player[])); return <td key={column.player} className={columnIndex <= rowIndex ? 'matrix-disabled' : 'pair-cell'}>{columnIndex <= rowIndex ? '—' : `${pair?.played ?? 0}P · ${pair?.won ?? 0}W · ${pair?.lost ?? 0}L`}</td>; })}</tr>)}</tbody></table></div></section>}{tab === 'insights' && <section className="content"><div className="metric-grid"><article className="metric-card"><span>Games</span><strong>{matches.length}</strong><small>last 60 days</small></article><article className="metric-card"><span>Active days</span><strong>{new Set(matches.map((match) => match.playedAt.slice(0, 10))).size}</strong><small>attendance opportunity</small></article><article className="metric-card"><span>Most present</span><strong>{standings[0]?.player}</strong><small>{standings[0]?.played} games</small></article></div></section>}{tab === 'history' && <section className="content"><div className="history">{matches.slice(0, 20).map((match) => <article className="match-card" key={match.id}><div><time>{formatDate(match.playedAt)}</time><div className="match-teams"><strong>{match.teamA.join(' + ')}</strong><span>{match.scoreA} – {match.scoreB}</span><strong>{match.teamB.join(' + ')}</strong></div></div></article>)}</div></section>}</section>; }
