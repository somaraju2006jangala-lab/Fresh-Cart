import { apiApp } from '../server/apiRouter.ts';
import { connectMySql } from '../server/db.ts';

export default async function handler(req: any, res: any) {
  // Restore original request path if Vercel destination was rewritten with ?path=...
  if (req.url) {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const pathParam = urlObj.searchParams.get('path') || urlObj.searchParams.get('__route');
      if (pathParam) {
        urlObj.searchParams.delete('path');
        urlObj.searchParams.delete('__route');
        const remainingQuery = urlObj.search;
        const cleanSubPath = pathParam.startsWith('/') ? pathParam : `/${pathParam}`;
        req.url = `/api${cleanSubPath}${remainingQuery}`;
      } else if (req.url === '/api' || req.url === '/api/' || req.url.startsWith('/api?')) {
        const original =
          req.headers?.['x-original-url'] ||
          req.headers?.['x-rewrite-url'] ||
          req.headers?.['x-vercel-matched-path'] ||
          (req.headers?.['x-matched-path'] !== '/api' ? req.headers?.['x-matched-path'] : undefined) ||
          req.headers?.['x-forwarded-uri'] ||
          req.headers?.['x-invoke-path'];

        if (original && typeof original === 'string' && original !== '/api') {
          req.url = original;
        }
      }
    } catch {
      // ignore
    }
  }

  // Ensure MySQL connection pool is ready
  await connectMySql().catch(() => {});

  return (apiApp as any)(req, res);
}
