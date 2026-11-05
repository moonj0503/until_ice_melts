export type Mode = 'fixed' | 'random';
export type Status = 'running' | 'paused' | 'completed' | 'stopped';

export interface Session {
  id: string;
  mode: Mode;
  status: Status;
  targetMs: number;
  startedAt: number;
  runningSince: number | null;
  elapsedMs: number;
  finishedAt: number | null;
}

export function validateMinutes(value: string): number {
  if (!/^\d+$/.test(value.trim())) throw new Error('시간은 1~720분 사이의 정수로 입력해 주세요.');
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) {
    throw new Error('시간은 1~720분 사이의 정수로 입력해 주세요.');
  }
  return minutes;
}

export function randomMinutes(min: number, max: number, random = Math.random): number {
  validateMinutes(String(min));
  validateMinutes(String(max));
  if (min > max) throw new Error('최대 시간은 최소 시간보다 크거나 같아야 해요.');
  return min + Math.floor(Math.min(1 - Number.EPSILON, Math.max(0, random())) * (max - min + 1));
}

export function createSession(mode: Mode, minutes: number, now: number, id: string): Session {
  validateMinutes(String(minutes));
  return { id, mode, status: 'running', targetMs: minutes * 60_000, startedAt: now,
    runningSince: now, elapsedMs: 0, finishedAt: null };
}

export function elapsed(session: Session, now: number): number {
  const active = session.status === 'running' && session.runningSince !== null
    ? Math.max(0, now - session.runningSince) : 0;
  return Math.min(session.targetMs, session.elapsedMs + active);
}

export function advance(session: Session, now: number): Session {
  if (session.status !== 'running' || elapsed(session, now) < session.targetMs) return session;
  return { ...session, status: 'completed', elapsedMs: session.targetMs, runningSince: null,
    finishedAt: session.runningSince! + (session.targetMs - session.elapsedMs) };
}

export function pause(session: Session, now: number): Session {
  const current = advance(session, now);
  if (current.status !== 'running') return current;
  return { ...current, status: 'paused', elapsedMs: elapsed(current, now), runningSince: null };
}

export function resume(session: Session, now: number): Session {
  return session.status === 'paused' ? { ...session, status: 'running', runningSince: now } : session;
}

export function stop(session: Session, now: number): Session {
  const current = advance(session, now);
  if (current.status === 'completed' || current.status === 'stopped') return current;
  return { ...current, status: 'stopped', elapsedMs: elapsed(current, now), runningSince: null, finishedAt: now };
}

export function meltShape(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  return { scale: p === 1 ? 0 : Math.cbrt(1 - p), roundness: 0.1 + p * 0.28, water: 0.18 + p * 0.82 };
}

export function formatTime(milliseconds: number): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1_000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(n => String(n).padStart(2, '0')).join(':');
}
