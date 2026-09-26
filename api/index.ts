import type { IncomingMessage, ServerResponse } from 'http';
import { apiApp } from '../server/apiRouter.ts';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return (apiApp as any)(req, res);
}
