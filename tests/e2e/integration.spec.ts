import { test, expect, type Page } from '@playwright/test';
async function open(page: Page) {
  await page.goto('http://127.0.0.1:3101');
}
async function nav(page: Page, name: string) {
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
}
async function profile(page: Page) {
  await nav(page, 'โปรไฟล์ของฉัน');
  await page.getByLabel('ตำแหน่งเป้าหมาย', { exact: true }).fill('Senior Engineer');
  await page
    .getByRole('textbox', { name: 'ประสบการณ์และผลงานจริง', exact: true })
    .fill('I led a TypeScript migration with two teams.');
  await page
    .getByRole('textbox', { name: 'รายละเอียดตำแหน่งงาน', exact: true })
    .fill('Requires TypeScript delivery.');
  await page.getByRole('button', { name: 'บันทึกโปรไฟล์', exact: true }).click();
}
async function ask(page: Page) {
  await nav(page, 'พื้นที่เตรียมตัว');
  await page
    .getByRole('textbox', { name: 'คำถามสัมภาษณ์', exact: true })
    .fill('Describe your contribution');
  await page.getByRole('button', { name: 'เตรียมคำตอบ', exact: true }).click();
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
}

test('UI → real API → provider boundary → review → final answer removes unsupported claims', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await profile(page);
  await ask(page);
  await expect(page.locator('.answer-main')).toContainText(
    'I led a TypeScript migration with two teams.',
  );
  await expect(page.locator('.answer-main')).not.toContainText('80%');
  await expect(page.locator('.review-panel')).toContainText('Removed an unsupported percentage');
  await expect(page.locator('.answer-meta')).toContainText('ตรวจซ้ำ');
  await page.locator('.review-panel summary').click();
  await expect(page.locator('.review-panel blockquote')).toContainText(
    'I led a TypeScript migration',
  );
  await expect(page.locator('.clarification-panel')).toContainText('actually measured');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/reviewed-answer.png', fullPage: true });
});
test('real preparation endpoint maps evidence and feeds its practice question into the workspace', async ({
  page,
}) => {
  await open(page);
  await profile(page);
  await nav(page, 'แผนเตรียมตัว');
  await page.getByRole('button', { name: 'สร้างแผนเตรียมตัว', exact: true }).click();
  await expect(page.locator('.requirement-card')).toContainText('TypeScript delivery');
  await expect(page.locator('.requirement-card')).toContainText('I led a TypeScript migration');
  await expect(page.locator('.practice-plan')).toContainText('two minutes');
  await page.screenshot({ path: 'artifacts/preparation-plan.png', fullPage: true });
  await page.locator('.requirement-card .text-button').click();
  await expect(page.getByRole('textbox', { name: 'คำถามสัมภาษณ์', exact: true })).toHaveValue(
    'How did you validate the migration?',
  );
});
test('changing profile invalidates cached coaching instead of silently returning the old answer', async ({
  page,
}) => {
  let requests = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/api/analyze-question-stream')) requests++;
  });
  await open(page);
  await profile(page);
  await ask(page);
  expect(requests).toBe(1);
  await nav(page, 'โปรไฟล์ของฉัน');
  await page
    .getByRole('textbox', { name: 'ประสบการณ์และผลงานจริง', exact: true })
    .fill('I led a TypeScript migration with two teams. I owned validation.');
  await page.getByRole('button', { name: 'บันทึกโปรไฟล์', exact: true }).click();
  await nav(page, 'พื้นที่เตรียมตัว');
  await expect(page.locator('.answer-context-warning')).toBeVisible();
  await page.locator('.question-select').click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
});
test('story-bank facts, schema migration and preparation survive refresh together', async ({
  page,
}) => {
  await open(page);
  await profile(page);
  await nav(page, 'โปรไฟล์ของฉัน');
  await page.getByRole('button', { name: 'เพิ่มเรื่องเล่า', exact: true }).click();
  await page.getByLabel('ชื่อโครงการหรือเหตุการณ์', { exact: true }).fill('Migration rollout');
  await page
    .getByRole('textbox', { name: 'สิ่งที่คุณลงมือทำและเหตุผล 1', exact: true })
    .fill('Introduced staged releases');
  await page.getByRole('button', { name: 'บันทึกโปรไฟล์', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('interviewpulse_draft_v2') || '{}').context?.stories
            ?.length,
      ),
    )
    .toBe(1);
  await page.reload();
  await nav(page, 'โปรไฟล์ของฉัน');
  await expect(page.getByLabel('ชื่อโครงการหรือเหตุการณ์', { exact: true })).toHaveValue(
    'Migration rollout',
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('interviewpulse_draft_v2') || '{}').version,
    ),
  ).toBe(3);
});
test('real practice route returns actionable strengths, improvements and a suggested revision', async ({
  page,
}) => {
  await open(page);
  await profile(page);
  await nav(page, 'ซ้อมสัมภาษณ์');
  await page.getByRole('button', { name: 'เริ่มซ้อมสัมภาษณ์', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'คำตอบของคุณ', exact: true })
    .fill('I planned the migration and coordinated both teams.');
  await page.getByRole('button', { name: 'ประเมินและถามต่อ', exact: true }).click();
  await expect(page.locator('.feedback-card')).toContainText('Clear ownership');
  await expect(page.locator('.feedback-card')).toContainText('Add a real measured result');
  await page.getByText('แนวทางปรับคำตอบ', { exact: true }).click();
  await expect(page.locator('.feedback-card')).toContainText('[your actual outcome]');
});
test('model diagnostics reaches provider metadata without exposing or requiring browser Gemini credentials', async ({
  page,
}) => {
  await open(page);
  await nav(page, 'สถานะระบบ');
  await page.getByRole('button', { name: 'ตรวจข้อมูลโมเดลจากผู้ให้บริการ', exact: true }).click();
  await expect(page.locator('.diagnostics-results')).toContainText('อ่านข้อมูลได้');
  await expect(page.locator('.diagnostics-results')).toContainText('quota are not verified');
});

