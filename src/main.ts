import './style.css';
import { createSession, createIceSession, elapsed, formatTime, pause, resume, stop, validateMinutes, validateIceSize, validateTemperature } from './session.ts';
import { loadState, persistState, reconcile, STORAGE_KEY } from './storage.ts';
import type { Mode, Session } from './session.ts';
import { CompletionSound } from './audio.ts';

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

const port = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
};
const restored = loadState(port, Date.now());
let state = restored.state;
let storageWarning = restored.warning;
let scene: { update(progress: number, seed?: string, initialScale?: number): void; dispose(): void } | null = null;
let lastStatus = '';
const sound = new CompletionSound();
const form = element<HTMLFormElement>('study-form');
const fixedInput = element<HTMLInputElement>('fixed-minutes');
const sizeInput = element<HTMLInputElement>('ice-size');
const temperatureInput = element<HTMLInputElement>('air-temperature');
const soundToggle = element<HTMLInputElement>('sound-toggle');
const dialog = element<HTMLDialogElement>('history-dialog');
fixedInput.value = String(state.settings.fixed);
sizeInput.value = String(state.settings.sizeCm);
temperatureInput.value = String(state.settings.temperatureC);
soundToggle.checked = state.settings.sound;

function persist() {
  if (!persistState(port, state)) {
    storageWarning = '기록을 저장할 수 없어요. 공부는 계속할 수 있지만 새로고침하거나 창을 닫으면 기록이 사라질 수 있어요.';
  }
  element('storage-warning').textContent = storageWarning;
  element('storage-warning').hidden = !storageWarning;
}

function setMode(mode: Mode) {
  state = { ...state, settings: { ...state.settings, mode } };
  for (const option of ['fixed', 'random'] as const) {
    const button = element(`mode-${option}`);
    button.classList.toggle('selected', option === mode);
    button.setAttribute('aria-pressed', String(option === mode));
  }
  element('fixed-fields').hidden = mode !== 'fixed';
  element('random-fields').hidden = mode !== 'random';
  element('time-help').textContent = mode === 'random'
    ? '큰 얼음일수록, 주변 온도가 낮을수록 천천히 녹아요.' : '1~720분 사이에서 정해 주세요.';
  element('form-error').hidden = true;
  [fixedInput, sizeInput, temperatureInput].forEach(input => input.removeAttribute('aria-invalid'));
}

function previewScale(): number {
  if (state.settings.mode !== 'random') return 1;
  try { return Math.cbrt(validateIceSize(sizeInput.value) / 3); }
  catch { return Math.cbrt(state.settings.sizeCm / 3); }
}

