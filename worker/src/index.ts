import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import { clearSessionCookie, createSession, enforceRateLimit, ipFor, memberFromRequest, randomToken, safeHashEqual, sessionCookie, sha256 } from './security';
import type { AppEnv, Member } from './types';
import { matchInput, matchUpdateInput, validateMatch, type MatchInput } from './validation';

const app = new Hono<AppEnv>();
const now = () => new Date().toISOString();
type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500;
const fail = (c: Context<AppEnv>, status: ErrorStatus, code: string, message: string) =>
  c.json({ error: { code, message, requestId: c.get('requestId') } }, status);

app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  c.header('X-Request-Id', c.get('requestId'));
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Cache-Control', 'no-store');
  await next();
});

app.use('*', async (c, next) => {
  const origins = [new URL(c.req.url).origin, ...c.env.APP_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)];
  return cors({ origin: (origin) => origins.includes(origin) ? origin : '', credentials: true, allowHeaders: ['Content-Type', 'Idempotency-Key'], allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] })(c, next);
});

app.use('*', async (c, next) => {
  if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(c.req.method)) {
    const contentLength = Number(c.req.header('content-length') ?? 0);
    if (contentLength > 16_384) return fail(c, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    const origin = c.req.header('origin');
    const allowedOrigins = [new URL(c.req.url).origin, ...c.env.APP_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)];
    if (origin && !allowedOrigins.includes(origin)) return fail(c, 403, 'ORIGIN_NOT_ALLOWED', 'This app origin is not allowed.');
  }
  await next();
});

app.get('/health', (c) => c.json({ ok: true, service: 'court-ledger-api' }));

const tokenBody = z.object({ token: z.string().min(32).max(256) }).strict();

app.post('/api/v1/auth/owner-recover', async (c) => {
  if (!await enforceRateLimit(c.env, `owner:${ipFor(c)}`, 5, 900)) return fail(c, 429, 'RATE_LIMITED', 'Too many recovery attempts. Try later.');
  const parsed = tokenBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || !c.env.OWNER_RECOVERY_TOKEN_HASH || !await safeHashEqual(parsed.data.token, c.env.OWNER_RECOVERY_TOKEN_HASH)) {
    return fail(c, 401, 'INVALID_RECOVERY_TOKEN', 'The owner recovery token is invalid.');
  }
  await c.env.DB.prepare(`UPDATE members SET display_name = ?, role = 'owner', active = 1, system_owner = 1, updated_at = ? WHERE id = 'owner-vikram'`)
    .bind(c.env.OWNER_NAME, now()).run();
  const token = await createSession(c.env, 'owner-vikram');
  sessionCookie(c, token);
  await audit(c, 'owner.recovered', 'member', 'owner-vikram', 'success', 'owner-vikram');
  return c.json({ member: { id: 'owner-vikram', displayName: c.env.OWNER_NAME, role: 'owner' } });
});

app.post('/api/v1/invites/redeem', async (c) => {
  if (!await enforceRateLimit(c.env, `invite:${ipFor(c)}`, 5, 900)) return fail(c, 429, 'RATE_LIMITED', 'Too many invite attempts. Try later.');
  const parsed = tokenBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 400, 'INVALID_INVITE', 'The invite is invalid.');
  const tokenHash = await sha256(parsed.data.token);
  const redeemedAt = now();
  const invite = await c.env.DB.prepare(`UPDATE invites SET redeemed_at = ? WHERE id = (
      SELECT i.id FROM invites i JOIN members m ON m.id = i.member_id
      WHERE i.token_hash = ? AND i.redeemed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ? AND m.active = 1
    ) AND redeemed_at IS NULL RETURNING id, member_id`).bind(redeemedAt, tokenHash, redeemedAt).first<{ id: string; member_id: string }>();
  if (!invite) return fail(c, 401, 'INVALID_INVITE', 'The invite is invalid, expired, or already used.');
  const sessionToken = await createSession(c.env, invite.member_id);
  sessionCookie(c, sessionToken);
  await audit(c, 'invite.redeemed', 'invite', invite.id, 'success', invite.member_id);
  const member = await c.env.DB.prepare('SELECT id, display_name, role FROM members WHERE id = ?').bind(invite.member_id).first<{ id: string; display_name: string; role: string }>();
  return c.json({ member: { id: member!.id, displayName: member!.display_name, role: member!.role } });
});

