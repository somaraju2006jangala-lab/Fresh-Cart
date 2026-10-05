import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import bcrypt from 'bcryptjs';

let pool: Pool | null = null;
let isConnected = false;
let connectionPromise: Promise<boolean> | null = null;
let schemaInitialized = false;
let lastMySqlError: {
  name: string;
  message: string;
  code?: string | number;
  failureCategory:
    | 'AUTHENTICATION_FAILED'
    | 'DNS_HOSTNAME_FAILURE'
    | 'CONNECTION_TIMEOUT'
    | 'CONNECTION_REFUSED'
    | 'BAD_DATABASE'
    | 'UNKNOWN';
  timestamp: string;
} | null = null;

/**
 * Returns true if running in Vercel or production environment.
 */
export function isProductionEnv(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.VERCEL_ENV)
  );
}

export interface ParsedMySqlConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl?: any;
  waitForConnections: boolean;
  connectionLimit: number;
  maxIdle: number;
  idleTimeout: number;
  queueLimit: number;
  enableKeepAlive: boolean;
  keepAliveInitialDelay: number;
  connectTimeout: number;
}

/**
 * Returns configured MySQL connection parameters from environment variables,
 * supporting both single connection URLs (MYSQL_URL / DATABASE_URL) and discrete variables.
 */
export function getMySqlConfig(): ParsedMySqlConfig {
  const connectionUrl = (process.env.MYSQL_URL || process.env.DATABASE_URL || '').trim();

  let host = (process.env.MYSQL_HOST || '').trim();
  let port = Number(process.env.MYSQL_PORT) || 3306;
  let user = (process.env.MYSQL_USER || '').trim();
  let password = process.env.MYSQL_PASSWORD || '';
  let database = (process.env.MYSQL_DATABASE || '').trim();
  let sslFromUrl: boolean | undefined = undefined;

  // Support single connection string URLs like mysql://user:password@host:port/database
  if (connectionUrl) {
    try {
      const parsed = new URL(connectionUrl);
      if (parsed.hostname) host = parsed.hostname;
      if (parsed.port) port = Number(parsed.port);
      if (parsed.username) user = decodeURIComponent(parsed.username);
      if (parsed.password) password = decodeURIComponent(parsed.password);
      const dbPath = parsed.pathname.replace(/^\//, '');
      if (dbPath) database = decodeURIComponent(dbPath);

      const sslQuery = parsed.searchParams.get('ssl');
      const sslMode = parsed.searchParams.get('sslmode') || parsed.searchParams.get('ssl-mode');
      if (sslQuery === 'false' || sslMode === 'disabled') {
        sslFromUrl = false;
      } else if (sslQuery === 'true' || sslMode === 'require' || sslMode === 'required') {
        sslFromUrl = true;
      }
    } catch {
      console.warn('[MySQL Config] Notice: Could not parse connection URL as URL object, using discrete env vars.');
    }
  }

  const isProd = isProductionEnv();

  // Local fallback defaults when not in production
  if (!host) {
    host = isProd ? '' : '127.0.0.1';
  }
  if (!user) {
    user = isProd ? '' : 'root';
  }
  if (!database) {
    database = 'freshcart';
  }

  const isLocalHost =
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0';

  // SSL Configuration
  // 1. Explicitly disabled via MYSQL_SSL=false or url param: disable SSL
  // 2. Local development on 127.0.0.1/localhost: disable SSL (unless explicitly forced)
  // 3. Remote cloud MySQL (Aiven, TiDB Cloud, PlanetScale, AWS RDS, DigitalOcean, Railway, Supabase):
  //    Default to enabled SSL with rejectUnauthorized: false so serverless TLS works out of the box
  let ssl: any = undefined;
  const envSsl = (process.env.MYSQL_SSL || '').trim().toLowerCase();
  const envRejectUnauth = (process.env.MYSQL_SSL_REJECT_UNAUTHORIZED || '').trim().toLowerCase();

  if (envSsl === 'false' || sslFromUrl === false) {
    ssl = undefined;
  } else if (envSsl === 'true' || sslFromUrl === true || (!isLocalHost && Boolean(host))) {
    const rejectUnauthorized = envRejectUnauth === 'true';
    ssl = {
      rejectUnauthorized,
    };
    if (process.env.MYSQL_SSL_CA) {
      ssl.ca = process.env.MYSQL_SSL_CA;
    }
  }

  // Serverless pool tuning: 5 connections for serverless execution to prevent pool exhaustion
  const connectionLimit = Number(process.env.MYSQL_CONNECTION_LIMIT) || (isProd ? 5 : 10);
  const maxIdle = Number(process.env.MYSQL_MAX_IDLE) || (isProd ? 5 : 10);
  const idleTimeout = Number(process.env.MYSQL_IDLE_TIMEOUT) || 60000;
  const connectTimeout = Number(process.env.MYSQL_CONNECT_TIMEOUT) || 10000;

  return {
    host,
    port,
    user,
    password,
    database,
    ssl,
    waitForConnections: true,
    connectionLimit,
    maxIdle,
    idleTimeout,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout,
  };
}

/**
 * Classifies MySQL connection errors into clear actionable categories.
 */
export function classifyMySqlFailure(
  errName: string,
  errMessage: string,
  errCode?: string | number
): 'AUTHENTICATION_FAILED' | 'DNS_HOSTNAME_FAILURE' | 'CONNECTION_TIMEOUT' | 'CONNECTION_REFUSED' | 'BAD_DATABASE' | 'UNKNOWN' {
  const msg = (errMessage || '').toLowerCase();
  const codeStr = String(errCode || '').toLowerCase();

  if (
    codeStr.includes('er_access_denied') ||
    codeStr === '1045' ||
    msg.includes('access denied') ||
    msg.includes('bad auth')
  ) {
    return 'AUTHENTICATION_FAILED';
  }

  if (
    codeStr === 'enotfound' ||
    codeStr === 'eai_again' ||
    msg.includes('getaddrinfo enotfound') ||
    msg.includes('could not find host')
  ) {
    return 'DNS_HOSTNAME_FAILURE';
  }

  if (
    codeStr === 'econnrefused' ||
    msg.includes('connection refused')
  ) {
    return 'CONNECTION_REFUSED';
  }

  if (
    codeStr === 'etimedout' ||
    codeStr === 'protocol_connection_lost' ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  ) {
    return 'CONNECTION_TIMEOUT';
  }

  if (
    codeStr.includes('er_bad_db_error') ||
    codeStr === '1049' ||
    msg.includes('unknown database')
  ) {
    return 'BAD_DATABASE';
  }

  return 'UNKNOWN';
}

/**
 * Sanitizes MySQL error information without exposing credentials or secrets.
 */
function sanitizeMySqlError(err: any): {
  name: string;
  message: string;
  code?: string | number;
} {
  const name = typeof err?.name === 'string' ? err.name : 'MySqlConnectionError';
  let message = typeof err?.message === 'string' ? err.message : 'Unknown MySQL connection error';

  message = message.replace(/(password|pwd|key|secret)=[^&\s]+/gi, '$1=<redacted>');
  message = message.replace(/:[^:@\s]+@/g, ':<redacted-password>@');

  return {
    name,
    message,
    code: err?.code,
  };
}

/**
 * Retrieves safe diagnostic metadata about MySQL configuration.
 */
export function getSafeMySqlDiagnosticInfo(): {
  configured: boolean;
  host: string;
  port: number;
  database: string;
  ssl: boolean;
  connectionState: 'connected' | 'connecting' | 'disconnected';
  lastError: typeof lastMySqlError;
} {
  const config = getMySqlConfig();
  const configured = Boolean(
    process.env.MYSQL_URL ||
    process.env.DATABASE_URL ||
    process.env.MYSQL_HOST ||
    process.env.MYSQL_USER
  );

  return {
    configured,
    host: config.host,
    port: config.port,
    database: config.database,
    ssl: Boolean(config.ssl),
    connectionState: isConnected ? 'connected' : connectionPromise ? 'connecting' : 'disconnected',
    lastError: lastMySqlError,
  };
}

/**
 * Returns or creates the singleton MySQL connection pool.
 */
export function getPool(): Pool {
  if (!pool) {
    const config = getMySqlConfig();
    pool = mysql.createPool(config);

    // Register pool error handler to gracefully handle connection loss
    (pool as any).on('error', (err: any) => {
      console.error('[MySQL Pool Error]', err?.code || err?.message);
      if (err?.code === 'PROTOCOL_CONNECTION_LOST' || err?.code === 'ECONNRESET') {
        isConnected = false;
      }
    });
  }
  return pool;
}

/**
 * Resets the connection pool (useful for reconnection or configuration updates).
 */
export async function resetPool(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } catch {
      // Ignore pool close error
    }
    pool = null;
    isConnected = false;
    schemaInitialized = false;
  }
}