function render(now = Date.now()) {
  element('ice-size-value').textContent = `${sizeInput.value} cm`;
  element('temperature-value').textContent = `${temperatureInput.value} °C`;
  sizeInput.setAttribute('aria-valuetext', `${sizeInput.value} cm`);
  temperatureInput.setAttribute('aria-valuetext', `${temperatureInput.value} °C`);
  const session = state.session;
  const status = session?.status ?? 'setup';
  document.body.dataset.status = status;
  document.body.dataset.mode = state.settings.mode;
  element('setup-panel').hidden = !!session;
  element('active-panel').hidden = !session;
  const done = status === 'completed' || status === 'stopped';
  element('session-actions').hidden = done;
  element('new-session').hidden = !done;
  element('headline').textContent = status === 'completed' ? '한 조각의 집중을 마쳤어요.'
    : status === 'stopped' ? '여기까지도 소중한 시간이에요.'
    : status === 'paused' ? '잠시, 숨을 고르는 시간.' : '얼음이 녹을 때까지.';
  element('subtitle').textContent = status === 'completed' ? '얼음은 녹고, 오늘의 시간은 남았어요.'
    : status === 'stopped' ? '공부한 시간은 기록에 남겨두었어요.'
    : status === 'paused' ? '쉬는 동안 얼음과 시간도 멈춰 있어요.'
    : session ? '서두르지 말고, 하던 공부를 이어가세요.' : '지금은, 눈앞의 한 가지에만.';

  if (session) {
    const ms = elapsed(session, now);
    element('elapsed').textContent = formatTime(ms);
    element('session-label').textContent = done ? '공부한 시간' : session.mode === 'random' ? '랜덤 챌린지' : '집중한 시간';
    element('pause-session').textContent = status === 'paused' ? '다시 집중하기' : '잠깐 쉬기';
    const sessionHint = status === 'paused' ? '준비되면 다시 이어가요.'
      : done ? ''
      : session.ice ? `얼음 ${session.ice.sizeCm}cm · 주변 ${session.ice.temperatureC}°C`
      : session.mode === 'random' ? '언제 끝날지는 몰라도, 지금의 집중은 쌓이고 있어요.'
      : '';
    element('session-hint').textContent = sessionHint;
    element('session-hint').hidden = !sessionHint;
    scene?.update(ms / session.targetMs, session.id, session.ice ? Math.cbrt(session.ice.sizeCm / 3) : 1);
  } else scene?.update(0, 'preview', previewScale());

  element('sound-state').textContent = state.settings.sound ? '켜짐' : '꺼짐';
  soundToggle.checked = state.settings.sound;
  element('footer-note').textContent = status === 'paused' ? '휴식 시간은 공부 시간에 포함되지 않아요.'
    : '다른 탭에서도 공부 시간은 계속 흘러요.';
  if (lastStatus !== status) {
    element('live-status').textContent = status === 'running' ? '공부를 시작했어요.'
      : status === 'paused' ? '공부를 일시정지했어요.'
      : status === 'completed' ? '얼음이 모두 녹았어요. 공부를 완료했어요.'
      : status === 'stopped' ? '공부를 마치고 시간을 기록했어요.' : '새로운 공부를 시작할 수 있어요.';
    lastStatus = status;
  }
}

function notifyCompletion(previous: Session | null) {
  if (previous?.status !== 'running' || state.session?.status !== 'completed' || !state.settings.sound) return;
  if (!sound.play()) {
    element('sound-notice').textContent = '브라우저에서 알림음을 재생하지 못했어요. 공부 완료와 기록은 정상적으로 처리했어요.';
    element('sound-notice').hidden = false;
  }
}

function tick() {
  const previous = state;
  state = reconcile(state, Date.now());
  if (state !== previous) {
    persist();
    notifyCompletion(previous.session);
    if (dialog.open) renderHistory();
  }
  render();
}

function updateSession(session: NonNullable<typeof state.session>) {
  const previous = state.session;
  state = reconcile({ ...state, session }, Date.now());
  persist();
  notifyCompletion(previous);
  render();
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (state.session) return;
  try {
    const mode = state.settings.mode;
    const fixed = mode === 'fixed' ? validateMinutes(fixedInput.value) : state.settings.fixed;
    const sizeCm = mode === 'random' ? validateIceSize(sizeInput.value) : state.settings.sizeCm;
    const temperatureC = mode === 'random' ? validateTemperature(temperatureInput.value) : state.settings.temperatureC;
    const now = Date.now(), id = crypto.randomUUID();
    const session = mode === 'fixed' ? createSession('fixed', fixed, now, id)
      : createIceSession({ sizeCm, temperatureC }, now, id, () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000);
    state = { ...state, settings: { ...state.settings, fixed, sizeCm, temperatureC }, session };
    element('form-error').hidden = true;
    [fixedInput, sizeInput, temperatureInput].forEach(input => input.removeAttribute('aria-invalid'));
    element('sound-notice').hidden = true;
    if (state.settings.sound) void sound.prepare();
    persist();
    render();
    element('pause-session').focus();
  } catch (error) {
    element('form-error').textContent = error instanceof Error ? error.message : '시간을 다시 확인해 주세요.';
    element('form-error').hidden = false;
    const inputs = state.settings.mode === 'fixed' ? [fixedInput] : [sizeInput, temperatureInput];
    inputs.forEach(input => input.setAttribute('aria-invalid', 'true'));
    inputs[0].focus();
  }
});

