import type { IncomingMessage, ServerResponse } from 'http';
import { apiApp } from '../server/apiRouter.ts';
import { connectMongo, isProductionEnv } from '../server/db.ts';

export default async function handler(req: any, res: any) {
  // Restore original request path if Vercel destination is rewritten to /api
  const matchedPath =
    req.headers?.['x-matched-path'] ||
    req.headers?.['x-forwarded-uri'] ||
    req.headers?.['x-invoke-path'];

  if (matchedPath && typeof matchedPath === 'string') {
    req.url = matchedPath;
  }

  // In Vercel serverless functions, ensure DB connection attempt is awaited before handling request
  if (isProductionEnv() || process.env.MONGODB_URI || process.env.MONGO_URI) {
    await connectMongo().catch(() => {});
  }

  return (apiApp as any)(req, res);
}