/**
 * Connects to MySQL and verifies the pool can execute queries.
 */
export async function connectMySql(): Promise<boolean> {
  const isProd = isProductionEnv();
  const config = getMySqlConfig();

  // In production (Vercel), enforce that database host is configured and not pointing to localhost
  if (isProd) {
    const rawHost = config.host.trim().toLowerCase();
    if (!rawHost || rawHost === 'localhost' || rawHost === '127.0.0.1' || rawHost === '::1') {
      const errorMsg =
        'Production configuration error: MYSQL_HOST (or MYSQL_URL / DATABASE_URL) must be set to a remote cloud-hosted MySQL database in Vercel Environment Variables. ' +
        'Localhost and 127.0.0.1 are not accessible from Vercel serverless execution.';
      console.error(`[MySQL CRITICAL] ${errorMsg}`);
      lastMySqlError = {
        name: 'ConfigurationError',
        message: errorMsg,
        failureCategory: 'DNS_HOSTNAME_FAILURE',
        timestamp: new Date().toISOString(),
      };
      isConnected = false;
      return false;
    }
  }

  // If already connected in a warm container, perform a quick ping to ensure socket wasn't closed during idle pause
  if (isConnected && pool) {
    try {
      const testConn = await pool.getConnection();
      try {
        await testConn.ping();
      } finally {
        testConn.release();
      }
      return true;
    } catch {
      // Idle socket timed out or connection lost - re-establish
      isConnected = false;
    }
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      const currentPool = getPool();
      const connection = await currentPool.getConnection();
      try {
        await connection.ping();
      } finally {
        connection.release();
      }

      isConnected = true;
      lastMySqlError = null;
      console.log(`[MySQL] Connected successfully to database: ${config.database} on ${config.host}:${config.port} (SSL: ${Boolean(config.ssl)})`);

      // Automatically initialize schema and seed initial data once per container lifetime
      if (!schemaInitialized) {
        await initializeDatabase().catch((err) => {
          console.warn('[MySQL Init] Notice during schema verification:', err?.message);
        });
        schemaInitialized = true;
      }

      return true;
    } catch (err: any) {
      isConnected = false;
      const safe = sanitizeMySqlError(err);
      const category = classifyMySqlFailure(safe.name, safe.message, safe.code);
      lastMySqlError = {
        name: safe.name,
        message: safe.message,
        code: safe.code,
        failureCategory: category,
        timestamp: new Date().toISOString(),
      };

      console.error(`[MySQL Connection Failure] [${category}] ${safe.name}: ${safe.message}`);
      return false;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

export function isMySqlConnected(): boolean {
  return isConnected;
}

/**
 * Checks database availability according to environment rules.
 */
export function checkDatabaseAvailability(): {
  available: boolean;
  isProduction: boolean;
  error?: string;
  code?: string;
  diagnostic?: any;
} {
  const isProd = isProductionEnv();
  const connected = isMySqlConnected();

  if (isProd && !connected) {
    const diag = getSafeMySqlDiagnosticInfo();
    return {
      available: false,
      isProduction: true,
      error: 'Database unavailable: Failed to connect to production MySQL database.',
      code: 'MYSQL_UNAVAILABLE',
      diagnostic: {
        failureCategory: diag.lastError?.failureCategory || 'UNKNOWN',
        errorType: diag.lastError?.name || 'MySqlError',
        errorCode: diag.lastError?.code,
        errorMessage: diag.lastError?.message || 'Production MySQL database is not connected. Please verify Vercel Environment Variables.',
        host: diag.host,
        port: diag.port,
        database: diag.database,
        ssl: diag.ssl,
        connectionState: diag.connectionState,
      },
    };
  }

  return {
    available: true,
    isProduction: isProd,
  };
}

/**
 * Ensures all required tables and initial seed data exist in MySQL.
 */
export async function initializeDatabase(): Promise<void> {
  const currentPool = getPool();

  // Create tables using safe CREATE TABLE IF NOT EXISTS
  const tableStatements = [
    `CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL UNIQUE,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL UNIQUE,
      mobile VARCHAR(32) NULL UNIQUE,
      address TEXT NULL,
      password_hash VARCHAR(255) NOT NULL,
      loyalty_tier VARCHAR(100) NOT NULL DEFAULT 'Fresh Member',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customers_customer_id (customer_id),
      INDEX idx_customers_email (email),
      INDEX idx_customers_mobile (mobile)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS addresses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL,
      address_id VARCHAR(64) NOT NULL UNIQUE,
      label VARCHAR(100) NOT NULL DEFAULT 'Primary Delivery',
      full_address TEXT NOT NULL,
      city VARCHAR(100) NOT NULL DEFAULT '',
      state VARCHAR(100) NOT NULL DEFAULT '',
      pincode VARCHAR(20) NOT NULL DEFAULT '',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_addresses_customer_id (customer_id),
      INDEX idx_addresses_address_id (address_id),
      CONSTRAINT fk_addresses_customer
        FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      supplier VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      quantity INT NOT NULL DEFAULT 0,
      unit VARCHAR(50) NOT NULL,
      image TEXT NULL,
      description TEXT NULL,
      sku VARCHAR(100) NULL,
      badge VARCHAR(100) NULL,
      is_organic BOOLEAN NOT NULL DEFAULT FALSE,
      is_quick_prep BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_products_product_id (product_id),
      INDEX idx_products_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS carts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_carts_customer_id (customer_id),
      CONSTRAINT fk_carts_customer
        FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS cart_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cart_id INT NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cart_product (cart_id, product_id),
      INDEX idx_cart_items_cart_id (cart_id),
      INDEX idx_cart_items_product_id (product_id),
      CONSTRAINT fk_cart_items_cart
        FOREIGN KEY (cart_id) REFERENCES carts (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT fk_cart_items_product
        FOREIGN KEY (product_id) REFERENCES products (product_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(64) NOT NULL UNIQUE,
      customer_id VARCHAR(64) NOT NULL,
      customer_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL,
      mobile VARCHAR(32) NULL,
      delivery_address TEXT NOT NULL,
      delivery_time_slot VARCHAR(100) NULL,
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      coupon_code VARCHAR(64) NULL,
      status VARCHAR(64) NOT NULL DEFAULT 'Picking',
      payment_id VARCHAR(64) NULL,
      payment_method VARCHAR(32) NOT NULL DEFAULT 'COD',
      payment_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_orders_order_id (order_id),
      INDEX idx_orders_customer_id (customer_id),
      INDEX idx_orders_status (status),
      INDEX idx_orders_payment_status (payment_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(64) NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      unit VARCHAR(50) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_order_items_order_id (order_id),
      INDEX idx_order_items_product_id (product_id),
      CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id) REFERENCES orders (order_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS coupons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      coupon_code VARCHAR(64) NOT NULL UNIQUE,
      discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      minimum_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      description TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_coupons_coupon_code (coupon_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS otp_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(64) NOT NULL UNIQUE,
      customer_id VARCHAR(64) NOT NULL,
      otp_code VARCHAR(16) NULL,
      otp_hash VARCHAR(255) NOT NULL,
      otp_salt VARCHAR(255) NOT NULL,
      expires_at BIGINT NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 5,
      verified_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_otp_order_id (order_id),
      INDEX idx_otp_order_id (order_id),
      INDEX idx_otp_customer_id (customer_id),
      INDEX idx_otp_used (used)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS inventory_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id VARCHAR(64) NOT NULL,
      previous_quantity INT NOT NULL,
      new_quantity INT NOT NULL,
      change_quantity INT NOT NULL,
      action VARCHAR(64) NOT NULL,
      notes TEXT NULL,
      operator VARCHAR(100) NOT NULL DEFAULT 'Admin',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_inv_logs_product_id (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      payment_id VARCHAR(64) NOT NULL UNIQUE,
      order_id VARCHAR(64) NOT NULL,
      customer_id VARCHAR(64) NOT NULL,
      payment_method ENUM('COD', 'RAZORPAY') NOT NULL DEFAULT 'COD',
      payment_status ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
      amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      razorpay_order_id VARCHAR(100) NULL,
      razorpay_payment_id VARCHAR(100) NULL,
      razorpay_signature VARCHAR(255) NULL,
      paid_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_payments_payment_id (payment_id),
      INDEX idx_payments_order_id (order_id),
      INDEX idx_payments_customer_id (customer_id),
      INDEX idx_payments_status (payment_status),
      CONSTRAINT fk_payments_order
        FOREIGN KEY (order_id) REFERENCES orders (order_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT fk_payments_customer
        FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS app_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      setting_key VARCHAR(64) NOT NULL UNIQUE,
      setting_value JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_settings_key (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  ];

  for (const sql of tableStatements) {
    await currentPool.query(sql);
  }

  // Ensure otp_records has otp_code column if the table already existed from an earlier schema
  try {
    await currentPool.query('ALTER TABLE otp_records ADD COLUMN otp_code VARCHAR(16) NULL AFTER customer_id');
  } catch {
    // Ignore if column already exists
  }

  // Seed default data if tables are empty
  await seedInitialDataIfDbEmpty();
}

/**
 * Seeds initial customer, product, order, coupon, and settings data into MySQL.
 */
export async function seedInitialDataIfDbEmpty(): Promise<void> {
  const currentPool = getPool();

  try {
    // 1. Seed Customers
    const [custRows] = await currentPool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM customers');
    if (custRows[0].count === 0) {
      const defaultPasswordHash = await bcrypt.hash('password123', 10);
      const initialCustomers = [
        {
          customer_id: 'rahul123',
          full_name: 'Rahul',
          email: 'rahul@example.com',
          mobile: '+919876543210',
          address: 'Flat 402, Green Meadows, Bengaluru 560001',
          password_hash: defaultPasswordHash,
          loyalty_tier: 'Fresh Gold Member (5% Cashback)',
        },
        {
          customer_id: 'priya123',
          full_name: 'Priya Sharma',
          email: 'priya@example.com',
          mobile: '+919123456789',
          address: 'Apt 304, Palm Grove, Koramangala, Bengaluru 560034',
          password_hash: defaultPasswordHash,
          loyalty_tier: 'Fresh Gold Member (5% Cashback)',
        },
        {
          customer_id: 'cust-demo-1',
          full_name: 'Alex Morgan',
          email: 'customer@freshcart.com',
          mobile: '+919876501234',
          address: '742 Evergreen Terrace, Apt 4B, Springfield, OR 97477',
          password_hash: defaultPasswordHash,
          loyalty_tier: 'Fresh Gold Member (5% Cashback)',
        },
      ];

      for (const c of initialCustomers) {
        await currentPool.query(
          `INSERT INTO customers (customer_id, full_name, email, mobile, address, password_hash, loyalty_tier)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)`,
          [c.customer_id, c.full_name, c.email, c.mobile, c.address, c.password_hash, c.loyalty_tier]
        );

        // Add primary address
        await currentPool.query(
          `INSERT INTO addresses (customer_id, address_id, label, full_address, city, state, pincode, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE full_address = VALUES(full_address)`,
          [c.customer_id, `addr-${c.customer_id}`, 'Primary Delivery', c.address, 'Bengaluru', 'KA', '560001', true]
        );
      }
      console.log('[MySQL] Seeded initial customer records.');
    }

    // 2. Seed Products
    const [prodRows] = await currentPool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM products');
    if (prodRows[0].count === 0) {
      const initialProducts = [
        {
          product_id: 'prod-1',
          name: 'Organic Farm Bananas',
          category: 'produce',
          supplier: 'Farm Fresh Produce',
          price: 69,
          quantity: 34,
          unit: '1 kg',
          sku: 'SKU-4011',
          badge: 'Organic',
          is_organic: true,
          is_quick_prep: true,
          image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDRPtAAfQ0msd8om5b13LdWSnlALQC0KaZsuZ1i82QU87ERyr4gW9xmcjbJTg26K_BoXWtxJwKqajSLNxgHhA1DcOBT6Eyt52YY5CD9gkLyx2dqxt-0l08U1rjvIJB18ygFiAu7E88Sj2MVrfntcsapquOEdSVNlvIlQVGUqVzkTxk1JcOHk7mtwTTHpGA6T55Fe4PHQPZgWE-4cnHcdVhfGQQvScntByzcUfVEwk18nNl3tc6KozSg',
          description: 'Certified pesticide-free Cavendish bananas harvested daily. Rich in potassium and natural energy.',
        },
        {
          product_id: 'prod-2',
          name: 'Fresh Pasteurized Pure Cow Milk',
          category: 'dairy',
          supplier: 'Pasture Valley Co-Op',
          price: 30,
          quantity: 18,
          unit: '500 ml',
          sku: 'SKU-1092',
          badge: 'Local Dairy',
          is_organic: true,
          is_quick_prep: false,
          image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD1dWU161rAG646dME8h1qHtBP1YOn_oMaScwkMUD3fELF9BLUxLARDMf5Hm1fCPW9nuqu2Dg_xmcUbjYJc8EqG82T43L-RGy6OKqyH79D7PcECUlH-Mdupmzh-RUCs-CAYrWUug4BfgPlymO-C-etcRmYXBOcK05wBtH-F6FFPNnHSkYJY8oMf5W1xuNN_UqSBEzpjQdC6zQ7kVG7kwaUxCGRDSYCr3xvciz98pCBv1rIRPQbID99j',
          description: 'Fresh cow milk from pasture-raised Jersey cows. Lightly pasteurized with natural cream-top flavor.',
        },
        {
          product_id: 'prod-3',
          name: 'Crisp Honeycrisp Apples',
          category: 'produce',
          supplier: 'Washington Orchards',
          price: 199,
          quantity: 4,
          unit: '1 kg',
          sku: 'SKU-3283',
          badge: 'Orchard Fresh',
          is_organic: true,
          is_quick_prep: true,
          image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkhUc0J8xhdkClmUzodiIliTFKq4lADc8fmjMK4Fjpt1Qp8ffouwyTEEDqq9F_3TrySKQiCM_3c27BFeENyHrTsBrnOiiij2ZJZYdj5_Phf5dBjECA02xOIQ4ffA3fe2XjiW2lD43fuCUDYyCLBCBg-4Game01zlvgvdJqn_unPS_v4g__att35guASwN4wZWeRtTXGSjR5ahppXHZaBvzkPdAVABnd48s_cVO9Ramfw4aZ47ozFSj',
          description: 'Crisp, sweet, and honey-aromatic heirloom apples with natural red and yellow blush. Perfect crunch.',
        },
        {
          product_id: 'prod-4',
          name: 'Fresh Sourdough Artisanal Loaf',
          category: 'bakery',
          supplier: 'Hearthstone Bakery',
          price: 149,
          quantity: 12,
          unit: '1 piece',
          sku: 'SKU-5501',
          badge: 'Baked Today',
          is_organic: true,
          is_quick_prep: true,
          image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBkkGG7cf2EwYntcJnfvmcVMchZlgc-1U2laghJWrRKRqUXB_qCiI78uEVko30dARWxkK43LDPU59BshYM7O1Kh7ZBanHTJnyd3q9nFoqw_VXblvZTAvmxdJ2iF61wPIsrl-OKsL0f-ZqFIhHQmaOw5gzGquO2CU0eADw_b7P_UUbVAnrkkb3l_uVy_YQoWOQp3dc4CQgBp_NYqka2GhhsI6QlGu6QpNQzQfOVPEKWZUv2A-ZavN_lk',
          description: 'Stone-milled organic flour fermented with wild 35-year sourdough starter. Crusty exterior with airy crumb.',
        },
        {
          product_id: 'prod-5',
          name: 'Fresh Squeezed Valencia Orange Juice',
          category: 'beverages',
          supplier: 'Citrus Sun Orchards',
          price: 50,
          quantity: 20,
          unit: '1 litre',
          sku: 'SKU-8820',
          badge: 'No Added Sugar',
          is_organic: true,
          is_quick_prep: true,
          image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuACU36F_K3Z-e37yK710r47-F4t2q62V1g62xK69J4-5p-9F8g993F5J1920t-1g0_3x3q-59_9w1234567890abcdef',
          description: '100% pure cold-pressed Valencia orange juice without preservatives, added sugars, or concentrates.',
        },
        {
          product_id: 'prod-6',
          name: 'Premium Basmati Rice',
          category: 'grains',
          supplier: 'Royal Grain Mills',
          price: 120,
          quantity: 50,
          unit: '1 kg',
          sku: 'SKU-7721',
          badge: 'Aged 2 Years',
          is_organic: false,
          is_quick_prep: false,
          image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD2NzJq7bLWIA_LHQGqx4P7BD7oWQ40AJ0DDE7RugR7iiOeBvVArIJ2Jvuai-yk_Dq0y7w34ksB7tbPA6yYLjPKnsM-9d7hL6KVF5LNQ9DOJQLINYR0SCD2iIl12t5yOQmF2sAbp3izYI7pO8ehlQGZoyUs0RujTlTvFvJsk7d1csJj6AELcBQHyJan2ld0Fdl7nAjjMbnLgMlh5ClP3Nf6RhpFvaStTj44QLnTx90Wep-dUAateYmO',
          description: 'Long-grain aromatic basmati rice carefully aged for maximum fragrance and fluffy texture.',
        },
      ];

      for (const p of initialProducts) {
        await currentPool.query(
          `INSERT INTO products (product_id, name, category, supplier, price, quantity, unit, sku, badge, is_organic, is_quick_prep, image, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), quantity = VALUES(quantity)`,
          [
            p.product_id,
            p.name,
            p.category,
            p.supplier,
            p.price,
            p.quantity,
            p.unit,
            p.sku,
            p.badge,
            p.is_organic,
            p.is_quick_prep,
            p.image,
            p.description,
          ]
        );
      }
      console.log('[MySQL] Seeded initial product records.');
    }

    // 3. Seed Coupons
    const [couponRows] = await currentPool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM coupons');
    if (couponRows[0].count === 0) {
      const initialCoupons = [
        { code: 'SAVE5', discountPercentage: 5, minOrderAmount: 1000, description: '5% OFF on orders ₹1,000+' },
        { code: 'SAVE7', discountPercentage: 7, minOrderAmount: 1500, description: '7% OFF on orders ₹1,500+' },
        { code: 'SAVE10', discountPercentage: 10, minOrderAmount: 2000, description: '10% OFF on orders ₹2,000+' },
        { code: 'SAVE20', discountPercentage: 20, minOrderAmount: 3000, description: '20% OFF super savings on orders ₹3,000+' },
      ];

      for (const cp of initialCoupons) {
        await currentPool.query(
          `INSERT INTO coupons (coupon_code, discount_percentage, minimum_order_amount, enabled, description)
           VALUES (?, ?, ?, TRUE, ?)
           ON DUPLICATE KEY UPDATE discount_percentage = VALUES(discount_percentage)`,
          [cp.code, cp.discountPercentage, cp.minOrderAmount, cp.description]
        );
      }
      console.log('[MySQL] Seeded initial coupons.');
    }

    // 4. Seed Orders
    const [orderRows] = await currentPool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM orders');
    if (orderRows[0].count === 0) {
      const initialOrders = [
        {
          order_id: '#FC-1005',
          customer_id: 'rahul123',
          customer_name: 'Rahul',
          email: 'rahul@example.com',
          mobile: '+919876543210',
          delivery_address: 'Flat 402, Green Meadows, Bengaluru 560001',
          subtotal: 300,
          discount: 0,
          total: 300,
          status: 'Picking',
          items: [
            { product_id: 'prod-1', product_name: 'Organic Farm Bananas', quantity: 2, unit: '1 kg', price: 69, subtotal: 138 },
            { product_id: 'prod-4', product_name: 'Fresh Sourdough Artisanal Loaf', quantity: 1, unit: '1 piece', price: 149, subtotal: 149 },
          ],
        },
        {
          order_id: '#FC-1006',
          customer_id: 'priya123',
          customer_name: 'Priya Sharma',
          email: 'priya@example.com',
          mobile: '+919123456789',
          delivery_address: 'Apt 304, Palm Grove, Koramangala, Bengaluru 560034',
          subtotal: 210,
          discount: 0,
          total: 210,
          status: 'Picking',
          items: [
            { product_id: 'prod-2', product_name: 'Fresh Pasteurized Pure Cow Milk', quantity: 2, unit: '500 ml', price: 30, subtotal: 60 },
            { product_id: 'prod-5', product_name: 'Fresh Squeezed Valencia Orange Juice', quantity: 3, unit: '1 litre', price: 50, subtotal: 150 },
          ],
        },
        {
          order_id: '#1001',
          customer_id: 'rahul123',
          customer_name: 'Rahul',
          email: 'rahul@example.com',
          mobile: '+919876543210',
          delivery_address: 'Flat 402, Green Meadows, Bengaluru 560001',
          subtotal: 300,
          discount: 0,
          total: 300,
          status: 'Picking',
          items: [
            { product_id: 'prod-1', product_name: 'Organic Farm Bananas', quantity: 2, unit: '1 kg', price: 69, subtotal: 138 },
          ],
        },
        {
          order_id: '#FC-94821',
          customer_id: 'cust-demo-1',
          customer_name: 'Alex Morgan',
          email: 'customer@freshcart.com',
          mobile: '+919876501234',
          delivery_address: '742 Evergreen Terrace, Apt 4B, Springfield, OR 97477',
          subtotal: 217,
          discount: 0,
          total: 217,
          status: 'Picking',
          items: [
            { product_id: 'prod-3', product_name: 'Crisp Honeycrisp Apples', quantity: 1, unit: '1 kg', price: 199, subtotal: 199 },
          ],
        },
      ];

      for (const ord of initialOrders) {
        await currentPool.query(
          `INSERT INTO orders (order_id, customer_id, customer_name, email, mobile, delivery_address, subtotal, discount, total, status, payment_method, payment_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COD', 'PENDING')
           ON DUPLICATE KEY UPDATE status = VALUES(status)`,
          [ord.order_id, ord.customer_id, ord.customer_name, ord.email, ord.mobile, ord.delivery_address, ord.subtotal, ord.discount, ord.total, ord.status]
        );

        for (const it of ord.items) {
          await currentPool.query(
            `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit, price, subtotal)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [ord.order_id, it.product_id, it.product_name, it.quantity, it.unit, it.price, it.subtotal]
          );
        }
      }
      console.log('[MySQL] Seeded initial order records.');
    }

    // 5. Seed App Settings
    const [settingsRows] = await currentPool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM app_settings');
    if (settingsRows[0].count === 0) {
      const defaultRules = [
        { id: 'rule-0', minOrderAmount: 0, deliveryCharge: 40 },
        { id: 'rule-500', minOrderAmount: 500, deliveryCharge: 30 },
        { id: 'rule-1000', minOrderAmount: 1000, deliveryCharge: 25 },
        { id: 'rule-1500', minOrderAmount: 1500, deliveryCharge: 12 },
        { id: 'rule-2000', minOrderAmount: 2000, deliveryCharge: 10 },
        { id: 'rule-2500', minOrderAmount: 2500, deliveryCharge: 5 },
        { id: 'rule-3000', minOrderAmount: 3000, deliveryCharge: 0 },
        { id: 'rule-5000', minOrderAmount: 5000, deliveryCharge: 0 },
      ];
      await currentPool.query(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        ['delivery_settings', JSON.stringify({ deliveryChargeRules: defaultRules, deliveryCharges: 40 })]
      );
      console.log('[MySQL] Seeded default app settings.');
    }
  } catch (err: any) {
    console.warn('[MySQL Seed Error]:', err?.message);
  }
}

