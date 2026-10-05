import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Listen on IPv4: on this machine Node resolves "localhost" to ::1 only, which some browsers
  // (e.g. VS Code's built-in one) can't reach, so http://localhost:5173 was refused.
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  test: {
    environment: 'node',
  },
});
