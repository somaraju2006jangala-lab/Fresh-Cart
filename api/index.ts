import { apiApp } from '../server/apiRouter.ts';
import { connectMySql } from '../server/db.ts';

export default async function handler(req: any, res: any) {
  // Restore original request path if Vercel destination is rewritten to bare /api
  if (req.url === '/api' || req.url === '/api/' || (typeof req.url === 'string' && req.url.startsWith('/api?'))) {
    const original =
      req.headers?.['x-vercel-matched-path'] ||
      (req.headers?.['x-matched-path'] !== '/api' ? req.headers?.['x-matched-path'] : undefined) ||
      req.headers?.['x-forwarded-uri'] ||
      req.headers?.['x-invoke-path'];

    if (original && typeof original === 'string' && original !== '/api') {
      req.url = original;
    }
  }

  // Ensure MySQL connection pool is ready
  await connectMySql().catch(() => {});

  return (apiApp as any)(req, res);
}