// -----------------------------------------------------------------------------
// CUSTOMER OPERATIONS
// -----------------------------------------------------------------------------

/**
 * Finds a customer by customer_id, email, or mobile number.
 */
export async function findCustomerInDb(identifier: string): Promise<any | null> {
  if (!identifier) return null;
  const pool = getPool();
  const clean = identifier.trim();
  const cleanEmail = clean.toLowerCase();

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, customer_id as id_str, customer_id, full_name as name, email, mobile as phone, address,
              password_hash as passwordHash, loyalty_tier as loyaltyTier, created_at as createdAt
       FROM customers
       WHERE customer_id = ? OR email = ? OR mobile = ?
       LIMIT 1`,
      [clean, cleanEmail, clean]
    );

    if (rows.length === 0) return null;
    const customer = rows[0];

    // Fetch saved addresses
    const [addrRows] = await pool.query<RowDataPacket[]>(
      `SELECT address_id as id, label, full_address as street, city, state, pincode as zip, is_default as isDefault
       FROM addresses
       WHERE customer_id = ?
       ORDER BY is_default DESC, id ASC`,
      [customer.customer_id]
    );

    return {
      id: customer.customer_id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address || '',
      savedAddresses: addrRows,
      passwordHash: customer.passwordHash,
      loyaltyTier: customer.loyaltyTier,
      createdAt: customer.createdAt,
    };
  } catch (err: any) {
    console.warn('[MySQL] Error querying customer:', err?.message);
    return null;
  }
}

/**
 * Upserts a customer into MySQL database.
 */
export async function upsertCustomerInDb(customerData: any): Promise<boolean> {
  if (!customerData?.id && !customerData?.customer_id) return false;
  const customerId = customerData.customer_id || customerData.id;
  const fullName = customerData.name || customerData.full_name || 'Customer';
  const email = (customerData.email || '').trim().toLowerCase();
  const mobile = (customerData.phone || customerData.mobile || '').trim();
  const address = customerData.address || '';
  const passwordHash = customerData.passwordHash || customerData.password_hash || '';
  const loyaltyTier = customerData.loyaltyTier || customerData.loyalty_tier || 'Fresh Member';

  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO customers (customer_id, full_name, email, mobile, address, password_hash, loyalty_tier)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         full_name = VALUES(full_name),
         address = VALUES(address),
         loyalty_tier = VALUES(loyalty_tier),
         password_hash = IF(VALUES(password_hash) != '', VALUES(password_hash), password_hash)`,
      [customerId, fullName, email || null, mobile || null, address, passwordHash, loyaltyTier]
    );

    // Synchronize addresses if provided
    if (Array.isArray(customerData.savedAddresses)) {
      for (const addr of customerData.savedAddresses) {
        if (!addr.id && !addr.street && !addr.full_address) continue;
        const addrId = addr.id || `addr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const label = addr.label || 'Delivery Address';
        const fullAddr = addr.street || addr.full_address || address;
        const city = addr.city || 'Bengaluru';
        const state = addr.state || 'KA';
        const pincode = addr.zip || addr.pincode || '560001';
        const isDefault = Boolean(addr.isDefault);

        await pool.query(
          `INSERT INTO addresses (customer_id, address_id, label, full_address, city, state, pincode, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             label = VALUES(label),
             full_address = VALUES(full_address),
             city = VALUES(city),
             state = VALUES(state),
             pincode = VALUES(pincode),
             is_default = VALUES(is_default)`,
          [customerId, addrId, label, fullAddr, city, state, pincode, isDefault]
        );
      }
    }

    return true;
  } catch (err: any) {
    console.error('[MySQL] Error upserting customer:', err?.message);
    return false;
  }
}

/**
 * Retrieves all customers.
 */
export async function getCustomersFromDb(): Promise<any[]> {
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT customer_id as id, full_name as name, email, mobile as phone, address,
              loyalty_tier as loyaltyTier, created_at as createdAt
       FROM customers
       ORDER BY created_at DESC`
    );
    return rows;
  } catch (err: any) {
    console.warn('[MySQL] Error querying customers:', err?.message);
    return [];
  }
}

