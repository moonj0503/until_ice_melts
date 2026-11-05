import { advance } from './session.ts';
import type { Mode, Session } from './session.ts';

export const STORAGE_KEY = 'until-ice-melts:v1';

export interface Settings { sound: boolean; mode: Mode; fixed: number; sizeCm: number; temperatureC: number }
export interface AppState { version: 1; session: Session | null; records: Session[]; settings: Settings }
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function freshState(): AppState {
  return { version: 1, session: null, records: [], settings: { sound: false, mode: 'fixed', fixed: 50, sizeCm: 3, temperatureC: 22 } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function timestamp(value: unknown): value is number {
  return nonnegative(value) && value <= 8_640_000_000_000_000;
}
function validIce(value: unknown): boolean {
  return isObject(value) && typeof value.sizeCm === 'number' && value.sizeCm >= 2 && value.sizeCm <= 5
    && Number.isInteger(value.sizeCm * 2) && typeof value.temperatureC === 'number'
    && Number.isInteger(value.temperatureC) && value.temperatureC >= 10 && value.temperatureC <= 35;
}
function validSession(value: unknown): value is Session {
  if (!isObject(value)) return false;
  const active = value.status === 'running';
  const finished = value.status === 'completed' || value.status === 'stopped';
  return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 100
    && (value.mode === 'fixed' || value.mode === 'random')
    && (active || finished || value.status === 'paused')
    && timestamp(value.startedAt) && nonnegative(value.targetMs)
    && value.targetMs >= 60_000 && value.targetMs <= 720 * 60_000 && value.targetMs % 60_000 === 0
    && nonnegative(value.elapsedMs) && value.elapsedMs <= value.targetMs
    && (active ? timestamp(value.runningSince) : value.runningSince === null)
    && (finished ? timestamp(value.finishedAt) : value.finishedAt === null)
    && (value.status !== 'completed' || value.elapsedMs === value.targetMs)
    && (value.ice === undefined || (value.mode === 'random' && validIce(value.ice)));
}
function validSettings(value: unknown): value is Settings {
  if (!isObject(value)) return false;
  return typeof value.sound === 'boolean' && (value.mode === 'fixed' || value.mode === 'random')
    && typeof value.fixed === 'number' && Number.isInteger(value.fixed) && value.fixed >= 1 && value.fixed <= 720
    && validIce(value);
}
function migrateLegacySettings(value: unknown): unknown {
  if (!isObject(value) || !isObject(value.settings)) return value;
  const s = value.settings;
  if (s.sizeCm !== undefined || s.temperatureC !== undefined) return value;
  if (![s.min, s.max].every(n => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 720)
    || Number(s.min) > Number(s.max)) return value;
  // Preserve old timers and history exactly; only replace the obsolete inputs.
  return { ...value, settings: { sound: s.sound, mode: s.mode, fixed: s.fixed, sizeCm: 3, temperatureC: 22 } };
}
function validState(value: unknown): value is AppState {
  return isObject(value) && value.version === 1 && (value.session === null || validSession(value.session))
    && Array.isArray(value.records) && value.records.every(r => validSession(r) && (r.status === 'completed' || r.status === 'stopped'))
    && validSettings(value.settings);
}

export function reconcile(state: AppState, now: number): AppState {
  const session = state.session ? advance(state.session, now) : null;
  const records = new Map(state.records.map(record => [record.id, record]));
  if (session && (session.status === 'completed' || session.status === 'stopped')) records.set(session.id, session);
  const ordered = [...records.values()].sort((a, b) => b.finishedAt! - a.finishedAt!);
  if (session === state.session && ordered.length === state.records.length
    && ordered.every((r, i) => r === state.records[i])) return state;
  return { ...state, session, records: ordered };
}

export function loadState(storage: StoragePort, now: number): { state: AppState; warning: string } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { state: freshState(), warning: '' };
    const data: unknown = migrateLegacySettings(JSON.parse(raw));
    if (!validState(data)) throw new Error('invalid state');
    return { state: reconcile(data, now), warning: '' };
  } catch {
    return { state: freshState(), warning: '저장된 기록을 읽을 수 없어요. 현재 공부는 계속할 수 있지만 기록 보관과 재접속 복원이 제한될 수 있어요.' };
  }
}

export function persistState(storage: StoragePort, state: AppState): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}
