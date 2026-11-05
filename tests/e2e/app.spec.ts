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
  const pausedTime = await page.locator('#elapsed').innerText();
  await page.clock.fastForward(100_000);
  await expect(page.locator('#elapsed')).toHaveText(pausedTime);
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

test('challenge sliders show live values and never reveal calculated time', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: '랜덤 챌린지', exact: true }).click();
  const size = page.getByRole('slider', { name: '얼음 크기', exact: true });
  const temperature = page.getByRole('slider', { name: '주변 온도', exact: true });
  await expect(size).toBeVisible();
  await expect(temperature).toBeVisible();
  await expect(page.locator('#ice-size-value')).toHaveText('3 cm');
  await expect(page.locator('#temperature-value')).toHaveText('22 °C');
  await page.screenshot({ path: `test-results/challenge-settings-${testInfo.project.name}.png`, fullPage: true });
  await size.press('Home');
  await expect(page.locator('#ice-size-value')).toHaveText('2 cm');
  await size.press('ArrowRight');
  await expect(page.locator('#ice-size-value')).toHaveText('2.5 cm');
  await size.press('End');
  await expect(size).toHaveValue('5');
  await size.press('ArrowRight');
  await expect(size).toHaveValue('5');
  await size.press('Home');
  await temperature.press('Home');
  await expect(page.locator('#temperature-value')).toHaveText('10 °C');
  await temperature.press('ArrowRight');
  await expect(page.locator('#temperature-value')).toHaveText('11 °C');
  await temperature.press('End');
  await expect(page.locator('#temperature-value')).toHaveText('35 °C');
  await page.getByRole('button', { name: '집중 시작하기', exact: true }).click();
  await expect(page.locator('#session-label')).toHaveText('랜덤 챌린지');
  await expect(page.locator('#active-panel')).not.toContainText(/남은|예상|목표|종료 시각/);
  await expect(page.locator('#session-hint')).toContainText('2cm');
  await expect(page.locator('#session-hint')).toContainText('35°C');
  await expect(page.locator('#elapsed')).toBeVisible();
  const target = await page.evaluate(() => JSON.parse(localStorage.getItem('until-ice-melts:v1')!).session.targetMs);
  expect(target).toBeGreaterThanOrEqual(19 * 60_000);
  expect(target).toBeLessThanOrEqual(23 * 60_000);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('until-ice-melts:v1')!).session.targetMs)).toBe(target);
  await expect(page.locator('#session-hint')).toContainText('2cm');
  await page.getByRole('button', { name: '공부 마치기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '여기까지도 소중한 시간이에요.' })).toBeVisible();
  await page.getByRole('button', { name: '공부 기록', exact: true }).click();
  await expect(page.locator('#history-list')).toContainText('중도 종료');
  await expect(page.locator('#history-list')).toContainText('2cm');
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

test('water reflection keeps background clean and restores the same paused shape', async ({ page }, testInfo) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByLabel('공부 시간', { exact: true }).fill('1');
  await page.getByRole('button', { name: '집중 시작하기', exact: true }).click();
  await page.clock.fastForward(30_000);
  await page.getByRole('button', { name: '잠깐 쉬기' }).click();
  await expect(page.locator('#scene canvas')).toBeVisible();
  const before = await page.locator('#scene').screenshot({ path: `test-results/water-mid-${testInfo.project.name}.png` });
  const topPixel = await page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return [...context.getImageData(Math.floor(image.width / 2), 6, 1, 1).data].slice(0, 3);
  }, before.toString('base64'));
  expect(Math.max(...topPixel)).toBeLessThan(60);
  await page.reload();
  await expect(page.getByRole('button', { name: '다시 집중하기' })).toBeVisible();
  await expect(page.locator('#scene canvas')).toBeVisible();
  const after = await page.locator('#scene').screenshot({ path: `test-results/water-restored-${testInfo.project.name}.png` });
  // Compare decoded pixels, not compressed PNG bytes. Tiny GPU rasterization
  // and deferred geometry rounding differences must not mask real shape changes.
  const difference = await page.evaluate(async images => {
    async function decode(base64: string) {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return { width: image.width, height: image.height, pixels: context.getImageData(0, 0, image.width, image.height).data };
    }
    const [a, b] = await Promise.all(images.map(decode));
    if (a.width !== b.width || a.height !== b.height) return { mean: Infinity, changed: 1 };
    let total = 0, changed = 0;
    for (let i = 0; i < a.pixels.length; i += 4) {
      let maximum = 0;
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(a.pixels[i + channel] - b.pixels[i + channel]);
        total += delta; maximum = Math.max(maximum, delta);
      }
      if (maximum > 12) changed++;
    }
    return { mean: total / (a.width * a.height * 3), changed: changed / (a.width * a.height) };
  }, [before.toString('base64'), after.toString('base64')]);
  expect(difference.mean).toBeLessThan(0.25);
  expect(difference.changed).toBeLessThan(0.005);
  await page.getByRole('button', { name: '다시 집중하기' }).click();
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('heading', { name: '한 조각의 집중을 마쳤어요.' })).toBeVisible();
  await page.locator('#scene').screenshot({ path: `test-results/water-finished-${testInfo.project.name}.png` });
});