/**
 * Updates customer profile details in MySQL.
 */
export async function updateCustomerProfileInDb(
  customerId: string,
  updates: { name?: string; phone?: string; address?: string }
): Promise<boolean> {
  const pool = getPool();
  try {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('full_name = ?');
      values.push(updates.name);
    }
    if (updates.phone !== undefined) {
      fields.push('mobile = ?');
      values.push(updates.phone);
    }
    if (updates.address !== undefined) {
      fields.push('address = ?');
      values.push(updates.address);
    }

    if (fields.length === 0) return true;

    values.push(customerId);
    await pool.query(
      `UPDATE customers SET ${fields.join(', ')} WHERE customer_id = ?`,
      values
    );
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error updating customer profile:', err?.message);
    return false;
  }
}

/**
 * Adds or updates a customer saved delivery address in MySQL.
 */
export async function addCustomerAddressInDb(
  customerId: string,
  address: { id?: string; label: string; street: string; city: string; state: string; zip: string; isDefault?: boolean }
): Promise<boolean> {
  const pool = getPool();
  const addressId = address.id || `addr-${Date.now()}`;
  try {
    if (address.isDefault) {
      await pool.query('UPDATE addresses SET is_default = FALSE WHERE customer_id = ?', [customerId]);
    }
    await pool.query(
      `INSERT INTO addresses (customer_id, address_id, label, full_address, city, state, pincode, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         label = VALUES(label),
         full_address = VALUES(full_address),
         city = VALUES(city),
         state = VALUES(state),
         pincode = VALUES(pincode),
         is_default = VALUES(is_default)`,
      [
        customerId,
        addressId,
        address.label,
        address.street,
        address.city,
        address.state,
        address.zip,
        Boolean(address.isDefault),
      ]
    );
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error adding customer address:', err?.message);
    return false;
  }
}

