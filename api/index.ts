import type { IncomingMessage, ServerResponse } from 'http';
import { apiApp } from '../server/apiRouter.ts';

export default function handler(req: any, res: any) {
  // Restore original request path if Vercel destination is rewritten to /api
  const matchedPath =
    req.headers?.['x-matched-path'] ||
    req.headers?.['x-forwarded-uri'] ||
    req.headers?.['x-invoke-path'];

  if (matchedPath && typeof matchedPath === 'string') {
    req.url = matchedPath;
  }

  return (apiApp as any)(req, res);
}

