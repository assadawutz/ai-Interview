import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
const answer =
  '# [DIRECT_ANSWER]\nUse verified experience.\n# [HOW_IT_WORKS]\nCheck facts and assumptions.\n# [EXECUTIVE_SUMMARY]\nValidate the result.';
for (const width of [320, 390, 768, 1024, 1440])
  test(`client light design remains usable at ${width}px without backend calls or console errors`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [],
      backend: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/api/')) backend.push(r.url());
    });
    await page.goto('/');
    await expect(page.locator('.setup-banner')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-runtime', 'client');
    for (const name of ['สถานะระบบ', 'โปรไฟล์ของฉัน', 'พื้นที่เตรียมตัว']) {
      await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (width === 1440)
        expect(
          (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
        ).toEqual([]);
    }
    expect(backend).toEqual([]);
    expect(errors).toEqual([]);
  });
test('client streams directly to Gemini, reviews evidence and persists key only with explicit opt-in', async ({
  page,
}) => {
  const errors: string[] = [],
    sent: string[] = [],
    backend: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) backend.push(r.url());
  });
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    sent.push(route.request().url());
    if (route.request().url().includes('streamGenerateContent'))
      return route.fulfill({
        contentType: 'text/event-stream',
        body:
          'data: ' +
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: answer }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 25 },
          }) +
          '\n\n',
      });
    return route.fulfill({
      json: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    verdict: 'consistent',
                    summary: 'Matches the supplied facts.',
                    evidence: [],
                    concerns: [],
                    missingInformation: [],
                    revisedDirectAnswer: '',
                    revisedExampleScript: '',
                  }),
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      },
    });
  });
  await page.goto('/');
  await page.locator('.sidebar').getByRole('button', { name: 'สถานะระบบ', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่ม Gemini API key', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('input[type=password]').fill('AIzaSyBrowserOnlyFixtureNeverUseReal');
  await modal.getByRole('button', { name: 'บันทึกและใช้งาน', exact: true }).click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'พื้นที่เตรียมตัว', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'คำถามสัมภาษณ์', exact: true })
    .fill('How do you check a result?');
  await page.getByRole('button', { name: 'เตรียมคำตอบ', exact: true }).click();
  await expect(page.locator('.answer-main')).toContainText('verified experience');
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
  expect(sent.length).toBe(2);
  expect(backend).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('interview-pulse:gemini-key'))).toBeNull();
});

test('remembered provider keys stay isolated and reset removes only app credentials', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('unrelated-site-preference', 'keep'));
  await page.locator('.sidebar').getByRole('button', { name: 'สถานะระบบ', exact: true }).click();
  const open = () =>
    page.getByRole('button', { name: 'ตั้งค่า LLM และ fallback', exact: true }).click();
  await open();
  let modal = page.getByRole('dialog');
  await modal.getByLabel('ผู้ให้บริการ', { exact: true }).selectOption('groq');
  await modal.getByLabel('ชื่อโมเดลจากผู้ให้บริการ', { exact: true }).fill('fixture-groq');
  await modal.locator('input[type=password]').fill('groq-fixture-key');
  await modal
    .getByRole('checkbox', { name: 'จำ key ผู้ให้บริการบนอุปกรณ์นี้ (localStorage)', exact: true })
    .check();
  await modal.getByRole('button', { name: 'บันทึกเส้นทาง', exact: true }).click();
  await open();
  modal = page.getByRole('dialog');
  await modal.getByLabel('ผู้ให้บริการ', { exact: true }).selectOption('openrouter');
  await expect(modal.locator('input[type=password]')).toHaveValue('');
  await modal.getByLabel('ชื่อโมเดลจากผู้ให้บริการ', { exact: true }).fill('fixture/openrouter');
  await modal.locator('input[type=password]').fill('router-fixture-key');
  await modal.getByRole('button', { name: 'บันทึกเส้นทาง', exact: true }).click();
  const keys = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('interview-pulse:provider-keys:v1') || '{}'),
  );
  expect(keys.groq).toBe('groq-fixture-key');
  expect(keys.openrouter).toBe('router-fixture-key');
  await open();
  await page.getByRole('button', { name: 'ล้างเส้นทางและกลับไปใช้ Gemini', exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem('interview-pulse:provider-keys:v1')),
  ).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-site-preference'))).toBe('keep');
});