// -----------------------------------------------------------------------------
// PRODUCT & INVENTORY OPERATIONS
// -----------------------------------------------------------------------------

/**
 * Retrieves products from MySQL with optional search / category filter.
 */
export async function getProductsFromDb(filters?: { category?: string; search?: string }): Promise<any[]> {
  const pool = getPool();
  try {
    let sql = `
      SELECT product_id as id, name as title, category, supplier, price,
             quantity as stock, unit, image, description, sku, badge,
             is_organic as isOrganic, is_quick_prep as isQuickPrep,
             created_at as createdAt, updated_at as updatedAt
      FROM products
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.category && filters.category !== 'all') {
      sql += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters?.search && filters.search.trim()) {
      sql += ' AND (name LIKE ? OR description LIKE ? OR supplier LIKE ?)';
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY id ASC';

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows.map((r) => ({
      ...r,
      price: Number(r.price),
      stock: Number(r.stock),
      isOrganic: Boolean(r.isOrganic),
      isQuickPrep: Boolean(r.isQuickPrep),
      categoryLabel: r.category === 'produce' ? 'Fruits & Veggies' : r.category,
    }));
  } catch (err: any) {
    console.warn('[MySQL] Error querying products:', err?.message);
    return [];
  }
}

/**
 * Finds a single product by product_id.
 */
export async function findProductInDb(productId: string): Promise<any | null> {
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT product_id as id, name as title, category, supplier, price,
              quantity as stock, unit, image, description, sku, badge,
              is_organic as isOrganic, is_quick_prep as isQuickPrep
       FROM products
       WHERE product_id = ?
       LIMIT 1`,
      [productId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      price: Number(r.price),
      stock: Number(r.stock),
      isOrganic: Boolean(r.isOrganic),
      isQuickPrep: Boolean(r.isQuickPrep),
    };
  } catch (err: any) {
    console.warn('[MySQL] Error finding product:', err?.message);
    return null;
  }
}

/**
 * Inserts a new product into MySQL.
 */
