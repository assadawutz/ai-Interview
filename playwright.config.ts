import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3100', headless: true, trace: 'retain-on-failure' },
  reporter: [['list']],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:3100/api/health',
      reuseExistingServer: false,
      env: {
        PORT: '3100',
        DISABLE_HMR: 'true',
        HOST: '127.0.0.1',
        GEMINI_API_KEY: '',
        APP_ACCESS_TOKEN: '',
        APP_URL: '',
        AI_MODEL_PRICING_JSON: '{}',
      },
      timeout: 30000,
    },
    {
      command: 'npm run build && tsx tests/fixtures/server.ts',
      url: 'http://127.0.0.1:3101/api/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        NODE_ENV: 'production',
        INTERVIEW_TEST_MODE: '1',
        GEMINI_API_KEY: '',
        APP_ACCESS_TOKEN: '',
        APP_URL: '',
        AI_MODEL_PRICING_JSON: '{}',
      },
    },
  ],
});
