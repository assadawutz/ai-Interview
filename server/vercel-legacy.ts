import { createApp } from '../server/app.js';

// Export without opening a listener; Vercel owns the HTTP server.
export default createApp();
