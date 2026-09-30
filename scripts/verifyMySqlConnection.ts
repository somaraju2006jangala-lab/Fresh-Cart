import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  connectMySql,
  isMySqlConnected,
  checkDatabaseAvailability,
  getSafeMySqlDiagnosticInfo,
} from '../server/db.ts';

// Load .env and .env.local if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

export async function verifyMySqlConfig(): Promise<{
  configured: boolean;
  host: string;
  port: number;
  database: string;
  connected: boolean;
  failureCategory?: string;
  errorType?: string;
  errorCode?: string | number;
  errorMessage?: string;
}> {
  const diagBefore = getSafeMySqlDiagnosticInfo();

  try {
    const connected = await connectMySql();
    const diagAfter = getSafeMySqlDiagnosticInfo();
    return {
      configured: diagAfter.configured,
      host: diagAfter.host,
      port: diagAfter.port,
      database: diagAfter.database,
      connected,
      failureCategory: diagAfter.lastError?.failureCategory,
      errorType: diagAfter.lastError?.name,
      errorCode: diagAfter.lastError?.code,
      errorMessage: diagAfter.lastError?.message,
    };
  } catch (err: any) {
    const diagAfter = getSafeMySqlDiagnosticInfo();
    return {
      configured: diagAfter.configured,
      host: diagAfter.host,
      port: diagAfter.port,
      database: diagAfter.database,
      connected: false,
      failureCategory: diagAfter.lastError?.failureCategory || 'UNKNOWN',
      errorType: diagAfter.lastError?.name || err?.name,
      errorCode: diagAfter.lastError?.code,
      errorMessage: diagAfter.lastError?.message || err?.message,
    };
  }
}

// CLI runner
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  verifyMySqlConfig().then((result) => {
    console.log('--- MySQL Configuration Verification ---');
    console.log('1. Target Database Host:', result.host);
    console.log('2. Target Port:', result.port);
    console.log('3. Target Database Name:', result.database);
    console.log('4. Real MySQL connection succeeded:', result.connected);
    if (!result.connected) {
      console.log('   Exact Failure Category:', result.failureCategory || 'UNKNOWN');
      console.log('   Error Type:', result.errorType || 'Unknown');
      console.log('   Error Code:', result.errorCode || 'None');
      console.log('   Diagnostic Message:', result.errorMessage || 'Unknown');
      process.exit(1);
    } else {
      console.log('   All tables verified and accessible in MySQL.');
      process.exit(0);
    }
  });
}