element('mode-fixed').addEventListener('click', () => { setMode('fixed'); persist(); render(); });
element('mode-random').addEventListener('click', () => { setMode('random'); persist(); render(); });
sizeInput.addEventListener('input', () => render());
temperatureInput.addEventListener('input', () => render());
element('pause-session').addEventListener('click', () => {
  if (!state.session) return;
  if (state.settings.sound) void sound.prepare();
  const session = state.session.status === 'paused' ? resume(state.session, Date.now()) : pause(state.session, Date.now());
  updateSession(session);
});
element('stop-session').addEventListener('click', () => {
  if (!state.session) return;
  updateSession(stop(state.session, Date.now()));
  element('new-session').focus();
});
element('new-session').addEventListener('click', () => {
  state = { ...state, session: null };
  persist();
  render();
  element('mode-fixed').focus();
});
soundToggle.addEventListener('change', () => {
  state = { ...state, settings: { ...state.settings, sound: soundToggle.checked } };
  if (soundToggle.checked) void sound.prepare().then(ready => {
    element('sound-notice').hidden = ready;
    if (!ready) element('sound-notice').textContent = '이 브라우저에서는 알림음이 제한될 수 있어요. 완료 화면은 정상적으로 표시돼요.';
  });
  else element('sound-notice').hidden = true;
  persist();
  render();
});

const dateFormatter = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function durationLabel(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? `${hours}시간 ` : ''}${minutes}분${seconds % 60 ? ` ${seconds % 60}초` : ''}`;
}
function renderHistory() {
  const list = element<HTMLOListElement>('history-list');
  list.replaceChildren();
  element('empty-history').hidden = state.records.length > 0;
  element('total-time').textContent = durationLabel(state.records.reduce((total, r) => total + r.elapsedMs, 0));
  element('completed-count').textContent = `완료한 얼음 ${state.records.filter(r => r.status === 'completed').length}개`;
  for (const record of state.records) {
    const row = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'record-meta';
    const mode = document.createElement('span');
    mode.textContent = record.mode === 'fixed' ? '시간 지정' : '랜덤 챌린지';
    const date = document.createElement('time');
    date.className = 'record-date';
    date.dateTime = new Date(record.startedAt).toISOString();
    date.textContent = dateFormatter.format(record.startedAt);
    meta.append(mode, date);
    if (record.ice) {
      const conditions = document.createElement('span');
      conditions.className = 'record-date';
      conditions.textContent = `얼음 ${record.ice.sizeCm}cm · 주변 ${record.ice.temperatureC}°C`;
      meta.append(conditions);
    }
    const result = document.createElement('div');
    result.className = 'record-result';
    const duration = document.createElement('span');
    duration.textContent = durationLabel(record.elapsedMs);
    const badge = document.createElement('span');
    badge.className = `record-status ${record.status === 'stopped' ? 'stopped' : ''}`;
    badge.textContent = record.status === 'completed' ? '완료' : '중도 종료';
    result.append(duration, badge);
    row.append(meta, result);
    list.append(row);
  }
}
element('open-history').addEventListener('click', () => { tick(); renderHistory(); dialog.showModal(); });
element('close-history').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});

window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  const loaded = loadState(port, Date.now());
  if (loaded.warning) return;
  state = loaded.state;
  setMode(state.settings.mode);
  render();
  if (dialog.open) renderHistory();
});
document.addEventListener('visibilitychange', tick);
window.addEventListener('focus', tick);
window.addEventListener('pagehide', () => { tick(); persist(); });

function fallback() {
  element('scene-fallback').hidden = false;
  element('scene').querySelector('canvas')?.remove();
}

setMode(state.settings.mode);
persist();
render();
window.setInterval(tick, 250);
// Keep controls ready while the heavier renderer loads in its own chunk.
void import('./scene.ts').then(({ createIceScene }) => {
  scene = createIceScene(element('scene'), fallback);
  render();
}).catch(fallback);

if (import.meta.hot) import.meta.hot.dispose(() => scene?.dispose());
