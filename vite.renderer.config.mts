import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    // On this Windows host `localhost` binds Vite to ::1 while Electron resolves
    // the generated URL to 127.0.0.1. Bind explicitly so both use IPv4.
    host: '127.0.0.1',
    strictPort: true,
  },
});
