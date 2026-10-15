import { test, expect, type Page } from '@playwright/test';
const health = {
  status: 'ready',
  hasApiKey: true,
  requiresAccessToken: false,
  models: { fast: 'test-fast', balanced: 'test-model', deep: 'test-deep' },
  pricingConfigured: false,
};
const markdown =
  '# [DIRECT_ANSWER]\nI explain my own contribution with verified results.\n# [RISK_LEVEL]\nHIGH\n# [RISK_SUMMARY]\nAvoid invented metrics.\n# [EXAMPLE_SCRIPT]\nUse [your actual result].\n# [HOW_IT_WORKS]\nExplain the context and your actions.\n# [COMMON_PITFALLS]\nDo not invent facts.\n# [SOLUTIONS]\nAsk for clarification.\n# [EXECUTIVE_SUMMARY]\nBe specific and honest.';
function sse(text = markdown) {
  return [
    { type: 'meta', model: 'test-model' },
    { type: 'text', text },
    {
      type: 'done',
      model: 'test-model',
      usage: { inputTokens: 20, outputTokens: 30, thinkingTokens: 5 },
      sources: [{ title: 'Source', uri: 'https://example.com' }],
      elapsedMs: 1200,
    },
  ]
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join('');
}
async function setup(page: Page) {
  await page.route('**/api/health', (route) => route.fulfill({ json: health }));
  await page.route('**/api/analyze-question-stream', (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: sse() }),
  );
  await page.goto('/');
}
async function ask(page: Page, text = 'Tell me about your project') {
  await page.getByRole('textbox', { name: 'คำถามสัมภาษณ์', exact: true }).fill(text);
  await page.getByRole('button', { name: 'เตรียมคำตอบ', exact: true }).click();
}
async function nav(page: Page, text: string) {
  await page.locator('.sidebar').getByRole('button', { name: text, exact: true }).click();
}