app.use('/api/v1/*', async (c, next) => {
  const member = await memberFromRequest(c);
  if (!member) return fail(c, 401, 'UNAUTHENTICATED', 'Sign in with an invite or owner recovery token.');
  c.set('member', member);
  await next();
});

app.get('/api/v1/session', (c) => {
  const member = c.get('member');
  return c.json({ member: publicMember(member) });
});

app.post('/api/v1/sessions/logout', async (c) => {
  const token = getCookie(c, c.env.COOKIE_NAME);
  if (token) await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').bind(now(), await sha256(token)).run();
  clearSessionCookie(c);
  return c.body(null, 204);
});

app.get('/api/v1/players', async (c) => {
  const result = await c.env.DB.prepare('SELECT id, display_name AS displayName FROM players WHERE active = 1 ORDER BY display_name').all();
  return c.json({ players: result.results });
});

app.get('/api/v1/matches', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 250)));
  const clauses = ['m.deleted_at IS NULL'];
  const bindings: unknown[] = [];
  if (from) { clauses.push('m.played_at >= ?'); bindings.push(`${from}T00:00:00.000Z`); }
  if (to) { clauses.push('m.played_at <= ?'); bindings.push(`${to}T23:59:59.999Z`); }
  bindings.push(limit);
  const result = await c.env.DB.prepare(`${MATCH_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY m.played_at DESC LIMIT ?`).bind(...bindings).all();
  return c.json({ matches: result.results.map(mapMatch) });
});

app.get('/api/v1/matches/:id', async (c) => {
  const row = await c.env.DB.prepare(`${MATCH_SELECT} WHERE m.id = ? AND m.deleted_at IS NULL`).bind(c.req.param('id')).first<Record<string, unknown>>();
  return row ? c.json({ match: mapMatch(row) }) : fail(c, 404, 'MATCH_NOT_FOUND', 'Match not found.');
});

app.post('/api/v1/matches', async (c) => {
  const member = c.get('member');
  if (!await enforceRateLimit(c.env, `match:${member.id}`, 10, 60)) return fail(c, 429, 'RATE_LIMITED', 'Too many match changes. Try again shortly.');
  const raw = await c.req.json().catch(() => null);
  const parsed = matchInput.safeParse(raw);
  if (!parsed.success) return fail(c, 422, 'INVALID_MATCH', 'The match data is incomplete or malformed.');
  const domainError = validateMatch(parsed.data);
  if (domainError) return fail(c, 422, 'INVALID_MATCH', domainError);
  const idempotency = await beginIdempotency(c, parsed.data);
  if ('response' in idempotency) return idempotency.response;
  const playerIds = await resolvePlayers(c, parsed.data);
  if (!playerIds) return fail(c, 422, 'UNKNOWN_PLAYER', 'Every selected player must be active.');
  const createdAt = now();
  const matchId = crypto.randomUUID();
  const match = { id: matchId, ...parsed.data, revision: 1, createdAt };
  const responseBody = JSON.stringify({ match });
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO matches (id, played_at, team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2, score_a, score_b, winner, command, revision, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(matchId, parsed.data.playedAt, playerIds[0], playerIds[1], playerIds[2], playerIds[3], parsed.data.scoreA, parsed.data.scoreB, parsed.data.winner, parsed.data.command ?? null, member.id, createdAt),
    auditStatement(c, 'match.created', 'match', matchId, 'success', member.id),
    idempotencyStatement(c, idempotency.keyHash, idempotency.requestHash, 201, matchId, responseBody, member.id),
  ]);
  return new Response(responseBody, { status: 201, headers: { 'content-type': 'application/json', 'x-request-id': c.get('requestId') } });
});

