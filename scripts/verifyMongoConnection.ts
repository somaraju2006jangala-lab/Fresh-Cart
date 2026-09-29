import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getCleanMongoUri,
  connectMongo,
  isMongoConnected,
  checkDatabaseAvailability,
  getSafeMongoDiagnosticInfo,
} from '../server/db.ts';

// Load .env and .env.local if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

export async function verifyMongoConfig(): Promise<{
  exists: boolean;
  hasSurroundingQuotes: boolean;
  hasSurroundingWhitespace: boolean;
  hasValidScheme: boolean;
  scheme?: string;
  clusterHost?: string;
  databaseName?: string;
  connected: boolean;
  failureCategory?: string;
  errorType?: string;
  errorCode?: string | number;
  errorMessage?: string;
}> {
  const rawUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!rawUri || typeof rawUri !== 'string' || rawUri.trim().length === 0) {
    return {
      exists: false,
      hasSurroundingQuotes: false,
      hasSurroundingWhitespace: false,
      hasValidScheme: false,
      connected: false,
      errorMessage: 'MONGODB_URI is not set in the current process environment or local .env file.',
    };
  }

  const diagBefore = getSafeMongoDiagnosticInfo();

  // Attempt real connection in production mode
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    const connected = await connectMongo();
    const diagAfter = getSafeMongoDiagnosticInfo();
    return {
      exists: true,
      hasSurroundingQuotes: diagAfter.hasSurroundingQuotes,
      hasSurroundingWhitespace: diagAfter.hasSurroundingWhitespace,
      hasValidScheme: Boolean(diagAfter.scheme && diagAfter.scheme !== 'invalid'),
      scheme: diagAfter.scheme,
      clusterHost: diagAfter.clusterHost,
      databaseName: diagAfter.databaseName,
      connected,
      failureCategory: diagAfter.lastError?.failureCategory,
      errorType: diagAfter.lastError?.name,
      errorCode: diagAfter.lastError?.code,
      errorMessage: diagAfter.lastError?.message,
    };
  } catch (err: any) {
    const diagAfter = getSafeMongoDiagnosticInfo();
    return {
      exists: true,
      hasSurroundingQuotes: diagAfter.hasSurroundingQuotes,
      hasSurroundingWhitespace: diagAfter.hasSurroundingWhitespace,
      hasValidScheme: Boolean(diagAfter.scheme && diagAfter.scheme !== 'invalid'),
      scheme: diagAfter.scheme,
      clusterHost: diagAfter.clusterHost,
      databaseName: diagAfter.databaseName,
      connected: false,
      failureCategory: diagAfter.lastError?.failureCategory || 'UNKNOWN',
      errorType: diagAfter.lastError?.name || err?.name,
      errorCode: diagAfter.lastError?.code,
      errorMessage: diagAfter.lastError?.message || err?.message,
    };
  } finally {
    process.env.NODE_ENV = origEnv;
  }
}

// Direct execution CLI runner
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  verifyMongoConfig().then((result) => {
    console.log('--- MongoDB Configuration Verification ---');
    console.log('1. MONGODB_URI exists:', result.exists);
    if (!result.exists) {
      console.log('   Note: MONGODB_URI is configured on Vercel Production dashboard, but not in local .env');
    } else {
      console.log('2. Valid Scheme (mongodb:// or mongodb+srv://):', result.hasValidScheme, `(${result.scheme})`);
      console.log('3. Surrounding quotes present:', result.hasSurroundingQuotes);
      console.log('   Surrounding whitespace present:', result.hasSurroundingWhitespace);
      console.log('4. Target Cluster Host:', result.clusterHost);
      console.log('   Target Database:', result.databaseName);
      console.log('5. Real MongoDB Atlas connection succeeded:', result.connected);
      if (!result.connected) {
        console.log('   Exact Failure Category:', result.failureCategory || 'UNKNOWN');
        console.log('   Error Type:', result.errorType || 'Unknown');
        console.log('   Error Code:', result.errorCode || 'None');
        console.log('   Diagnostic Message:', result.errorMessage || 'Unknown');
      }
    }
    process.exit(0);
  });
}