test('setup screen offers a Gemini credential modal without requiring server configuration', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.setup-banner')).toBeVisible();
  await nav(page, 'สถานะระบบ');
  await expect(page.locator('.setup-guide').first()).toBeVisible();
  await expect(page.getByText('ต้องตั้งค่า GEMINI_API_KEY', { exact: true })).toBeVisible();
});
test('manual question completes with real stream metadata and survives refresh', async ({
  page,
}) => {
  await setup(page);
  await ask(page);
  await expect(page.locator('.answer-main')).toContainText('verified results');
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
  await expect(page.locator('.risk-note')).toContainText('HIGH');
  await expect(page.locator('.answer-meta')).toContainText('test-model');
  await expect(page.locator('.answer-meta')).toContainText('55 tokens');
  await expect(page.locator('.sources a').first()).toHaveAttribute('href', 'https://example.com');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('interviewpulse_draft_v2') || '{}').answers?.length,
      ),
    )
    .toBe(1);
  await page.reload();
  await expect(page.locator('.answer-main')).toContainText('verified results');
  await expect(page.locator('.question-item')).toHaveCount(1);
});
test('stream error keeps partial answer incomplete and offers a retry', async ({ page }) => {
  await setup(page);
  await page.route('**/api/analyze-question-stream', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"type":"text","text":"# [DIRECT_ANSWER]\\nPartial answer"}\n\ndata: {"type":"error","error":"Quota reached"}\n\n',
    }),
  );
  await ask(page);
  await expect(page.locator('.notice')).toContainText('Quota reached');
  await expect(page.locator('.status-tag')).toHaveText('ยังไม่สมบูรณ์');
  await expect(page.locator('.question-info')).toContainText('ลองใหม่');
  await page.route('**/api/analyze-question-stream', (route) =>
    route.fulfill({ contentType: 'text/event-stream', body: sse() }),
  );
  await page.locator('.question-select').click();
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
});
test('regenerate makes a new request and applies tone rather than using a cached answer', async ({
  page,
}) => {
  const tones: string[] = [];
  await setup(page);
  await page.route('**/api/analyze-question-stream', (route) => {
    tones.push(route.request().postDataJSON().tone);
    return route.fulfill({ contentType: 'text/event-stream', body: sse() });
  });
  await ask(page);
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
  await page.getByRole('button', { name: 'กระชับขึ้น', exact: true }).click();
  await expect.poll(() => tones).toEqual(['balanced', 'concise']);
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
});
test('new question cancels an older stream without letting it overwrite the selection', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/analyze-question-stream', async (route) => {
    const old = route.request().postDataJSON().question === 'First question';
    if (old) await new Promise((resolve) => setTimeout(resolve, 1000));
    await route
      .fulfill({
        contentType: 'text/event-stream',
        body: sse(old ? '# [DIRECT_ANSWER]\nOLD ANSWER' : '# [DIRECT_ANSWER]\nNEW ANSWER'),
      })
      .catch(() => {});
  });
  await ask(page, 'First question');
  await ask(page, 'Second question');
  await expect(page.locator('.answer-card>h2')).toHaveText('Second question');
  await expect(page.locator('.answer-main')).toContainText('NEW ANSWER');
  await page.waitForTimeout(1200);
  await expect(page.locator('.answer-main')).not.toContainText('OLD ANSWER');
});
test('profile save, session save, export and full wipe work together', async ({ page }) => {
  await setup(page);
  await nav(page, 'โปรไฟล์ของฉัน');
  await page.getByLabel('ตำแหน่งเป้าหมาย', { exact: true }).fill('Staff Engineer');
  await page.getByLabel('บริษัท', { exact: true }).fill('Example Co');
  await page.getByRole('button', { name: 'บันทึกโปรไฟล์', exact: true }).click();
  await nav(page, 'พื้นที่เตรียมตัว');
  await ask(page);
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
  await nav(page, 'ประวัติเซสชัน');
  await page.getByLabel('บันทึกเซสชันปัจจุบัน').fill('My preparation');
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.locator('.session-row')).toContainText('My preparation');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ส่งออก My preparation', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'ล้างข้อมูลทั้งหมด', exact: true }).click();
  await expect(page.locator('.question-item')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('interviewpulse_sessions_v2')))
    .toBeNull();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => localStorage.getItem('interviewpulse_draft_v2'))).toBeNull();
});
test('practice evaluates the candidate answer and asks a contextual follow-up', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/practice', (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: body.question
        ? {
            nextQuestion: 'How did you measure the result?',
            feedback: 'Add a specific outcome from your own work.',
            scores: { relevance: 4, structure: 3, evidence: 2, clarity: 4 },
          }
        : { nextQuestion: 'Tell me about a challenging project.' },
    });
  });
  await nav(page, 'ซ้อมสัมภาษณ์');
  await page.getByRole('button', { name: 'เริ่มซ้อมสัมภาษณ์', exact: true }).click();
  await expect(page.locator('.practice-question')).toContainText('challenging project');
  await page
    .getByLabel('คำตอบของคุณ', { exact: true })
    .fill('I led the migration and worked with two teams.');
  await page.getByRole('button', { name: 'ประเมินและถามต่อ', exact: true }).click();
  await expect(page.locator('.feedback-card')).toContainText('specific outcome');
  await expect(page.locator('.practice-question')).toContainText('measure the result');
  await expect(page.locator('.score-grid')).toContainText('4');
});
test('spoken fragments are grouped and use the current speed setting', async ({ page }) => {
  await page.addInitScript(() => {
    const browser = window as unknown as {
      webkitSpeechRecognition: unknown;
      SpeechRecognition: unknown;
      testRecognition: { onresult: (event: unknown) => void };
    };
    browser.webkitSpeechRecognition = class {
      continuous = true;
      interimResults = true;
      lang = '';
      onresult = () => {};
      onerror = () => {};
      onend = null;
      constructor() {
        browser.testRecognition = this;
      }
      start() {}
      abort() {}
    };
    browser.SpeechRecognition = browser.webkitSpeechRecognition;
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
  let transcript = '',
    speed = '';
  await setup(page);
  await page.route('**/api/detect-question', (route) => {
    transcript = route.request().postDataJSON().transcript;
    return route.fulfill({
      json: {
        isQuestion: true,
        isDuplicate: false,
        cleanQuestion: 'How do you solve difficult problems?',
        confidence: 90,
        category: 'behavioral',
      },
    });
  });
  await page.route('**/api/analyze-question-stream', (route) => {
    speed = route.request().postDataJSON().speed;
    return route.fulfill({ contentType: 'text/event-stream', body: sse() });
  });
  await page.getByRole('button', { name: 'เปิดรับเสียง', exact: true }).click();
  await expect(page.getByRole('button', { name: 'หยุดรับเสียง', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ละเอียด', exact: true }).click();
  await page.evaluate(() => {
    const browser = window as unknown as {
      testRecognition: { onresult: (event: unknown) => void };
    };
    browser.testRecognition.onresult({
      resultIndex: 0,
      results: [Object.assign([{ transcript: 'How do you solve' }], { isFinal: true })],
    });
    browser.testRecognition.onresult({
      resultIndex: 0,
      results: [Object.assign([{ transcript: 'difficult problems?' }], { isFinal: true })],
    });
  });
  await expect.poll(() => transcript).toBe('How do you solve difficult problems?');
  await expect.poll(() => speed).toBe('deep');
  await expect(page.locator('.question-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'หยุดรับเสียง', exact: true }).click();
});
test('English mobile layout fits the viewport and preserves a usable queue', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('en');
  await expect(page.locator('h1').first()).toContainText('Your experience');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page
    .getByRole('textbox', { name: 'Interview question', exact: true })
    .fill('Explain your approach');
  await page.getByRole('button', { name: 'Get coaching', exact: true }).click();
  await expect(page.locator('.status-tag')).toHaveText('Complete');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
});
test('desktop polish and printable report retain Thai content without clipping', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await setup(page);
  await page.screenshot({ path: 'artifacts/workspace.png', fullPage: true });
  await ask(page, 'เล่าถึงโปรเจกต์ที่ท้าทายที่สุด');
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
  await page.screenshot({ path: 'artifacts/answer.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.app-shell')).not.toBeVisible();
  await expect(page.locator('.print-report')).toBeVisible();
  await expect(page.locator('.print-report')).toContainText('เล่าถึงโปรเจกต์ที่ท้าทายที่สุด');
  await page.pdf({ path: 'artifacts/interview-report.pdf', format: 'A4', printBackground: true });
});

test('core screens have accessible landmarks, labels and controls', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await setup(page);
  for (const screen of [
    'พื้นที่เตรียมตัว',
    'โปรไฟล์ของฉัน',
    'แผนเตรียมตัว',
    'ซ้อมสัมภาษณ์',
    'ประวัติเซสชัน',
    'สถานะระบบ',
  ]) {
    await nav(page, screen);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
      screen,
    ).toEqual([]);
  }
  await nav(page, 'พื้นที่เตรียมตัว');
  await ask(page);
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
  const answerResult = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    answerResult.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
});

test('unfinished practice draft is recovered after reload', async ({ page }) => {
  await setup(page);
  await page.route('**/api/practice', (route) =>
    route.fulfill({ json: { nextQuestion: 'What did you contribute?' } }),
  );
  await nav(page, 'ซ้อมสัมภาษณ์');
  await page.getByRole('button', { name: 'เริ่มซ้อมสัมภาษณ์', exact: true }).click();
  await page.getByLabel('คำตอบของคุณ', { exact: true }).fill('I built the migration plan.');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('interviewpulse_draft_v2') || '{}').practiceDraft?.answer,
      ),
    )
    .toBe('I built the migration plan.');
  await page.reload();
  await nav(page, 'ซ้อมสัมภาษณ์');
  await expect(page.locator('.practice-question')).toContainText('What did you contribute?');
  await expect(page.getByLabel('คำตอบของคุณ', { exact: true })).toHaveValue(
    'I built the migration plan.',
  );
});