export async function createProductInDb(p: any): Promise<boolean> {
  const pool = getPool();
  try {
    const productId = p.id || `prod-${Date.now()}`;
    await pool.query(
      `INSERT INTO products (product_id, name, category, supplier, price, quantity, unit, image, description, sku, badge, is_organic, is_quick_prep)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        p.title || p.name,
        p.category || 'produce',
        p.supplier || 'Fresh Supplier',
        Math.max(0, Number(p.price) || 0),
        Math.max(0, Number(p.stock ?? p.quantity) || 0),
        p.unit || '1 kg',
        p.image || '',
        p.description || '',
        p.sku || `SKU-${Date.now().toString().slice(-4)}`,
        p.badge || '',
        Boolean(p.isOrganic),
        Boolean(p.isQuickPrep),
      ]
    );

    // Record inventory log
    await pool.query(
      `INSERT INTO inventory_logs (product_id, previous_quantity, new_quantity, change_quantity, action, notes, operator)
       VALUES (?, 0, ?, ?, 'ADD_PRODUCT', 'Initial product creation', 'Admin')`,
      [productId, Math.max(0, Number(p.stock ?? p.quantity) || 0), Math.max(0, Number(p.stock ?? p.quantity) || 0)]
    );

    return true;
  } catch (err: any) {
    console.error('[MySQL] Error creating product:', err?.message);
    return false;
  }
}

/**
 * Updates an existing product in MySQL.
 */
export async function updateProductInDb(productId: string, updates: any): Promise<boolean> {
  const pool = getPool();
  try {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined || updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.title || updates.name);
    }
    if (updates.category !== undefined) {
      fields.push('category = ?');
      values.push(updates.category);
    }
    if (updates.supplier !== undefined) {
      fields.push('supplier = ?');
      values.push(updates.supplier);
    }
    if (updates.price !== undefined) {
      fields.push('price = ?');
      values.push(Math.max(0, Number(updates.price) || 0));
    }
    if (updates.stock !== undefined || updates.quantity !== undefined) {
      fields.push('quantity = ?');
      values.push(Math.max(0, Number(updates.stock ?? updates.quantity) || 0));
    }
    if (updates.unit !== undefined) {
      fields.push('unit = ?');
      values.push(updates.unit);
    }
    if (updates.image !== undefined) {
      fields.push('image = ?');
      values.push(updates.image);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.badge !== undefined) {
      fields.push('badge = ?');
      values.push(updates.badge);
    }

    if (fields.length === 0) return true;

    values.push(productId);
    await pool.query(
      `UPDATE products SET ${fields.join(', ')} WHERE product_id = ?`,
      values
    );
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error updating product:', err?.message);
    return false;
  }
}

/**
 * Deletes a product from MySQL.
 */
export async function deleteProductInDb(productId: string): Promise<boolean> {
  const pool = getPool();
  try {
    await pool.query('DELETE FROM products WHERE product_id = ?', [productId]);
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error deleting product:', err?.message);
    return false;
  }
}

/**
 * Updates a product's stock quantity and creates an inventory audit log.
 */
export async function updateProductQuantityInDb(
  productId: string,
  newQuantity: number,
  action: string,
  notes: string = '',
  operator: string = 'Admin'
): Promise<{ success: boolean; previousQuantity: number; newQuantity: number }> {
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT quantity FROM products WHERE product_id = ? LIMIT 1',
      [productId]
    );

    const prevQty = rows.length > 0 ? Number(rows[0].quantity) : 0;
    const safeNewQty = Math.max(0, Math.floor(newQuantity));
    const changeQty = safeNewQty - prevQty;

    await pool.query(
      'UPDATE products SET quantity = ? WHERE product_id = ?',
      [safeNewQty, productId]
    );

    await pool.query(
      `INSERT INTO inventory_logs (product_id, previous_quantity, new_quantity, change_quantity, action, notes, operator)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [productId, prevQty, safeNewQty, changeQty, action, notes, operator]
    );

    return { success: true, previousQuantity: prevQty, newQuantity: safeNewQty };
  } catch (err: any) {
    console.error('[MySQL] Error updating product quantity:', err?.message);
    return { success: false, previousQuantity: 0, newQuantity: 0 };
  }
}

/**
 * Retrieves inventory audit logs from MySQL.
 */
export async function getInventoryLogsFromDb(): Promise<any[]> {
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT l.id, l.product_id as sku, p.name as productTitle,
              l.action as changeType, l.change_quantity as quantityChange,
              l.new_quantity as newStock, l.operator, l.notes,
              l.created_at as timestamp
       FROM inventory_logs l
       LEFT JOIN products p ON l.product_id = p.product_id
       ORDER BY l.created_at DESC
       LIMIT 100`
    );
    return rows;
  } catch (err: any) {
    console.warn('[MySQL] Error querying inventory logs:', err?.message);
    return [];
  }
}

// -----------------------------------------------------------------------------
// CART OPERATIONS
// -----------------------------------------------------------------------------

/**
 * Retrieves the cart and cart items for a logged-in customer from MySQL.
 */
export async function getCartForCustomerInDb(customerId: string): Promise<any[]> {
  if (!customerId) return [];
  const pool = getPool();

  try {
    // 1. Get or create cart
    const [cartRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM carts WHERE customer_id = ? LIMIT 1',
      [customerId]
    );

    let cartId: number;
    if (cartRows.length === 0) {
      const [insertRes] = await pool.query<ResultSetHeader>(
        'INSERT INTO carts (customer_id) VALUES (?)',
        [customerId]
      );
      cartId = insertRes.insertId;
    } else {
      cartId = cartRows[0].id;
    }

    // 2. Fetch cart items joined with products
    const [items] = await pool.query<RowDataPacket[]>(
      `SELECT ci.quantity, p.product_id as id, p.name as title, p.price, p.unit,
              p.quantity as stock, p.image, p.category, p.supplier, p.badge,
              p.is_organic as isOrganic, p.is_quick_prep as isQuickPrep
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.product_id
       WHERE ci.cart_id = ? AND ci.quantity > 0`,
      [cartId]
    );

    return items.map((i) => ({
      product: {
        id: i.id,
        title: i.title,
        price: Number(i.price),
        unit: i.unit,
        stock: Number(i.stock),
        image: i.image,
        category: i.category,
        supplier: i.supplier,
        badge: i.badge,
        isOrganic: Boolean(i.isOrganic),
        isQuickPrep: Boolean(i.isQuickPrep),
      },
      quantity: Number(i.quantity),
    }));
  } catch (err: any) {
    console.warn('[MySQL] Error retrieving customer cart:', err?.message);
    return [];
  }
}

/**
 * Adds or updates a product in a customer's cart.
 * If quantity reaches 0, the product is removed from the cart.
 */
export async function saveCartItemInDb(
  customerId: string,
  productId: string,
  quantity: number
): Promise<boolean> {
  if (!customerId || !productId) return false;
  const pool = getPool();

  try {
    // Ensure cart exists
    const [cartRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM carts WHERE customer_id = ? LIMIT 1',
      [customerId]
    );

    let cartId: number;
    if (cartRows.length === 0) {
      const [insertRes] = await pool.query<ResultSetHeader>(
        'INSERT INTO carts (customer_id) VALUES (?)',
        [customerId]
      );
      cartId = insertRes.insertId;
    } else {
      cartId = cartRows[0].id;
    }

    // If quantity is 0 or less, remove the item
    if (quantity <= 0) {
      await pool.query('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', [cartId, productId]);
      return true;
    }

    // Upsert cart item
    await pool.query(
      `INSERT INTO cart_items (cart_id, product_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
      [cartId, productId, quantity]
    );

    return true;
  } catch (err: any) {
    console.error('[MySQL] Error saving cart item:', err?.message);
    return false;
  }
}

/**
 * Removes an item from the customer's cart.
 */
export async function removeCartItemInDb(customerId: string, productId: string): Promise<boolean> {
  if (!customerId || !productId) return false;
  const pool = getPool();

  try {
    const [cartRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM carts WHERE customer_id = ? LIMIT 1',
      [customerId]
    );
    if (cartRows.length === 0) return true;
    const cartId = cartRows[0].id;

    await pool.query('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', [cartId, productId]);
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error removing cart item:', err?.message);
    return false;
  }
}

/**
 * Clears the customer's cart.
 */
export async function clearCartInDb(customerId: string): Promise<boolean> {
  if (!customerId) return false;
  const pool = getPool();

  try {
    const [cartRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM carts WHERE customer_id = ? LIMIT 1',
      [customerId]
    );
    if (cartRows.length === 0) return true;
    const cartId = cartRows[0].id;

    await pool.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error clearing cart:', err?.message);
    return false;
  }
}

// -----------------------------------------------------------------------------
// ORDER OPERATIONS
// -----------------------------------------------------------------------------

/**
 * Upserts / creates an order in MySQL, including order items and payment record.
 */