app.patch('/api/v1/matches/:id', async (c) => {
  const member = c.get('member');
  if (!await enforceRateLimit(c.env, `match:${member.id}`, 10, 60)) return fail(c, 429, 'RATE_LIMITED', 'Too many match changes. Try again shortly.');
  const raw = await c.req.json().catch(() => null);
  const parsed = matchUpdateInput.safeParse(raw);
  if (!parsed.success) return fail(c, 422, 'INVALID_MATCH', 'The match data or revision is malformed.');
  const domainError = validateMatch(parsed.data);
  if (domainError) return fail(c, 422, 'INVALID_MATCH', domainError);
  const idempotency = await beginIdempotency(c, parsed.data);
  if ('response' in idempotency) return idempotency.response;
  const playerIds = await resolvePlayers(c, parsed.data);
  if (!playerIds) return fail(c, 422, 'UNKNOWN_PLAYER', 'Every selected player must be active.');
  const updatedAt = now();
  const result = await c.env.DB.prepare(`UPDATE matches SET played_at = ?, team_a_player_1 = ?, team_a_player_2 = ?, team_b_player_1 = ?, team_b_player_2 = ?, score_a = ?, score_b = ?, winner = ?, command = ?, revision = revision + 1, updated_at = ?
    WHERE id = ? AND revision = ? AND deleted_at IS NULL`).bind(parsed.data.playedAt, playerIds[0], playerIds[1], playerIds[2], playerIds[3], parsed.data.scoreA, parsed.data.scoreB, parsed.data.winner, parsed.data.command ?? null, updatedAt, c.req.param('id'), parsed.data.revision).run();
  if (!result.meta.changes) return fail(c, 409, 'STALE_REVISION', 'The match was changed or removed. Refresh before editing.');
  const updated = await c.env.DB.prepare(`${MATCH_SELECT} WHERE m.id = ? AND m.deleted_at IS NULL`).bind(c.req.param('id')).first<Record<string, unknown>>();
  const responseBody = JSON.stringify({ match: mapMatch(updated!) });
  await c.env.DB.batch([
    auditStatement(c, 'match.updated', 'match', c.req.param('id'), 'success', member.id),
    idempotencyStatement(c, idempotency.keyHash, idempotency.requestHash, 200, c.req.param('id'), responseBody, member.id),
  ]);
  return new Response(responseBody, { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': c.get('requestId') } });
});

app.delete('/api/v1/matches/:id', async (c) => {
  const member = c.get('member');
  const raw = await c.req.json().catch(() => null);
  const parsed = z.object({ revision: z.number().int().positive() }).strict().safeParse(raw);
  if (!parsed.success) return fail(c, 422, 'INVALID_REVISION', 'A valid match revision is required.');
  const idempotency = await beginIdempotency(c, parsed.data);
  if ('response' in idempotency) return idempotency.response;
  const result = await c.env.DB.prepare('UPDATE matches SET deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND deleted_at IS NULL')
    .bind(now(), now(), c.req.param('id'), parsed.data.revision).run();
  if (!result.meta.changes) return fail(c, 409, 'STALE_REVISION', 'The match was changed or already removed.');
  const responseBody = JSON.stringify({ deleted: true, id: c.req.param('id') });
  await c.env.DB.batch([
    auditStatement(c, 'match.deleted', 'match', c.req.param('id'), 'success', member.id),
    idempotencyStatement(c, idempotency.keyHash, idempotency.requestHash, 200, c.req.param('id'), responseBody, member.id),
  ]);
  return c.json({ deleted: true, id: c.req.param('id') });
});

app.use('/api/v1/admin/*', async (c, next) => {
  if (c.get('member').role !== 'owner') return fail(c, 403, 'FORBIDDEN', 'Owner access is required.');
  await next();
});

app.post('/api/v1/admin/invites', async (c) => {
  const parsed = z.object({ displayName: z.string().trim().min(2).max(60) }).strict().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return fail(c, 422, 'INVALID_MEMBER', 'Enter a valid member name.');
  const token = randomToken('cl_invite');
  const memberId = crypto.randomUUID();
  const inviteId = crypto.randomUUID();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO members (id, display_name, role, active, system_owner, created_at, updated_at) VALUES (?, ?, 'scorer', 1, 0, ?, ?)`).bind(memberId, parsed.data.displayName, createdAt, createdAt),
    c.env.DB.prepare('INSERT INTO invites (id, member_id, token_hash, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(inviteId, memberId, await sha256(token), expiresAt, c.get('member').id, createdAt),
    auditStatement(c, 'invite.created', 'invite', inviteId, 'success', c.get('member').id),
  ]);
  return c.json({ invite: { token, displayName: parsed.data.displayName, expiresAt } }, 201);
});

app.post('/api/v1/admin/sessions/:id/revoke', async (c) => {
  await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').bind(now(), c.req.param('id')).run();
  await audit(c, 'session.revoked', 'session', c.req.param('id'), 'success', c.get('member').id);
  return c.json({ revoked: true });
});

app.get('/api/v1/admin/audit', async (c) => {
  const result = await c.env.DB.prepare('SELECT id, actor_member_id AS actorMemberId, action, target_type AS targetType, target_id AS targetId, outcome, request_id AS requestId, created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ events: result.results });
});

app.notFound((c) => fail(c, 404, 'NOT_FOUND', 'API route not found.'));
app.onError((error, c) => {
  console.error(JSON.stringify({ requestId: c.get('requestId'), error: error instanceof Error ? error.message : 'unknown' }));
  return fail(c, 500, 'INTERNAL_ERROR', 'The service could not complete the request.');
});

const MATCH_SELECT = `SELECT m.id, m.played_at AS playedAt, a1.display_name AS a1, a2.display_name AS a2, b1.display_name AS b1, b2.display_name AS b2,
  m.score_a AS scoreA, m.score_b AS scoreB, m.winner, m.command, m.revision, m.created_at AS createdAt, m.updated_at AS updatedAt
  FROM matches m
  JOIN players a1 ON a1.id = m.team_a_player_1 JOIN players a2 ON a2.id = m.team_a_player_2
  JOIN players b1 ON b1.id = m.team_b_player_1 JOIN players b2 ON b2.id = m.team_b_player_2`;

function mapMatch(row: Record<string, unknown>) {
  return { id: row.id, playedAt: row.playedAt, teamA: [row.a1, row.a2], teamB: [row.b1, row.b2], scoreA: row.scoreA, scoreB: row.scoreB, winner: row.winner, command: row.command ?? undefined, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt ?? undefined };
}

function publicMember(member: Member) {
  return { id: member.id, displayName: member.display_name, role: member.role, isSystemOwner: Boolean(member.system_owner) };
}

async function resolvePlayers(c: Context<AppEnv>, input: MatchInput) {
  const names = [...input.teamA, ...input.teamB];
  const placeholders = names.map(() => '?').join(',');
  const result = await c.env.DB.prepare(`SELECT id, display_name FROM players WHERE active = 1 AND display_name IN (${placeholders})`).bind(...names).all<{ id: string; display_name: string }>();
  const mapping = new Map(result.results.map((row) => [row.display_name, row.id]));
  const ids = names.map((name) => mapping.get(name));
  return ids.every(Boolean) ? ids as [string, string, string, string] : null;
}

async function beginIdempotency(c: Context<AppEnv>, body: unknown) {
  const rawKey = c.req.header('Idempotency-Key');
  if (!rawKey || rawKey.length < 16 || rawKey.length > 200) return { response: fail(c, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.') };
  const keyHash = await sha256(`${c.get('member').id}:${rawKey}`);
  const requestHash = await sha256(`${c.req.method}:${c.req.path}:${JSON.stringify(body)}`);
  const existing = await c.env.DB.prepare('SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE key_hash = ? AND expires_at > ?').bind(keyHash, now()).first<{ request_hash: string; response_status: number; response_body: string }>();
  if (existing) {
    if (existing.request_hash !== requestHash) return { response: fail(c, 409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for another request.') };
    return { response: new Response(existing.response_body, { status: existing.response_status, headers: { 'content-type': 'application/json', 'x-idempotent-replay': 'true' } }) };
  }
  return { keyHash, requestHash };
}

function idempotencyStatement(c: Context<AppEnv>, keyHash: string, requestHash: string, status: number, resourceId: string, body: string, memberId: string) {
  const expiresAt = new Date(Date.now() + 86400000).toISOString();
  return c.env.DB.prepare('INSERT INTO idempotency_keys (key_hash, member_id, request_hash, response_status, resource_id, response_body, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(keyHash, memberId, requestHash, status, resourceId, body, expiresAt, now());
}

function auditStatement(c: Context<AppEnv>, action: string, targetType: string, targetId: string | null, outcome: string, actorId: string | null) {
  return c.env.DB.prepare('INSERT INTO audit_events (id, actor_member_id, action, target_type, target_id, outcome, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), actorId, action, targetType, targetId, outcome, c.get('requestId'), now());
}

async function audit(c: Context<AppEnv>, action: string, targetType: string, targetId: string | null, outcome: string, actorId: string | null) {
  await auditStatement(c, action, targetType, targetId, outcome, actorId).run();
}

export default app;