test('Gemini modal saves a tab key, survives reload, and removes it', async ({ page }) => {
  const key = 'test-browser-credential-123456789';
  await page.goto('/');
  await nav(page, 'สถานะระบบ');
  await page.getByRole('button', { name: 'เพิ่ม Gemini API key', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'ตั้งค่า Gemini API key' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Gemini API key', { exact: true }).fill(`GEMINI_API_KEY="${key}"`);
  await expect(dialog.getByLabel('Gemini API key', { exact: true })).toHaveAttribute(
    'type',
    'password',
  );
  await dialog.getByRole('button', { name: 'บันทึกและใช้งาน', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'เปลี่ยน Gemini API key' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('interview-pulse:gemini-key'))).toBeNull();
  await page.reload();
  await nav(page, 'สถานะระบบ');
  await expect(page.getByRole('button', { name: 'เปลี่ยน Gemini API key' })).toBeVisible();
  const health = await page.evaluate(async () => {
    const response = await fetch('/api/health', {
      headers: { 'X-Gemini-API-Key': sessionStorage.getItem('interview-pulse:gemini-key') || '' },
    });
    return response.json();
  });
  expect(health.hasApiKey).toBe(true);
  await page.getByRole('button', { name: 'ลบ key', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'เพิ่ม Gemini API key', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem('interview-pulse:gemini-key')),
  ).toBeNull();
});

test('Gemini modal remembers credentials only with explicit device opt-in', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'สถานะระบบ');
  await page.getByRole('button', { name: 'เพิ่ม Gemini API key', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Gemini API key', { exact: true })
    .fill('test-remembered-credential-123456');
  await dialog.getByLabel('จำบนอุปกรณ์นี้', { exact: true }).check();
  await dialog.getByRole('button', { name: 'บันทึกและใช้งาน' }).click();
  expect(await page.evaluate(() => !!localStorage.getItem('interview-pulse:gemini-key'))).toBe(
    true,
  );
  await page.getByRole('button', { name: 'ลบ key', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('interview-pulse:gemini-key'))).toBeNull();
});

test('local LLM settings save an Ollama model without a key and can reset routing', async ({
  page,
}) => {
  await page.goto('/');
  await nav(page, 'สถานะระบบ');
  await page.getByRole('button', { name: 'ตั้งค่า LLM และ fallback', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'LLM และการสลับสำรอง' });
  await dialog.getByRole('combobox', { name: 'ผู้ให้บริการ', exact: true }).selectOption('ollama');
  await dialog.getByLabel('ชื่อโมเดลจากผู้ให้บริการ', { exact: true }).fill('fixture:local');
  await dialog.getByRole('combobox', { name: 'โมเดลหลัก', exact: true }).selectOption('external');
  await dialog.getByRole('button', { name: 'บันทึกเส้นทาง', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.model-list')).toContainText('external:ollama:fixture:local');
  await page.reload();
  await nav(page, 'สถานะระบบ');
  await page.getByRole('button', { name: 'ตั้งค่า LLM และ fallback', exact: true }).click();
  await expect(dialog.getByLabel('ชื่อโมเดลจากผู้ให้บริการ', { exact: true })).toHaveValue(
    'fixture:local',
  );
  await dialog.getByRole('button', { name: 'ล้างเส้นทางและกลับไปใช้ Gemini', exact: true }).click();
  await expect(page.getByText('ต้องตั้งค่า GEMINI_API_KEY', { exact: true })).toBeVisible();
});

test('Realtime mode continuously displays speech and drains queued questions without mixing active answers', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const browser = window as unknown as {
      SpeechRecognition: unknown;
      testRealtime: { onresult: (event: unknown) => void; onend: () => void; starts: number };
    };
    browser.SpeechRecognition = class {
      continuous = true;
      interimResults = true;
      lang = '';
      starts = 0;
      onresult = () => {};
      onerror = () => {};
      onend = () => {};
      constructor() {
        browser.testRealtime = this;
      }
      start() {
        this.starts++;
      }
      abort() {}
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(),
        oscillator = context.createOscillator(),
        destination = context.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
  await setup(page);
  let calls = 0;
  let release!: () => void;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/analyze-question-stream', async (route) => {
    calls++;
    if (calls === 1) await first;
    await route.fulfill({ contentType: 'text/event-stream', body: sse() });
  });
  await page.route('**/api/detect-question', (route) =>
    route.fulfill({
      json: {
        isQuestion: true,
        isDuplicate: false,
        cleanQuestion: route.request().postDataJSON().transcript,
        confidence: 95,
        category: 'technical',
      },
    }),
  );
  const say = (text: string) =>
    page.evaluate((text) => {
      (
        window as unknown as { testRealtime: { onresult: (event: unknown) => void } }
      ).testRealtime.onresult({
        resultIndex: 0,
        results: [Object.assign([{ transcript: text }], { isFinal: true })],
      });
    }, text);
  await page.getByRole('button', { name: 'Realtime Mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'หยุด Realtime', exact: true })).toBeVisible();
  await say('What is database indexing?');
  await expect.poll(() => calls).toBe(1);
  await say('How does retry backoff work?');
  await expect(page.locator('.question-item')).toHaveCount(2);
  await expect(page.locator('.live-transcript')).toContainText('What is database indexing?');
  await expect(page.locator('.live-transcript')).toContainText('How does retry backoff work?');
  expect(calls).toBe(1);
  release();
  await expect.poll(() => calls).toBe(2);
  await expect(page.locator('.status-tag')).toHaveText('เสร็จแล้ว');
  await say('How does retry backoff work?');
  await page.waitForTimeout(1500);
  await expect(page.locator('.question-item')).toHaveCount(2);
  expect(calls).toBe(2);
  await page.evaluate(() =>
    (window as unknown as { testRealtime: { onend: () => void } }).testRealtime.onend(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { testRealtime: { starts: number } }).testRealtime.starts,
      ),
    )
    .toBe(2);
  await page.getByRole('button', { name: 'หยุด Realtime', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Realtime Mode', exact: true })).toBeVisible();
});
