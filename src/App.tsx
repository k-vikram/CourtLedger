import { useEffect, useMemo, useRef, useState } from 'react';
import { PLAYERS, type Draft, type Match, type Player, formatDate, getStats, isPlayer, pct, teamKey } from './domain';
import { parseCommand } from './parser';
import { loadMatches, saveMatches } from './storage';
import { workbook } from './xlsx';

type Tab = 'standings' | 'pairs' | 'history';
const blankDraft = (): Draft => ({ teamA: ['Bharat', 'Vikram'], teamB: ['Gaurav', 'Sagar'], scoreA: 21, scoreB: 17, playedAt: new Date().toISOString() });

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isValidMatch(value: unknown): value is Match {
  if (!value || typeof value !== 'object') return false;
  const match = value as Partial<Match>;
  return typeof match.id === 'string'
    && typeof match.playedAt === 'string'
    && typeof match.createdAt === 'string'
    && Array.isArray(match.teamA) && match.teamA.length === 2 && match.teamA.every(isPlayer)
    && Array.isArray(match.teamB) && match.teamB.length === 2 && match.teamB.every(isPlayer)
    && new Set([...(match.teamA ?? []), ...(match.teamB ?? [])]).size === 4
    && typeof match.scoreA === 'number' && Number.isFinite(match.scoreA)
    && typeof match.scoreB === 'number' && Number.isFinite(match.scoreB) && match.scoreA !== match.scoreB;
}

