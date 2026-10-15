import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './server/app';
import { config, hasApiKey } from './server/config';

const directory = path.dirname(fileURLToPath(import.meta.url));
const app = createApp();
const server = createServer(app);
let closeDevelopment: (() => Promise<void>) | undefined;
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(directory, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(directory, 'dist/index.html')));
} else {
  const { createServer: createVite } = await import('vite');
  const disabled = process.env.DISABLE_HMR === 'true';
  const vite = await createVite({
    server: {
      middlewareMode: true,
      hmr: disabled ? false : { server },
      ws: disabled ? false : undefined,
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  closeDevelopment = () => vite.close();
}
server.listen(config.port, config.host, () => {
  console.log(`Interview Pulse: http://localhost:${config.port}`);
  if (!hasApiKey()) console.log('Setup required: configure GEMINI_API_KEY to enable AI.');
  if (!config.accessToken)
    console.log('Local access mode: set APP_ACCESS_TOKEN before sharing this server.');
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close();
    void closeDevelopment?.();
  });
