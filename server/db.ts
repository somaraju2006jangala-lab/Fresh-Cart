import mongoose from 'mongoose';
import { OrderModel } from './models/Order.ts';
import { CustomerModel } from './models/Customer.ts';

let isConnected = false;
let connectionPromise: Promise<boolean> | null = null;
let lastMongoError: {
  name: string;
  message: string;
  code?: string | number;
  codeName?: string;
  failureCategory: 'AUTHENTICATION_FAILED' | 'DNS_HOSTNAME_FAILURE' | 'CONNECTION_TIMEOUT' | 'CONNECTION_REFUSED' | 'MALFORMED_URI' | 'UNKNOWN';
  timestamp: string;
} | null = null;

/**
 * Strips surrounding whitespace and any enclosing double/single quotes,
 * and safely encodes unescaped special characters in credentials (e.g. #, @ in passwords).
 */
export function getCleanMongoUri(): string {
  const rawUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!rawUri || typeof rawUri !== 'string') return '';
  let uri = rawUri.trim();
  while (
    (uri.startsWith('"') && uri.endsWith('"')) ||
    (uri.startsWith("'") && uri.endsWith("'"))
  ) {
    uri = uri.slice(1, -1).trim();
  }

  const match = uri.match(/^(mongodb(?:\+srv)?:\/\/)(.*)$/i);
  if (!match) return uri;

  const scheme = match[1].toLowerCase();
  const rest = match[2];

  const slashIdx = rest.indexOf('/');
  const qIdx = rest.indexOf('?');
  let splitIdx = -1;
  if (slashIdx !== -1 && qIdx !== -1) {
    splitIdx = Math.min(slashIdx, qIdx);
  } else if (slashIdx !== -1) {
    splitIdx = slashIdx;
  } else if (qIdx !== -1) {
    splitIdx = qIdx;
  }

  const authority = splitIdx !== -1 ? rest.slice(0, splitIdx) : rest;
  const pathAndQuery = splitIdx !== -1 ? rest.slice(splitIdx) : '';

  const lastAt = authority.lastIndexOf('@');
  if (lastAt === -1) {
    return scheme + authority + pathAndQuery;
  }

  const userInfo = authority.slice(0, lastAt);
  const hosts = authority.slice(lastAt + 1);

  const firstColon = userInfo.indexOf(':');
  if (firstColon === -1) {
    let cleanUser = userInfo;
    try {
      cleanUser = encodeURIComponent(decodeURIComponent(userInfo));
    } catch {
      cleanUser = encodeURIComponent(userInfo);
    }
    return scheme + cleanUser + '@' + hosts + pathAndQuery;
  }

  const user = userInfo.slice(0, firstColon);
  const pass = userInfo.slice(firstColon + 1);

  let cleanUser = user;
  let cleanPass = pass;
  try {
    cleanUser = encodeURIComponent(decodeURIComponent(user));
  } catch {
    cleanUser = encodeURIComponent(user);
  }
  try {
    cleanPass = encodeURIComponent(decodeURIComponent(pass));
  } catch {
    cleanPass = encodeURIComponent(pass);
  }

  return scheme + cleanUser + ':' + cleanPass + '@' + hosts + pathAndQuery;
}

/**
 * Safely sanitizes MongoDB error information without exposing connection strings, passwords, or credentials.
 */
function sanitizeMongoError(err: any): {
  name: string;
  message: string;
  code?: string | number;
  codeName?: string;
} {
  const name = typeof err?.name === 'string' ? err.name : 'MongoConnectionError';
  let message = typeof err?.message === 'string' ? err.message : 'Unknown connection error';

  // Redact any URI, username, password, or host credentials if present
  message = message.replace(/mongodb(?:\+srv)?:\/\/[^\s@]+@/gi, 'mongodb+srv://<redacted-credentials>@');
  message = message.replace(/(password|pwd|secret|key)=[^&\s]+/gi, '$1=<redacted>');
  message = message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '<redacted-mongodb-uri>');

  return {
    name,
    message,
    code: err?.code,
    codeName: err?.codeName,
  };
}

/**
 * Classifies MongoDB connection failures into exact actionable categories.
 */
