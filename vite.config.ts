import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, Plugin } from 'vite';

const projectRootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));

// Ensure project root .env is loaded into process.env before server middleware is attached
try {
  dotenv.config({ path: path.join(projectRootDir, '.env'), quiet: true } as any);
  dotenv.config({ path: path.join(projectRootDir, '.env.local'), quiet: true, override: false } as any);
} catch {
  // ignore
}

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
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

export default defineConfig(({ mode }) => {
  // Synchronize all environment variables (including server secrets) into process.env
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, val] of Object.entries(env)) {
    if (val && typeof val === 'string' && val.trim() && !process.env[key]) {
      process.env[key] = val.trim();
    }
  }

  return {
    plugins: [react(), tailwindcss(), backendApiPlugin()],
    resolve: {
      alias: {
        '@': projectRootDir,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
