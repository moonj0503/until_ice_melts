export type Mode = 'fixed' | 'random';
export type Status = 'running' | 'paused' | 'completed' | 'stopped';
export interface IceConditions { sizeCm: number; temperatureC: number }

export interface Session {
  id: string;
  mode: Mode;
  status: Status;
  targetMs: number;
  startedAt: number;
  runningSince: number | null;
  elapsedMs: number;
  finishedAt: number | null;
  ice?: IceConditions;
}

export function validateMinutes(value: string): number {
  if (!/^\d+$/.test(value.trim())) throw new Error('시간은 1~720분 사이의 정수로 입력해 주세요.');
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) {
    throw new Error('시간은 1~720분 사이의 정수로 입력해 주세요.');
  }
  return minutes;
}

export function validateIceSize(value: string): number {
  const size = Number(value);
  if (!/^\d+(?:\.\d+)?$/.test(value.trim()) || !Number.isFinite(size) || size < 2 || size > 5 || !Number.isInteger(size * 2)) {
    throw new Error('얼음 크기는 2~5cm 사이에서 0.5cm 단위로 정해 주세요.');
  }
  return size;
}

export function validateTemperature(value: string): number {
  const temperature = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isInteger(temperature) || temperature < 10 || temperature > 35) {
    throw new Error('주변 온도는 10~35°C 사이의 정수로 정해 주세요.');
  }
  return temperature;
}

/** Calibrated study simulation: larger cubes take longer, warmer air melts faster.
 *  3cm at 22°C is centered on 50 minutes, with +/-10% session variation.
 *  This deliberately omits real-world airflow, humidity and container physics.
 */
export function challengeMinutes(sizeCm: number, temperatureC: number, random = Math.random): number {
  validateIceSize(String(sizeCm));
  validateTemperature(String(temperatureC));
  const variation = Math.max(0, Math.min(1, random()));
  if (!Number.isFinite(variation)) throw new Error('공부 시간을 정하지 못했어요. 다시 시도해 주세요.');
  return Math.round(50 * (sizeCm / 3) * (22 / temperatureC) * (0.9 + variation * 0.2));
}

export function createIceSession(ice: IceConditions, now: number, id: string, random = Math.random): Session {
  return { ...createSession('random', challengeMinutes(ice.sizeCm, ice.temperatureC, random), now, id), ice: { ...ice } };
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
