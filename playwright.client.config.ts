import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/client-e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3202', headless: true, trace: 'retain-on-failure' },
  reporter: [['list']],
  webServer: {
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 3202 --strictPort',
    url: 'http://127.0.0.1:3202',
    reuseExistingServer: false,
    env: { VITE_RUNTIME_MODE: 'client' },
    timeout: 30000,
  },
});
