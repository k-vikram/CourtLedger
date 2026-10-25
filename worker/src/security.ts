import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Bindings, Member } from './types';

const encoder = new TextEncoder();
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export function randomToken(prefix = 'cl') {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `${prefix}_${btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
}

export async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function safeHashEqual(value: string, expectedHash: string) {
  const actual = await sha256(value);
  if (actual.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  return difference === 0;
}

export function sessionCookie(c: Context<AppEnv>, token: string) {
  setCookie(c, c.env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export function clearSessionCookie(c: Context<AppEnv>) {
  deleteCookie(c, c.env.COOKIE_NAME, { path: '/', secure: new URL(c.req.url).protocol === 'https:' });
}

export async function createSession(env: Bindings, memberId: string) {
  const token = randomToken('cl_session');
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, member_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), memberId, tokenHash, expiresAt, now.toISOString(), now.toISOString()).run();
  return token;
}

export async function memberFromRequest(c: Context<AppEnv>): Promise<Member | null> {
  const token = getCookie(c, c.env.COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256(token);
  return c.env.DB.prepare(`SELECT m.id, m.display_name, m.role, m.active, m.system_owner
    FROM sessions s JOIN members m ON m.id = s.member_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND m.active = 1`)
    .bind(tokenHash, new Date().toISOString()).first<Member>();
}

export function ipFor(c: Context<AppEnv>) {
  return c.req.header('CF-Connecting-IP') ?? 'local';
}

export async function enforceRateLimit(env: Bindings, key: string, limit: number, windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT window_started_at, request_count FROM rate_limits WHERE bucket_key = ?').bind(key).first<{ window_started_at: number; request_count: number }>();
  if (!row || now - row.window_started_at >= windowSeconds) {
    await env.DB.prepare(`INSERT INTO rate_limits (bucket_key, window_started_at, request_count) VALUES (?, ?, 1)
      ON CONFLICT(bucket_key) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = 1`).bind(key, now).run();
    return true;
  }
  if (row.request_count >= limit) return false;
  await env.DB.prepare('UPDATE rate_limits SET request_count = request_count + 1 WHERE bucket_key = ?').bind(key).run();
  return true;
}
