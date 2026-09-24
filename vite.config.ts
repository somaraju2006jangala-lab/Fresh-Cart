import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { apiApp } from './server/apiRouter.ts';

function backendApiPlugin(): Plugin {
  return {
    name: 'backend-otp-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        (apiApp as any)(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        (apiApp as any)(req, res, next);
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), backendApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