test('document extraction, grounded company research and follow-up chat cross real API routes', async ({
  page,
}) => {
  await open(page);
  await nav(page, 'โปรไฟล์ของฉัน');
  await page.getByLabel('อัปโหลด Resume', { exact: true }).setInputFiles({
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test fixture'),
  });
  await expect(
    page.getByRole('textbox', { name: 'ประสบการณ์และผลงานจริง', exact: true }),
  ).toHaveValue('I led a TypeScript migration with two teams.');
  await page.getByLabel('บริษัท', { exact: true }).fill('Example company');
  await page.getByRole('button', { name: 'ค้นหาข้อมูลบริษัท', exact: true }).click();
  await expect(page.locator('.research-result')).toContainText('distinguishes facts');
  await expect(page.locator('.research-result a')).toHaveAttribute('href', 'https://example.com');
  await page.getByRole('button', { name: 'บันทึกโปรไฟล์', exact: true }).click();
  await ask(page);
  await page
    .getByRole('textbox', { name: 'คำถามเพิ่มเติม', exact: true })
    .fill('How can I make it clearer?');
  await page.getByRole('button', { name: 'ส่งคำถาม', exact: true }).click();
  await expect(page.locator('.chat-message.assistant')).toContainText('real measurable outcome');
});
test('captured audio → transcription → detection → coached answer uses real server contracts', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.enumerateDevices = async () =>
      [
        {
          deviceId: 'synthetic-mic',
          kind: 'audioinput',
          label: 'Synthetic microphone',
          groupId: 'fixture',
          toJSON: () => ({}),
        },
      ] as MediaDeviceInfo[];
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const output = audio.createMediaStreamDestination();
      oscillator.connect(output);
      oscillator.start();
      return output.stream;
    };
  });
  await open(page);
  await profile(page);
  await nav(page, 'พื้นที่เตรียมตัว');
  await page.getByRole('button', { name: 'ตั้งค่าเสียง', exact: true }).click();
  await page.getByLabel('อุปกรณ์รับเสียง', { exact: true }).selectOption('synthetic-mic');
  await page.getByRole('button', { name: 'เสร็จแล้ว', exact: true }).click();
  await page.getByRole('button', { name: 'เปิดรับเสียง', exact: true }).click();
  await expect(page.locator('.question-select')).toContainText('How do you validate a migration?', {
    timeout: 15000,
  });
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
  await page.getByRole('button', { name: 'หยุดรับเสียง', exact: true }).click();
});

test('evidence review and generated preparation plan remain accessible', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await open(page);
  await profile(page);
  await ask(page);
  for (const step of ['answer', 'plan']) {
    if (step === 'plan') {
      await nav(page, 'แผนเตรียมตัว');
      await page.getByRole('button', { name: 'สร้างแผนเตรียมตัว', exact: true }).click();
      await expect(page.locator('.requirement-card')).toBeVisible();
    }
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => node.target),
      })),
      step,
    ).toEqual([]);
  }
});
