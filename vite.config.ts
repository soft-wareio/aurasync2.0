import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5173,
        clientPort: 5173,
        overlay: false
      },
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
