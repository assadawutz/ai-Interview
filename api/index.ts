import { createApp } from '../server/app';

// Export without opening a listener; Vercel owns the HTTP server.
export default createApp();