export async function upsertOrderInDb(orderData: any): Promise<boolean> {
  if (!orderData?.id) return false;
  const pool = getPool();
  const orderId = orderData.id;
  const customerId = orderData.customerId || 'guest';
  const customerName = orderData.customerName || 'Customer';
  const email = orderData.customerEmail || orderData.email || '';
  const mobile = orderData.customerPhone || orderData.phone || orderData.mobile || '';
  const deliveryAddress = orderData.deliveryAddress || 'Address on file';
  const subtotal = Math.max(0, Number(orderData.subtotal) || 0);
  const discount = Math.max(0, Number(orderData.discount) || 0);
  const total = Math.max(0, Number(orderData.total) || 0);
  const couponCode = orderData.couponCode || null;
  const status = orderData.status || 'Picking';
  const paymentMethod = orderData.paymentMethod || 'COD';
  const paymentStatus = orderData.paymentStatus || 'PENDING';
  const paymentId = orderData.paymentId || `PAY-${orderId.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Ensure customer exists if customerId is provided
    if (customerId && customerId !== 'guest') {
      const defaultHash = await bcrypt.hash('password123', 10);
      await connection.query(
        `INSERT INTO customers (customer_id, full_name, email, mobile, address, password_hash)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)`,
        [customerId, customerName, email || null, mobile || null, deliveryAddress, defaultHash]
      );
    }

    // 2. Insert or update order
    await connection.query(
      `INSERT INTO orders (order_id, customer_id, customer_name, email, mobile, delivery_address, subtotal, discount, total, coupon_code, status, payment_id, payment_method, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         delivery_address = VALUES(delivery_address),
         payment_status = VALUES(payment_status)`,
      [
        orderId,
        customerId,
        customerName,
        email || null,
        mobile || null,
        deliveryAddress,
        subtotal,
        discount,
        total,
        couponCode,
        status,
        paymentId,
        paymentMethod,
        paymentStatus,
      ]
    );

    // 3. Insert order items if present
    if (Array.isArray(orderData.items) && orderData.items.length > 0) {
      await connection.query('DELETE FROM order_items WHERE order_id = ?', [orderId]);

      for (const item of orderData.items) {
        const prod = item.product || item;
        const prodId = prod.id || prod.product_id || `prod-item`;
        const prodTitle = prod.title || prod.name || prod.product_name || 'Product';
        const qty = Math.max(1, Number(item.quantity) || 1);
        const unit = prod.unit || '1 kg';
        const price = Math.max(0, Number(prod.price) || 0);
        const itemSubtotal = price * qty;

        await connection.query(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit, price, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [orderId, prodId, prodTitle, qty, unit, price, itemSubtotal]
        );
      }
    }

    // 4. Create/update payments record (Razorpay ready)
    await connection.query(
      `INSERT INTO payments (payment_id, order_id, customer_id, payment_method, payment_status, amount, currency)
       VALUES (?, ?, ?, ?, ?, ?, 'INR')
       ON DUPLICATE KEY UPDATE
         payment_status = VALUES(payment_status)`,
      [
        paymentId,
        orderId,
        customerId,
        paymentMethod === 'RAZORPAY' ? 'RAZORPAY' : 'COD',
        paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
        total,
      ]
    );

    await connection.commit();
    return true;
  } catch (err: any) {
    await connection.rollback();
    console.error('[MySQL] Error saving order:', err?.message);
    return false;
  } finally {
    connection.release();
  }
}

/**
 * Finds an order by its ID, supporting both '#FC-1005' and 'FC-1005' formats.
 */
export async function findOrderInDb(orderId: string): Promise<any | null> {
  if (!orderId) return null;
  const pool = getPool();
  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT order_id as id, customer_id as customerId, customer_name as customerName,
              email as customerEmail, mobile as customerPhone, delivery_address as deliveryAddress,
              delivery_time_slot as deliveryTimeSlot, subtotal, discount, total,
              coupon_code as couponCode, status, payment_id as paymentId,
              payment_method as paymentMethod, payment_status as paymentStatus,
              created_at as createdAt
       FROM orders
       WHERE order_id IN (?, ?)
       LIMIT 1`,
      [orderId, altId]
    );

    if (rows.length === 0) return null;
    const order = rows[0];

    // Fetch order items
    const [itemRows] = await pool.query<RowDataPacket[]>(
      `SELECT product_id as id, product_name as title, quantity, unit, price, subtotal
       FROM order_items
       WHERE order_id = ?`,
      [order.id]
    );

    order.items = itemRows.map((it) => ({
      product: {
        id: it.id,
        title: it.title,
        price: Number(it.price),
        unit: it.unit,
      },
      quantity: Number(it.quantity),
    }));

    order.subtotal = Number(order.subtotal);
    order.discount = Number(order.discount);
    order.total = Number(order.total);

    return order;
  } catch (err: any) {
    console.warn('[MySQL] Error finding order:', err?.message);
    return null;
  }
}

/**
 * Finds orders for a customer or all orders if customerId is not specified.
 */
export async function findOrdersForCustomerInDb(customerId?: string): Promise<any[]> {
  const pool = getPool();
  try {
    let sql = `
      SELECT order_id as id, customer_id as customerId, customer_name as customerName,
             email as customerEmail, mobile as customerPhone, delivery_address as deliveryAddress,
             delivery_time_slot as deliveryTimeSlot, subtotal, discount, total,
             coupon_code as couponCode, status, payment_id as paymentId,
             payment_method as paymentMethod, payment_status as paymentStatus,
             created_at as createdAt
      FROM orders
    `;
    const params: any[] = [];

    if (customerId && customerId.trim()) {
      sql += ' WHERE customer_id = ?';
      params.push(customerId.trim());
    }

    sql += ' ORDER BY created_at DESC';

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);

    for (const ord of rows) {
      const [itemRows] = await pool.query<RowDataPacket[]>(
        `SELECT product_id as id, product_name as title, quantity, unit, price, subtotal
         FROM order_items
         WHERE order_id = ?`,
        [ord.id]
      );
      ord.items = itemRows.map((it) => ({
        product: {
          id: it.id,
          title: it.title,
          price: Number(it.price),
          unit: it.unit,
        },
        quantity: Number(it.quantity),
      }));
      ord.subtotal = Number(ord.subtotal);
      ord.discount = Number(ord.discount);
      ord.total = Number(ord.total);
    }

    return rows;
  } catch (err: any) {
    console.warn('[MySQL] Error querying orders:', err?.message);
    return [];
  }
}

/**
 * Updates order status in MySQL.
 */
export async function updateOrderStatusInDb(
  orderId: string,
  newStatus: string,
  extraMeta?: any
): Promise<boolean> {
  const pool = getPool();
  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;

  try {
    await pool.query(
      `UPDATE orders SET status = ? WHERE order_id IN (?, ?)`,
      [newStatus, orderId, altId]
    );
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error updating order status:', err?.message);
    return false;
  }
}

/**
 * Deletes an order from MySQL (Admin action only).
 */
export async function deleteOrderInDb(orderId: string): Promise<boolean> {
  const pool = getPool();
  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;

  try {
    await pool.query('DELETE FROM orders WHERE order_id IN (?, ?)', [orderId, altId]);
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error deleting order:', err?.message);
    return false;
  }
}

// -----------------------------------------------------------------------------
// OTP OPERATIONS
// -----------------------------------------------------------------------------

/**
 * Saves or updates an OTP record in MySQL.
 */
export async function saveOtpRecordInDb(record: {
  orderId: string;
  customerId: string;
  otp?: string;
  otpHash: string;
  otpSalt: string;
  expiresAt: number;
  used?: boolean;
}): Promise<boolean> {
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO otp_records (order_id, customer_id, otp_code, otp_hash, otp_salt, expires_at, used)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         otp_code = VALUES(otp_code),
         otp_hash = VALUES(otp_hash),
         otp_salt = VALUES(otp_salt),
         expires_at = VALUES(expires_at),
         used = VALUES(used)`,
      [
        record.orderId,
        record.customerId,
        record.otp || null,
        record.otpHash,
        record.otpSalt,
        record.expiresAt,
        Boolean(record.used),
      ]
    );
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error saving OTP record:', err?.message);
    return false;
  }
}

/**
 * Finds an OTP record by orderId.
 */
export async function findOtpRecordInDb(orderId: string): Promise<any | null> {
  const pool = getPool();
  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT order_id as orderId, customer_id as customerId,
              otp_code as otp, otp_hash as otpHash, otp_salt as otpSalt,
              expires_at as expiresAt, used, attempts, max_attempts as maxAttempts,
              verified_at as verifiedAt
       FROM otp_records
       WHERE order_id IN (?, ?)
       ORDER BY id DESC
       LIMIT 1`,
      [orderId, altId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      otp: r.otp || '',
      expiresAt: Number(r.expiresAt),
      used: Boolean(r.used),
      attempts: Number(r.attempts),
      maxAttempts: Number(r.maxAttempts),
    };
  } catch (err: any) {
    console.warn('[MySQL] Error finding OTP record:', err?.message);
    return null;
  }
}