function download(name: string, contents: string, type: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([contents], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function App() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('standings');
  const [modalOpen, setModalOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [parseMessage, setParseMessage] = useState('Use your keyboard microphone, or type a result in plain language.');
  const [entryMode, setEntryMode] = useState<'command' | 'manual'>('command');
  const [notice, setNotice] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMatches().then((data) => setMatches(data.sort((a, b) => b.playedAt.localeCompare(a.playedAt)))).catch(() => setNotice('Local storage was unavailable.')).finally(() => setLoaded(true));
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  const persist = async (next: Match[]) => {
    setMatches(next);
    await saveMatches(next);
  };
  const { standings, pairs } = useMemo(() => getStats(matches), [matches]);

  const openEntry = () => {
    setCommand(''); setDraft(blankDraft()); setEntryMode('command'); setParseMessage('Use your keyboard microphone, or type a result in plain language.'); setModalOpen(true);
  };
  const handleCommand = (value: string) => {
    setCommand(value);
    const result = parseCommand(value);
    setParseMessage(result.message);
    if (result.draft) setDraft(result.draft);
  };
  const setPlayer = (side: 'teamA' | 'teamB', position: 0 | 1, player: Player) => {
    setDraft((current) => ({ ...current, [side]: current[side].map((name, index) => index === position ? player : name) as [Player, Player] }));
  };
  const validDraft = new Set([...draft.teamA, ...draft.teamB]).size === 4 && draft.scoreA >= 0 && draft.scoreB >= 0 && draft.scoreA !== draft.scoreB;
  const saveDraft = async () => {
    if (!validDraft) { setParseMessage('Use four different players and two different scores.'); return; }
    const candidate: Match = { ...draft, id: makeId(), createdAt: new Date().toISOString() };
    const duplicate = matches.some((match) => teamKey(match.teamA) === teamKey(candidate.teamA) && teamKey(match.teamB) === teamKey(candidate.teamB) && match.scoreA === candidate.scoreA && match.scoreB === candidate.scoreB && Math.abs(new Date(match.playedAt).getTime() - new Date(candidate.playedAt).getTime()) < 10 * 60_000);
    if (duplicate && !window.confirm('A matching result was recorded within the last 10 minutes. Save it anyway?')) return;
    await persist([candidate, ...matches]);
    setModalOpen(false); setNotice('Match saved on this device.');
  };
  const exportData = () => download(`court-ledger-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), matches }, null, 2), 'application/json');
  const exportExcel = () => {
    const matrix: Array<Array<string | number>> = [['Player', ...PLAYERS]];
    PLAYERS.forEach((row, rowIndex) => matrix.push([row, ...PLAYERS.map((column, colIndex) => {
      if (colIndex <= rowIndex) return '—';
      const stat = pairs.get(teamKey([row, column] as Player[]));
      return stat ? `${stat.played} P · ${stat.won} W · ${stat.lost} L` : '—';
    })]));
    const report = workbook([
      { name: 'Standings', rows: [['Player', 'Played', 'Won', 'Lost', 'Win %', 'Points for', 'Points against', 'Point difference'], ...standings.map((stat) => [stat.player, stat.played, stat.won, stat.lost, stat.played ? stat.won / stat.played : 0, stat.pointsFor, stat.pointsAgainst, stat.pointsFor - stat.pointsAgainst])] },
      { name: 'Partner matrix', rows: matrix },
      { name: 'Matches', rows: [['Match ID', 'Played at', 'Team A player 1', 'Team A player 2', 'Team B player 1', 'Team B player 2', 'A score', 'B score', 'Original input'], ...matches.map((match) => [match.id, match.playedAt, match.teamA[0], match.teamA[1], match.teamB[0], match.teamB[1], match.scoreA, match.scoreB, match.command ?? ''])] },
    ]);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(report); link.download = `court-ledger-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click(); URL.revokeObjectURL(link.href);
  };
  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.matches)) throw new Error('Invalid backup');
      const valid = data.matches.filter(isValidMatch);
      await persist(valid.sort((a: Match, b: Match) => b.playedAt.localeCompare(a.playedAt)));
      setNotice(`${valid.length} matches restored from backup.`);
    } catch { setNotice('That file is not a Court Ledger backup.'); }
  };
  const deleteMatch = async (id: string) => {
    if (!window.confirm('Remove this match from this device? You can restore it only from a backup.')) return;
    await persist(matches.filter((match) => match.id !== id));
    setNotice('Match removed.');
  };

  if (!loaded) return <main className="loading">Loading your local ledger…</main>;
  return <main>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">⊕</span><span>Court Ledger</span></div>
      <div className="header-actions"><button className="quiet-button" onClick={exportExcel}>Excel</button><button className="quiet-button" onClick={exportData}>Backup</button></div>
    </header>
    <section className="hero">
      <p className="eyebrow">PRIVATE BADMINTON LEDGER</p>
      <h1>Every game. <em>Accounted for.</em></h1>
      <p>Seven players, one dependable record. Stored only on this device.</p>
      <button className="primary-button" onClick={openEntry}><span>＋</span> Add match</button>
    </section>
    {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <nav className="tabs" aria-label="Ledger views">
      <button className={tab === 'standings' ? 'active' : ''} onClick={() => setTab('standings')}>Standings</button>
      <button className={tab === 'pairs' ? 'active' : ''} onClick={() => setTab('pairs')}>Pairings</button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
    </nav>
    {tab === 'standings' && <section className="content"><div className="section-heading"><div><p className="eyebrow">SEASON TABLE</p><h2>Overall standings</h2></div><span>{matches.length} games</span></div>
      <div className="table-wrap"><table><thead><tr><th>Player</th><th>P</th><th>W</th><th>L</th><th>Win %</th><th>+/-</th></tr></thead><tbody>{standings.map((stat, index) => <tr key={stat.player}><td><span className="rank">{index + 1}</span>{stat.player}</td><td>{stat.played}</td><td className="win">{stat.won}</td><td className="loss">{stat.lost}</td><td><strong>{pct(stat.won, stat.played)}</strong></td><td className={(stat.pointsFor - stat.pointsAgainst) >= 0 ? 'positive' : 'negative'}>{(stat.pointsFor - stat.pointsAgainst) > 0 ? '+' : ''}{stat.pointsFor - stat.pointsAgainst}</td></tr>)}</tbody></table></div>
      {matches.length === 0 && <EmptyState onAdd={openEntry} />}</section>}
    {tab === 'pairs' && <section className="content"><div className="section-heading"><div><p className="eyebrow">TEAMMATE MATRIX</p><h2>Better together</h2></div><span>P · W · L</span></div><PairMatrix pairs={pairs} /></section>}
    {tab === 'history' && <section className="content"><div className="section-heading"><div><p className="eyebrow">SOURCE OF TRUTH</p><h2>Match history</h2></div><span>{matches.length} total</span></div>
      {matches.length ? <div className="history">{matches.map((match) => <article className="match-card" key={match.id}><div><time>{formatDate(match.playedAt)}</time><div className="match-teams"><strong className={match.scoreA > match.scoreB ? 'winner' : ''}>{match.teamA.join(' + ')}</strong><span>{match.scoreA} – {match.scoreB}</span><strong className={match.scoreB > match.scoreA ? 'winner' : ''}>{match.teamB.join(' + ')}</strong></div>{match.command && <p className="command-echo">“{match.command}”</p>}</div><button className="remove" aria-label="Remove match" onClick={() => deleteMatch(match.id)}>×</button></article>)}</div> : <EmptyState onAdd={openEntry} />}
      <div className="backup-panel"><div><strong>Portable by design</strong><p>Export a JSON backup before changing phones. An Excel workbook is also available for sharing or review.</p></div><div><button className="quiet-button" onClick={exportExcel}>Export Excel</button><button className="quiet-button" onClick={exportData}>Export JSON</button><button className="quiet-button" onClick={() => importRef.current?.click()}>Import JSON</button><input ref={importRef} hidden type="file" accept="application/json" onChange={(event) => importData(event.target.files?.[0])} /></div></div>
    </section>}
    {modalOpen && <div className="overlay" role="dialog" aria-modal="true" aria-label="Add match"><section className="modal"><button className="close" onClick={() => setModalOpen(false)}>×</button><p className="eyebrow">NEW RESULT</p><h2>Record a match</h2><div className="entry-toggle"><button className={entryMode === 'command' ? 'selected' : ''} onClick={() => setEntryMode('command')}>Say or type</button><button className={entryMode === 'manual' ? 'selected' : ''} onClick={() => setEntryMode('manual')}>Manual form</button></div>
      {entryMode === 'command' && <><label className="command-field"><span>🎙 Use your keyboard microphone, or type</span><textarea autoFocus value={command} onChange={(event) => handleCommand(event.target.value)} placeholder="Bharat and Vikram beat Gaurav and Sagar 21 17" /></label><p className="parse-message">{parseMessage}</p></>}
      <div className="draft-card"><div className="team-editor"><span>TEAM A</span><PlayerSelect value={draft.teamA[0]} onChange={(value) => setPlayer('teamA', 0, value)} /><PlayerSelect value={draft.teamA[1]} onChange={(value) => setPlayer('teamA', 1, value)} /><input aria-label="Team A score" type="number" min="0" max="99" value={draft.scoreA} onChange={(event) => setDraft({ ...draft, scoreA: Number(event.target.value) })} /></div><div className="versus">VS</div><div className="team-editor"><span>TEAM B</span><PlayerSelect value={draft.teamB[0]} onChange={(value) => setPlayer('teamB', 0, value)} /><PlayerSelect value={draft.teamB[1]} onChange={(value) => setPlayer('teamB', 1, value)} /><input aria-label="Team B score" type="number" min="0" max="99" value={draft.scoreB} onChange={(event) => setDraft({ ...draft, scoreB: Number(event.target.value) })} /></div></div>
      <button className="primary-button confirm" disabled={!validDraft} onClick={saveDraft}>Confirm result</button><p className="privacy-note">This saves only to this device. Backup from History.</p>
    </section></div>}
  </main>;
}