export function classifyMongoFailure(
  errName: string,
  errMessage: string,
  errCode?: string | number
): 'AUTHENTICATION_FAILED' | 'DNS_HOSTNAME_FAILURE' | 'CONNECTION_TIMEOUT' | 'CONNECTION_REFUSED' | 'MALFORMED_URI' | 'UNKNOWN' {
  const msg = (errMessage || '').toLowerCase();
  const codeStr = String(errCode || '').toLowerCase();

  if (
    codeStr === '8000' ||
    msg.includes('auth failed') ||
    msg.includes('authentication failed') ||
    msg.includes('bad auth') ||
    msg.includes('not authorized') ||
    msg.includes('password')
  ) {
    return 'AUTHENTICATION_FAILED';
  }

  if (
    codeStr === 'enotfound' ||
    codeStr === 'enodata' ||
    msg.includes('querysrv enotfound') ||
    msg.includes('querysrv enodata') ||
    msg.includes('getaddrinfo enotfound') ||
    msg.includes('could not find host')
  ) {
    return 'DNS_HOSTNAME_FAILURE';
  }

  if (
    codeStr === 'etimedout' ||
    codeStr === 'eservfail' ||
    errName === 'MongooseServerSelectionError' ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('server selection')
  ) {
    return 'CONNECTION_TIMEOUT';
  }

  if (codeStr === 'econnrefused' || msg.includes('econnrefused') || msg.includes('connection refused')) {
    return 'CONNECTION_REFUSED';
  }

  if (
    errName === 'MongoParseError' ||
    msg.includes('unescaped characters') ||
    msg.includes('invalid scheme') ||
    msg.includes('invalid connection string') ||
    msg.includes('must begin with')
  ) {
    return 'MALFORMED_URI';
  }

  return 'UNKNOWN';
}

/**
 * Extracts safe diagnostic metadata about MongoDB configuration and target cluster
 * without ever exposing username, password, or connection string credentials.
 */
export function getSafeMongoDiagnosticInfo(): {
  uriConfigured: boolean;
  scheme?: string;
  clusterHost?: string;
  databaseName?: string;
  hasSurroundingQuotes: boolean;
  hasSurroundingWhitespace: boolean;
  connectionState: 'connected' | 'connecting' | 'disconnecting' | 'disconnected';
  lastError: {
    name: string;
    message: string;
    code?: string | number;
    failureCategory: 'AUTHENTICATION_FAILED' | 'DNS_HOSTNAME_FAILURE' | 'CONNECTION_TIMEOUT' | 'CONNECTION_REFUSED' | 'MALFORMED_URI' | 'UNKNOWN';
    timestamp: string;
  } | null;
} {
  const rawUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const isConfigured = Boolean(rawUri && rawUri.trim().length > 0);

  const trimmed = (rawUri || '').trim();
  const hasSurroundingQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  const hasSurroundingWhitespace = rawUri ? /^\s|\s$/.test(rawUri) : false;

  let scheme: string | undefined;
  let clusterHost: string | undefined;
  let databaseName: string | undefined;

  if (isConfigured) {
    const clean = getCleanMongoUri();
    const match = clean.match(/^(mongodb(?:\+srv)?:\/\/)(.*)$/i);
    if (match) {
      scheme = match[1].replace('://', '').toLowerCase();
      const rest = match[2];
      const slashIdx = rest.indexOf('/');
      const qIdx = rest.indexOf('?');
      let splitIdx = -1;
      if (slashIdx !== -1 && qIdx !== -1) {
        splitIdx = Math.min(slashIdx, qIdx);
      } else if (slashIdx !== -1) {
        splitIdx = slashIdx;
      } else if (qIdx !== -1) {
        splitIdx = qIdx;
      }

      const authority = splitIdx !== -1 ? rest.slice(0, splitIdx) : rest;
      const pathAndQuery = splitIdx !== -1 ? rest.slice(splitIdx) : '';

      const lastAt = authority.lastIndexOf('@');
      clusterHost = lastAt !== -1 ? authority.slice(lastAt + 1) : authority;

      if (pathAndQuery.startsWith('/')) {
        const afterSlash = pathAndQuery.slice(1);
        const qMark = afterSlash.indexOf('?');
        databaseName = qMark !== -1 ? afterSlash.slice(0, qMark) : afterSlash;
      }
    }
  }

  let connectionState: 'connected' | 'connecting' | 'disconnecting' | 'disconnected' = 'disconnected';
  if (mongoose.connection.readyState === 1) connectionState = 'connected';
  else if (mongoose.connection.readyState === 2) connectionState = 'connecting';
  else if (mongoose.connection.readyState === 3) connectionState = 'disconnecting';

  return {
    uriConfigured: isConfigured,
    scheme,
    clusterHost: clusterHost || '(unknown)',
    databaseName: databaseName || '(default/none)',
    hasSurroundingQuotes,
    hasSurroundingWhitespace,
    connectionState,
    lastError: lastMongoError,
  };
}