/**
 * Updates OTP verification state for an order in MySQL.
 */
export async function updateOrderOtpInDb(
  orderId: string,
  otpData: {
    otpStatus?: 'UNUSED' | 'USED' | 'EXPIRED' | 'LOCKED';
    otpVerifiedAt?: string;
    status?: string;
    used?: boolean;
    attempts?: number;
  }
): Promise<boolean> {
  const pool = getPool();
  const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;

  try {
    if (otpData.status !== undefined) {
      await pool.query('UPDATE orders SET status = ? WHERE order_id IN (?, ?)', [otpData.status, orderId, altId]);
    }

    if (otpData.used || otpData.otpStatus === 'USED') {
      await pool.query(
        'UPDATE otp_records SET used = TRUE, verified_at = CURRENT_TIMESTAMP WHERE order_id IN (?, ?)',
        [orderId, altId]
      );
    } else if (otpData.attempts !== undefined) {
      await pool.query(
        'UPDATE otp_records SET attempts = ? WHERE order_id IN (?, ?)',
        [otpData.attempts, orderId, altId]
      );
    }
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error updating order OTP:', err?.message);
    return false;
  }
}

// -----------------------------------------------------------------------------
// COUPON OPERATIONS
// -----------------------------------------------------------------------------

/**
 * Retrieves all coupons from MySQL.
 */
export async function getCouponsFromDb(): Promise<any[]> {
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, coupon_code as code, discount_percentage as discountPercentage,
              minimum_order_amount as minOrderAmount, enabled as isActive,
              description, created_at as createdAt
       FROM coupons
       ORDER BY minimum_order_amount ASC`
    );
    return rows.map((c) => ({
      ...c,
      id: String(c.id),
      discountPercentage: Number(c.discountPercentage),
      minOrderAmount: Number(c.minOrderAmount),
      isActive: Boolean(c.isActive),
    }));
  } catch (err: any) {
    console.warn('[MySQL] Error querying coupons:', err?.message);
    return [];
  }
}

/**
 * Finds a coupon by coupon_code.
 */
export async function findCouponByCodeInDb(code: string): Promise<any | null> {
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, coupon_code as code, discount_percentage as discountPercentage,
              minimum_order_amount as minOrderAmount, enabled as isActive,
              description
       FROM coupons
       WHERE coupon_code = ?
       LIMIT 1`,
      [code.trim().toUpperCase()]
    );
    if (rows.length === 0) return null;
    const c = rows[0];
    return {
      ...c,
      id: String(c.id),
      discountPercentage: Number(c.discountPercentage),
      minOrderAmount: Number(c.minOrderAmount),
      isActive: Boolean(c.isActive),
    };
  } catch (err: any) {
    console.warn('[MySQL] Error finding coupon:', err?.message);
    return null;
  }
}

/**
 * Creates a coupon in MySQL.
 */
export async function createCouponInDb(coupon: any): Promise<boolean> {
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO coupons (coupon_code, discount_percentage, minimum_order_amount, enabled, description)
       VALUES (?, ?, ?, ?, ?)`,
      [
        coupon.code.trim().toUpperCase(),
        Math.max(0, Number(coupon.discountPercentage) || 0),
        Math.max(0, Number(coupon.minOrderAmount) || 0),
        coupon.isActive !== undefined ? Boolean(coupon.isActive) : true,
        coupon.description || '',
      ]
    );
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error creating coupon:', err?.message);
    return false;
  }
}

/**
 * Updates a coupon in MySQL.
 */
export async function updateCouponInDb(code: string, updates: any): Promise<boolean> {
  const pool = getPool();
  try {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.discountPercentage !== undefined) {
      fields.push('discount_percentage = ?');
      values.push(Math.max(0, Number(updates.discountPercentage) || 0));
    }
    if (updates.minOrderAmount !== undefined) {
      fields.push('minimum_order_amount = ?');
      values.push(Math.max(0, Number(updates.minOrderAmount) || 0));
    }
    if (updates.isActive !== undefined) {
      fields.push('enabled = ?');
      values.push(Boolean(updates.isActive));
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }

    if (fields.length === 0) return true;

    values.push(code.trim().toUpperCase());
    await pool.query(
      `UPDATE coupons SET ${fields.join(', ')} WHERE coupon_code = ?`,
      values
    );
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error updating coupon:', err?.message);
    return false;
  }
}

/**
 * Deletes a coupon from MySQL.
 */
export async function deleteCouponInDb(code: string): Promise<boolean> {
  const pool = getPool();
  try {
    await pool.query('DELETE FROM coupons WHERE coupon_code = ?', [code.trim().toUpperCase()]);
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error deleting coupon:', err?.message);
    return false;
  }
}

// -----------------------------------------------------------------------------
// APP SETTINGS OPERATIONS
// -----------------------------------------------------------------------------

export async function getSettingsFromDb(): Promise<any | null> {
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
      ['delivery_settings']
    );
    if (rows.length === 0) return null;
    return typeof rows[0].setting_value === 'string'
      ? JSON.parse(rows[0].setting_value)
      : rows[0].setting_value;
  } catch (err: any) {
    console.warn('[MySQL] Error reading settings from DB:', err?.message);
    return null;
  }
}

export async function saveSettingsToDb(settings: any): Promise<boolean> {
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      ['delivery_settings', JSON.stringify(settings)]
    );
    return true;
  } catch (err: any) {
    console.error('[MySQL] Error saving settings to DB:', err?.message);
    return false;
  }
}

// -----------------------------------------------------------------------------
// PAYMENT SETTINGS OPERATIONS
// -----------------------------------------------------------------------------

export interface PaymentSettingsRecord {
  upiId: string;
  payeeName: string;
  qrCodeUrl?: string;
  upiPaymentEnabled: boolean;
  directUpiAppEnabled: boolean;
  updatedAt?: string;
}

export const DEFAULT_PAYMENT_CONFIG: PaymentSettingsRecord = {
  upiId: 'freshcart@upi',
  payeeName: 'FreshCart Grocery Store',
  qrCodeUrl: '',
  upiPaymentEnabled: true,
  directUpiAppEnabled: true,
  updatedAt: new Date().toISOString(),
};

export async function getPaymentSettingsFromDb(): Promise<PaymentSettingsRecord> {
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
      ['payment_settings']
    );
    if (rows.length > 0) {
      const val = typeof rows[0].setting_value === 'string'
        ? JSON.parse(rows[0].setting_value)
        : rows[0].setting_value;
      if (val && typeof val.upiId === 'string' && val.upiId.trim().length > 0) {
        return {
          upiId: val.upiId.trim(),
          payeeName: val.payeeName?.trim() || 'FreshCart Grocery Store',
          qrCodeUrl: val.qrCodeUrl || '',
          upiPaymentEnabled: val.upiPaymentEnabled !== false,
          directUpiAppEnabled: val.directUpiAppEnabled !== false,
          updatedAt: val.updatedAt || new Date().toISOString(),
        };
      }
    }
  } catch (err: any) {
    console.warn('[MySQL] Error reading payment settings from DB:', err?.message);
  }

  return DEFAULT_PAYMENT_CONFIG;
}

export async function savePaymentSettingsToDb(settings: PaymentSettingsRecord): Promise<boolean> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      ['payment_settings', JSON.stringify(settings)]
    );
    return true;
  } catch (err: any) {
    console.warn('[MySQL] Could not save payment settings to DB:', err?.message);
    return false;
  }
}

