import { test, expect } from '@playwright/test';

test('study, pause, reload, resume, complete and record exactly once', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '얼음이 녹을 때까지.' })).toBeVisible();
  await page.getByLabel('공부 시간', { exact: true }).fill('1');
  await page.getByRole('button', { name: '집중 시작하기', exact: true }).click();
  await page.clock.fastForward(20_000);
  await expect(page.locator('#elapsed')).toHaveText('00:00:20');
  await page.getByRole('button', { name: '잠깐 쉬기' }).click();
  await page.clock.fastForward(100_000);
  await expect(page.locator('#elapsed')).toHaveText('00:00:20');
  await page.reload();
  await expect(page.getByRole('button', { name: '다시 집중하기' })).toBeVisible();
  await page.getByRole('button', { name: '다시 집중하기' }).click();
  await page.clock.fastForward(40_000);
  await expect(page.getByRole('heading', { name: '한 조각의 집중을 마쳤어요.' })).toBeVisible();
  await expect(page.locator('#elapsed')).toHaveText('00:01:00');
  await page.reload();
  await page.getByRole('button', { name: '공부 기록', exact: true }).click();
  await expect(page.locator('#history-list li')).toHaveCount(1);
  await expect(page.locator('#history-list')).toContainText('완료');
});

test('random mode validates its range and never reveals sampled time', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '랜덤 챌린지', exact: true }).click();
  await page.getByLabel('최소 시간', { exact: true }).fill('90');
  await page.getByLabel('최대 시간', { exact: true }).fill('30');
  await page.getByRole('button', { name: '집중 시작하기', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '최대 시간' })).toBeVisible();
  await page.getByLabel('최소 시간', { exact: true }).fill('1');
  await page.getByLabel('최대 시간', { exact: true }).fill('1');
  await page.getByRole('button', { name: '집중 시작하기', exact: true }).click();
  await expect(page.locator('#session-label')).toHaveText('랜덤 챌린지');
  await expect(page.locator('#active-panel')).not.toContainText('1분');
  await expect(page.locator('#elapsed')).toBeVisible();
  const target = await page.evaluate(() => JSON.parse(localStorage.getItem('until-ice-melts:v1')!).session.targetMs);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('until-ice-melts:v1')!).session.targetMs)).toBe(target);
  await page.getByRole('button', { name: '공부 마치기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '여기까지도 소중한 시간이에요.' })).toBeVisible();
  await page.getByRole('button', { name: '공부 기록', exact: true }).click();
  await expect(page.locator('#history-list')).toContainText('중도 종료');
});

test('reopening after target caps study time and avoids duplicate records', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('공부 시간', { exact: true }).fill('1');
  await page.getByRole('button', { name: '집중 시작하기', exact: true }).click();
  const context = page.context();
  await page.close();
  const reopened = await context.newPage();
  await reopened.clock.install({ time: new Date(Date.now() + 180_000) });
  await reopened.goto('/');
  await expect(reopened.locator('#elapsed')).toHaveText('00:01:00');
  await reopened.reload();
  await reopened.getByRole('button', { name: '공부 기록', exact: true }).click();
  await expect(reopened.locator('#history-list li')).toHaveCount(1);
});

test('audio failure never blocks completion or history', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('blocked audio'); } } });
  });
  await page.clock.install();
  await page.goto('/');
  await page.getByLabel('완료 알림음', { exact: true }).check();
  await page.getByLabel('공부 시간', { exact: true }).fill('1');
  await page.getByRole('button', { name: '집중 시작하기', exact: true }).click();
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('heading', { name: '한 조각의 집중을 마쳤어요.' })).toBeVisible();
  await expect(page.locator('#sound-notice')).toContainText('재생하지 못했어요');
  await page.getByRole('button', { name: '공부 기록', exact: true }).click();
  await expect(page.locator('#history-list li')).toHaveCount(1);
});

test('completion reached by pause at the boundary still attempts notification', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('blocked audio'); } } });
  });
  await page.goto('/');
  await page.getByLabel('완료 알림음', { exact: true }).check();
  await page.getByLabel('공부 시간', { exact: true }).fill('1');
  await page.getByRole('button', { name: '집중 시작하기', exact: true }).click();
  // Advance the wall clock and act in the same browser task, before the next tick.
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('until-ice-melts:v1')!).session;
    const original = Date.now;
    Date.now = () => session.runningSince + session.targetMs;
    try { document.getElementById('pause-session')!.click(); }
    finally { Date.now = original; }
  });
  await expect(page.getByRole('heading', { name: '한 조각의 집중을 마쳤어요.' })).toBeVisible();
  await expect(page.locator('#sound-notice')).toContainText('재생하지 못했어요');
});

test('blocked storage and WebGL keep the timer usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.includes('webgl')) return null;
      return getContext.apply(this, [type, ...args] as never);
    } as typeof getContext;
  });
  await page.goto('/');
  await expect(page.locator('#storage-warning')).toBeVisible();
  await expect(page.locator('#scene-fallback')).toBeVisible();
  await page.getByRole('button', { name: '집중 시작하기', exact: true }).click();
  await page.getByRole('button', { name: '잠깐 쉬기' }).click();
  await expect(page.getByRole('button', { name: '다시 집중하기' })).toBeVisible();
});

test('layout fits viewport and history dialog supports escape', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#scene canvas')).toBeVisible();
  await page.screenshot({ path: `test-results/preview-${testInfo.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '공부 기록', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('아직 공부 기록이 없어요.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