function PlayerSelect({ value, onChange }: { value: Player; onChange: (value: Player) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as Player)}>{PLAYERS.map((player) => <option key={player}>{player}</option>)}</select>;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <div className="empty"><span>⌁</span><h3>The court is waiting.</h3><p>Your first confirmed game will build the standings and partnership matrix.</p><button className="quiet-button" onClick={onAdd}>Record the first match</button></div>;
}

function PairMatrix({ pairs }: { pairs: Map<string, { played: number; won: number; lost: number }> }) {
  return <div className="matrix-wrap"><table className="matrix"><thead><tr><th></th>{PLAYERS.map((player) => <th key={player}>{player.slice(0, 1)}</th>)}</tr></thead><tbody>{PLAYERS.map((row, rowIndex) => <tr key={row}><th>{row}</th>{PLAYERS.map((column, colIndex) => { if (colIndex <= rowIndex) return <td className="matrix-disabled" key={column}>—</td>; const pair = pairs.get(teamKey([row, column] as Player[])); return <td key={column} className={pair?.played ? '' : 'matrix-empty'}>{pair?.played ? <><b>{pair.played}</b><span className="win">{pair.won}W</span><span className="loss">{pair.lost}L</span></> : '—'}</td>; })}</tr>)}</tbody></table><p className="matrix-note">Each cell records games played together, then wins and losses.</p></div>;
}