/**
 * Checks whether the current runtime environment is Production or Vercel.
 */
export function isProductionEnv(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL) ||
    process.env.ENVIRONMENT === 'production'
  );
}

/**
 * Attempts connection to MongoDB Atlas.
 * - In Production / Vercel: MongoDB Atlas is the required authoritative database.
 *   If MONGODB_URI is missing or unreachable, it logs a critical error and returns false.
 *   Production will NEVER silently fall back to local disk storage.
 * - In Local Development: Falls back to development store only if MONGODB_URI is omitted.
 * - Caches and awaits the in-flight connection promise to support serverless execution cleanly.
 */
export async function connectMongo(): Promise<boolean> {
  const uri = getCleanMongoUri();

  if (!uri) {
    if (isProductionEnv()) {
      console.error(
        '[MongoDB Atlas CRITICAL] MONGODB_URI is not configured in production/Vercel environment. ' +
        'MongoDB Atlas is the authoritative persistent database for customers and orders. ' +
        'Local filesystem fallback is disabled in production to prevent silent unpersisted data loss.'
      );
    } else {
      console.log(
        '[MongoDB Atlas] MONGODB_URI not configured. Operating in local development mode with fallback store.'
      );
    }
    return false;
  }

  // If already connected
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return true;
  }

  // If a connection attempt is already in flight, reuse the same promise
  if (connectionPromise) {
    return connectionPromise;
  }

  if (mongoose.connection.readyState === 2) {
    return new Promise((resolve) => {
      mongoose.connection.once('connected', () => {
        isConnected = true;
        resolve(true);
      });
      mongoose.connection.once('error', () => {
        isConnected = false;
        resolve(false);
      });
    });
  }

  // Check scheme
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    const errorMsg = 'Malformed MONGODB_URI: Connection string scheme must start with "mongodb://" or "mongodb+srv://".';
    if (isProductionEnv()) {
      console.error(`[MongoDB Atlas CRITICAL] ${errorMsg}`);
    } else {
      console.warn(`[MongoDB Atlas] ${errorMsg}`);
    }
    isConnected = false;
    return false;
  }

  connectionPromise = (async () => {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
        family: 4, // Force IPv4 to prevent IPv6 timeout blackholes in serverless environments
      });
      isConnected = mongoose.connection.readyState === 1;
      lastMongoError = null;
      console.log('[MongoDB Atlas] Connected successfully as the authoritative persistent database.');

      // Seed initial demo data in MongoDB Atlas if collections are empty
      await seedInitialDataIfDbConnected().catch(() => {});
      return true;
    } catch (err: any) {
      isConnected = false;
      const safe = sanitizeMongoError(err);
      const category = classifyMongoFailure(safe.name, safe.message, safe.code || safe.codeName);
      lastMongoError = {
        name: safe.name,
        message: safe.message,
        code: safe.code || safe.codeName,
        codeName: safe.codeName,
        failureCategory: category,
        timestamp: new Date().toISOString(),
      };

      const codeSuffix = safe.code || safe.codeName ? ` (code: ${safe.code || safe.codeName})` : '';

      if (isProductionEnv()) {
        console.error(
          `[MongoDB Atlas CRITICAL] Connection failed in production [${category}]: [${safe.name}] ${safe.message}${codeSuffix}. ` +
          'Operation aborted to prevent silent unpersisted data loss on ephemeral container storage.'
        );
      } else {
        console.warn(
          `[MongoDB Atlas] Connection failed [${category}]: [${safe.name}] ${safe.message}${codeSuffix}. Operating with local development fallback.`
        );
      }
      return false;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Checks database availability according to environment rules:
 * In production/Vercel, MongoDB Atlas must be connected. If not, returns explicit error with diagnostic details.
 */
export function checkDatabaseAvailability(): {
  available: boolean;
  isProduction: boolean;
  error?: string;
  code?: string;
  diagnostic?: any;
} {
  const isProd = isProductionEnv();
  const connected = isMongoConnected();

  if (isProd && !connected) {
    const uri = getCleanMongoUri();
    if (!uri) {
      return {
        available: false,
        isProduction: true,
        error:
          'Database configuration error: MONGODB_URI is missing. MongoDB Atlas is the required authoritative database in production.',
        code: 'MONGODB_URI_MISSING',
      };
    }
    const diag = getSafeMongoDiagnosticInfo();
    return {
      available: false,
      isProduction: true,
      error:
        'Database unavailable: Failed to connect to MongoDB Atlas cluster in production. Local disk fallback is disabled to protect data integrity.',
      code: 'MONGODB_UNAVAILABLE',
      diagnostic: {
        failureCategory: diag.lastError?.failureCategory || 'UNKNOWN',
        errorType: diag.lastError?.name || 'MongoError',
        errorCode: diag.lastError?.code,
        errorMessage: diag.lastError?.message,
        clusterHost: diag.clusterHost,
        databaseName: diag.databaseName,
        connectionState: diag.connectionState,
        uriConfigured: diag.uriConfigured,
      },
    };
  }

  return {
    available: true,
    isProduction: isProd,
  };
}

/**
 * Finds a customer by id, email, or phone in MongoDB Atlas.
 */
export async function findCustomerInDb(identifier: string): Promise<any | null> {
  if (!isMongoConnected() && (isProductionEnv() || process.env.MONGODB_URI || process.env.MONGO_URI)) {
    await connectMongo();
  }
  if (!isMongoConnected() || !identifier) return null;

  try {
    const cleanId = identifier.trim();
    const doc = await CustomerModel.findOne({
      $or: [
        { id: cleanId },
        { email: cleanId.toLowerCase() },
        { phone: cleanId },
      ],
    }).lean();
    return doc;
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error finding customer:', err?.message);
    return null;
  }
}

/**
 * Upserts a customer document in MongoDB Atlas.
 */
export async function upsertCustomerInDb(customerData: any): Promise<boolean> {
  if (!isMongoConnected() && (isProductionEnv() || process.env.MONGODB_URI || process.env.MONGO_URI)) {
    await connectMongo();
  }
  if (!isMongoConnected() || !customerData?.id) return false;

  try {
    await CustomerModel.findOneAndUpdate(
      { id: customerData.id },
      { $set: customerData },
      { upsert: true, new: true }
    );
    return true;
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error upserting customer:', err?.message);
    return false;
  }
}

/**
 * Retrieves all customers from MongoDB Atlas.
 */
export async function getCustomersFromDb(): Promise<any[]> {
  if (!isMongoConnected() && (isProductionEnv() || process.env.MONGODB_URI || process.env.MONGO_URI)) {
    await connectMongo();
  }
  if (!isMongoConnected()) return [];

  try {
    return await CustomerModel.find({}).lean();
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error querying customers:', err?.message);
    return [];
  }
}

/**
 * Finds an order by its ID in MongoDB Atlas.
 */
export async function findOrderInDb(orderId: string): Promise<any | null> {
  if (!isMongoConnected() && (isProductionEnv() || process.env.MONGODB_URI || process.env.MONGO_URI)) {
    await connectMongo();
  }
  if (!isMongoConnected() || !orderId) return null;

  try {
    const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
    const doc = await OrderModel.findOne({
      id: { $in: [orderId, altId] },
    }).lean();
    return doc;
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error finding order:', err?.message);
    return null;
  }
}

/**
 * Finds orders for a customer in MongoDB Atlas.
 */
export async function findOrdersForCustomerInDb(customerId?: string): Promise<any[]> {
  if (!isMongoConnected() && (isProductionEnv() || process.env.MONGODB_URI || process.env.MONGO_URI)) {
    await connectMongo();
  }
  if (!isMongoConnected()) return [];

  try {
    const filter = customerId ? { customerId } : {};
    return await OrderModel.find(filter).sort({ createdAt: -1 }).lean();
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error querying orders:', err?.message);
    return [];
  }
}

/**
 * Upserts an order document in MongoDB Atlas.
 */
export async function upsertOrderInDb(orderData: any): Promise<boolean> {
  if (!isMongoConnected() && (isProductionEnv() || process.env.MONGODB_URI || process.env.MONGO_URI)) {
    await connectMongo();
  }
  if (!isMongoConnected() || !orderData?.id) return false;

  try {
    const altId = orderData.id.startsWith('#') ? orderData.id.slice(1) : `#${orderData.id}`;
    await OrderModel.findOneAndUpdate(
      { id: { $in: [orderData.id, altId] } },
      { $set: orderData },
      { upsert: true, new: true }
    );
    return true;
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error upserting order:', err?.message);
    return false;
  }
}

/**
 * Updates OTP verification state for an order in MongoDB Atlas.
 */
export async function updateOrderOtpInDb(
  orderId: string,
  otpData: {
    otp?: string;
    hashedOtp?: string;
    salt?: string;
    otpExpiresAt?: number;
    otpStatus?: 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED';
    otpVerifiedAt?: string;
    status?: string;
  }
): Promise<boolean> {
  if (!isMongoConnected() && (isProductionEnv() || process.env.MONGODB_URI || process.env.MONGO_URI)) {
    await connectMongo();
  }
  if (!isMongoConnected() || !orderId) return false;

  try {
    const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
    const updatePayload: any = {};
    if (otpData.otp !== undefined) updatePayload.otp = otpData.otp;
    if (otpData.hashedOtp !== undefined) updatePayload.hashedOtp = otpData.hashedOtp;
    if (otpData.salt !== undefined) updatePayload.salt = otpData.salt;
    if (otpData.otpExpiresAt !== undefined) updatePayload.otpExpiresAt = otpData.otpExpiresAt;
    if (otpData.otpStatus !== undefined) updatePayload.otpStatus = otpData.otpStatus;
    if (otpData.otpVerifiedAt !== undefined) updatePayload.otpVerifiedAt = otpData.otpVerifiedAt;
    if (otpData.status !== undefined) updatePayload.status = otpData.status;

    await OrderModel.findOneAndUpdate(
      { id: { $in: [orderId, altId] } },
      { $set: updatePayload }
    );
    return true;
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Error updating OTP in DB:', err?.message);
    return false;
  }
}

/**
 * Seeds initial demo customers and orders in MongoDB Atlas if collections are empty.
 */
export async function seedInitialDataIfDbConnected(): Promise<void> {
  if (!isMongoConnected()) return;

  try {
    const custCount = await CustomerModel.countDocuments();
    if (custCount === 0) {
      await CustomerModel.insertMany([
        {
          id: 'rahul123',
          name: 'Rahul',
          email: 'rahul@example.com',
          phone: '+91 9876543210',
          address: 'Flat 402, Green Meadows, Bengaluru 560001',
          loyaltyTier: 'Fresh Gold Member (5% Cashback)',
        },
        {
          id: 'priya123',
          name: 'Priya Sharma',
          email: 'priya@example.com',
          phone: '+91 9123456789',
          address: 'Apt 304, Palm Grove, Koramangala, Bengaluru 560034',
          loyaltyTier: 'Fresh Gold Member (5% Cashback)',
        },
        {
          id: 'cust-demo-1',
          name: 'Alex Morgan',
          email: 'customer@freshcart.com',
          phone: '(555) 234-5678',
          address: '742 Evergreen Terrace, Apt 4B, Springfield, OR 97477',
          loyaltyTier: 'Fresh Gold Member (5% Cashback)',
        },
      ]);
      console.log('[MongoDB Atlas] Seeded initial customer records.');
    }

    const orderCount = await OrderModel.countDocuments();
    if (orderCount === 0) {
      await OrderModel.insertMany([
        {
          id: '#FC-1005',
          customerId: 'rahul123',
          customerName: 'Rahul',
          customerEmail: 'rahul@example.com',
          customerPhone: '+91 9876543210',
          deliveryAddress: 'Flat 402, Green Meadows, Bengaluru 560001',
          status: 'Picking',
          total: 300,
        },
        {
          id: '#FC-1006',
          customerId: 'priya123',
          customerName: 'Priya Sharma',
          customerEmail: 'priya@example.com',
          customerPhone: '+91 9123456789',
          deliveryAddress: 'Apt 304, Palm Grove, Koramangala, Bengaluru 560034',
          status: 'Picking',
          total: 210,
        },
        {
          id: '#1001',
          customerId: 'rahul123',
          customerName: 'Rahul',
          customerEmail: 'rahul@example.com',
          customerPhone: '+91 9876543210',
          deliveryAddress: 'Flat 402, Green Meadows, Bengaluru 560001',
          status: 'Picking',
          total: 300,
        },
        {
          id: '#FC-94821',
          customerId: 'cust-demo-1',
          customerName: 'Alex Morgan',
          customerEmail: 'customer@freshcart.com',
          customerPhone: '(555) 234-1234',
          deliveryAddress: '742 Evergreen Terrace, Apt 4B, Springfield, OR 97477',
          status: 'Picking',
          total: 217,
        },
      ]);
      console.log('[MongoDB Atlas] Seeded initial order records.');
    }
  } catch (err: any) {
    console.warn('[MongoDB Atlas] Seeding error:', err?.message);
  }
}
