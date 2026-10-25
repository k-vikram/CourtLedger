import type { Draft, Match } from './domain';

export type ApiMember = { id: string; displayName: string; role: 'owner' | 'scorer'; isSystemOwner?: boolean };

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const sharedApiConfigured = import.meta.env.VITE_SHARED_MODE === 'true';

class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
    throw new ApiError(response.status, payload?.error?.message ?? `Request failed (${response.status}).`, payload?.error?.code);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

const mutationHeaders = () => ({ 'Idempotency-Key': crypto.randomUUID() });
const bodyFor = (match: Draft | Match) => ({ playedAt: match.playedAt, teamA: match.teamA, teamB: match.teamB, scoreA: match.scoreA, scoreB: match.scoreB, winner: match.winner, command: match.command });

export async function getSession() { return request<{ member: ApiMember }>('/api/v1/session'); }
export async function recoverOwner(token: string) { return request<{ member: ApiMember }>('/api/v1/auth/owner-recover', { method: 'POST', body: JSON.stringify({ token }) }); }
export async function redeemInvite(token: string) { return request<{ member: ApiMember }>('/api/v1/invites/redeem', { method: 'POST', body: JSON.stringify({ token }) }); }
export async function logout() { return request<void>('/api/v1/sessions/logout', { method: 'POST', body: '{}' }); }
export async function loadSharedMatches() { return (await request<{ matches: Match[] }>('/api/v1/matches?limit=500')).matches; }
export async function createSharedMatch(draft: Draft) { return (await request<{ match: Match }>('/api/v1/matches', { method: 'POST', headers: mutationHeaders(), body: JSON.stringify(bodyFor(draft)) })).match; }
export async function updateSharedMatch(match: Match) { return (await request<{ match: Match }>(`/api/v1/matches/${encodeURIComponent(match.id)}`, { method: 'PATCH', headers: mutationHeaders(), body: JSON.stringify({ ...bodyFor(match), revision: match.revision ?? 1 }) })).match; }
export async function deleteSharedMatch(match: Match) { return request<{ deleted: boolean }>(`/api/v1/matches/${encodeURIComponent(match.id)}`, { method: 'DELETE', headers: mutationHeaders(), body: JSON.stringify({ revision: match.revision ?? 1 }) }); }
export async function createInvite(displayName: string) { return (await request<{ invite: { token: string; displayName: string; expiresAt: string } }>('/api/v1/admin/invites', { method: 'POST', body: JSON.stringify({ displayName }) })).invite; }

export function readableApiError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return 'The shared service could not be reached. Your cached data remains on this device.';
}
