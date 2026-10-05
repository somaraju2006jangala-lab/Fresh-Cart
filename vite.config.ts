import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, Plugin } from 'vite';

const projectRootDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)));

// Ensure project root .env is loaded into process.env before server middleware is attached
try {
  const envFiles = [
    path.join(projectRootDir, '.env'),
    path.join(projectRootDir, '.env.local'),
  ];
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const parsed = dotenv.parse(fs.readFileSync(envFile, 'utf-8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'string' && v.trim().length > 0) {
          if (!process.env[k] || process.env[k]!.trim().length === 0) {
            process.env[k] = v.trim();
          }
        }
      }
    }
  }
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
        // Dedicated frontend /cart page: always allow Vite to serve index.html
        const urlPath = req.url ? req.url.split('?')[0] : '';
        if (urlPath === '/cart' || urlPath === '/cart/') {
          return next();
        }
        (apiApp as any)(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url ? req.url.split('?')[0] : '';
        if (urlPath === '/cart' || urlPath === '/cart/') {
          return next();
        }
        (apiApp as any)(req, res, next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Synchronize all environment variables (including server secrets) into process.env
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, val] of Object.entries(env)) {
    if (val && typeof val === 'string' && val.trim().length > 0) {
      if (!process.env[key] || process.env[key]!.trim().length === 0) {
        process.env[key] = val.trim();
      }
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
