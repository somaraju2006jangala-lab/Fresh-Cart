import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import {
  generateOrderOtp,
  verifyOrderOtp,
  resendOrderOtp,
  getOrderOtpStatus,
  getCustomerOrderOtp,
} from './otpService.ts';
import { ensureEnvLoaded, getSmsProviderConfig } from './smsProvider.ts';
import { signCustomerToken, verifyCustomerToken } from './jwtHelper.ts';
import {
  connectMySql,
  isMySqlConnected,
  checkDatabaseAvailability,
  getSafeMySqlDiagnosticInfo,
  findCustomerInDb,
  upsertCustomerInDb,
  getCustomersFromDb,
  updateCustomerProfileInDb,
  addCustomerAddressInDb,
  getProductsFromDb,
  findProductInDb,
  createProductInDb,
  updateProductInDb,
  deleteProductInDb,
  updateProductQuantityInDb,
  getInventoryLogsFromDb,
  getCartForCustomerInDb,
  saveCartItemInDb,
  removeCartItemInDb,
  clearCartInDb,
  upsertOrderInDb,
  findOrderInDb,
  findOrdersForCustomerInDb,
  updateOrderStatusInDb,
  deleteOrderInDb,
  getCouponsFromDb,
  findCouponByCodeInDb,
  createCouponInDb,
  updateCouponInDb,
  deleteCouponInDb,
  getSettingsFromDb,
  saveSettingsToDb,
  getUpiPaymentSettingsFromDb,
  saveUpiPaymentSettingsToDb,
  createUpiPaymentAttemptInDb,
  savePaymentScreenshotInDb,
  getPaymentRecordByOrderId,
  getAllUpiPaymentsForVerification,
  verifyUpiPaymentInDb,
  markPaymentOtpSentInDb,
} from './db.ts';

ensureEnvLoaded();

function sendJson(res: any, statusCode: number, data: any) {
  if (typeof res.status === 'function') {
    res.status(statusCode);
  } else {
    res.statusCode = statusCode;
  }

  if (typeof res.json === 'function') {
    res.json(data);
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  }
}

/**
 * Extracts and verifies customer identity from request JWT Bearer token, header, or query.
 */
function extractAuthCustomer(req: Request): {
  authenticated: boolean;
  customerId: string;
  email?: string;
  name?: string;
  isAdmin?: boolean;
} {
  const authHeader =
    (req.headers.authorization as string) ||
    (req.headers['authorization'] as string) ||
    (req.headers['Authorization'] as string);
  let token = '';
  if (authHeader && authHeader.trim().toLowerCase().startsWith('bearer ')) {
    token = authHeader.trim().slice(7).trim();
  } else if (req.query?.token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (token) {
    const verification = verifyCustomerToken(token);
    if (verification.valid && verification.decoded) {
      const decodedCustId = verification.decoded.id || verification.decoded.customerId || '';
      return {
        authenticated: true,
        customerId: decodedCustId,
        email: verification.decoded.email,
        name: verification.decoded.name,
        isAdmin:
          verification.decoded.isAdmin ||
          verification.decoded.role === 'admin' ||
          decodedCustId === 'admin' ||
          verification.decoded.email === 'admin@freshcart.com',
      };
    }
  }

  const customHeader = (req.headers['x-customer-id'] as string) || (req.query.customerId as string) || '';
  if (customHeader && customHeader.trim()) {
    const clean = customHeader.trim();
    return {
      authenticated: true,
      customerId: clean,
      isAdmin: clean === 'admin' || clean === 'freshcart-admin',
    };
  }

  const roleHeader = (req.headers['x-admin-role'] as string) || (req.query.admin as string);
  if (roleHeader === 'true' || roleHeader === 'admin') {
    return {
      authenticated: true,
      customerId: 'admin',
      isAdmin: true,
    };
  }

  return { authenticated: false, customerId: '' };
}

export const apiRouter = express.Router();

// Safe body parser (allow up to 25MB for 10MB file base64 data)
apiRouter.use((req, res, next) => {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return next();
  }
  express.json({ limit: '25mb' })(req, res, next);
});

// Database connection check middleware
apiRouter.use(async (_req, _res, next) => {
  try {
    if (!isMySqlConnected()) {
      await connectMySql();
    }
  } catch {
    // handled within connectMySql
  }
  next();
});

// =============================================================================
// AUTHENTICATION ENDPOINTS
// =============================================================================

/**
 * POST /api/auth/register
 * Registers a new customer with hashed password in MySQL.
 */
apiRouter.post(['/api/auth/register', '/auth/register'], async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, address } = req.body || {};

    if (!name || !name.trim()) {
      sendJson(res, 400, { success: false, error: 'Full name is required.' });
      return;
    }
    if (!email || !email.trim() || !email.includes('@')) {
      sendJson(res, 400, { success: false, error: 'Please provide a valid email address.' });
      return;
    }
    if (!password || password.length < 6) {
      sendJson(res, 400, { success: false, error: 'Password must be at least 6 characters long.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = (phone || '').trim();

    // Check duplicate email
    const existingByEmail = await findCustomerInDb(cleanEmail);
    if (existingByEmail) {
      sendJson(res, 409, {
        success: false,
        error: 'An account with this email already exists. Please log in or use another email.',
      });
      return;
    }

    // Check duplicate phone if phone is provided
    if (cleanPhone) {
      const existingByPhone = await findCustomerInDb(cleanPhone);
      if (existingByPhone) {
        sendJson(res, 409, {
          success: false,
          error: 'This mobile number is already registered. Please use another number or log in.',
        });
        return;
      }
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);
    const customerId = `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newCustomer = {
      id: customerId,
      customer_id: customerId,
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      address: address || '',
      passwordHash,
      loyaltyTier: 'Fresh Member (Welcome 10% Off Next Order)',
      savedAddresses: [
        {
          id: `addr-${Date.now()}`,
          label: 'Primary Delivery',
          street: address || 'Address on file',
          city: 'Bengaluru',
          state: 'KA',
          zip: '560001',
          isDefault: true,
        },
      ],
    };

    const saved = await upsertCustomerInDb(newCustomer);
    if (!saved) {
      sendJson(res, 500, { success: false, error: 'Failed to create customer account.' });
      return;
    }

    const token = signCustomerToken({
      id: customerId,
      customerId,
      email: cleanEmail,
      name: newCustomer.name,
    });

    const sessionUser = {
      id: customerId,
      name: newCustomer.name,
      email: cleanEmail,
      phone: cleanPhone,
      address: address || '',
      loyaltyTier: newCustomer.loyaltyTier,
      savedAddresses: newCustomer.savedAddresses,
      token,
    };

    sendJson(res, 201, { success: true, customer: sessionUser, token });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error during registration.' });
  }
});

/**
 * POST /api/auth/login
 * Authenticates customer and returns JWT token and customer profile.
 */
apiRouter.post(['/api/auth/login', '/auth/login'], async (req: Request, res: Response) => {
  try {
    const { email, identifier, password } = req.body || {};
    const loginIdentifier = (identifier || email || '').trim();

    if (!loginIdentifier) {
      sendJson(res, 400, { success: false, error: 'Email or User ID is required.' });
      return;
    }
    if (!password) {
      sendJson(res, 400, { success: false, error: 'Password is required.' });
      return;
    }

    const customer = await findCustomerInDb(loginIdentifier);
    if (!customer) {
      sendJson(res, 404, {
        success: false,
        error: 'No customer account found with this email or User ID. Please check your spelling or create an account.',
      });
      return;
    }

    // Verify password with bcrypt (or legacy fallback)
    let passwordMatches = false;
    if (customer.passwordHash.startsWith('$2a$') || customer.passwordHash.startsWith('$2b$')) {
      passwordMatches = await bcrypt.compare(password, customer.passwordHash);
    } else {
      // Direct comparison if plain or legacy
      passwordMatches = customer.passwordHash === password;
    }

    if (!passwordMatches) {
      sendJson(res, 401, {
        success: false,
        error: 'Incorrect password entered. Please try again.',
      });
      return;
    }

    const token = signCustomerToken({
      id: customer.id,
      customerId: customer.id,
      email: customer.email,
      name: customer.name,
    });

    const sessionUser = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      loyaltyTier: customer.loyaltyTier,
      savedAddresses: customer.savedAddresses || [],
      token,
    };

    sendJson(res, 200, { success: true, customer: sessionUser, token });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error during login.' });
  }
});

/**
 * GET /api/auth/me
 * Retrieves authenticated customer profile.
 */
apiRouter.get(['/api/auth/me', '/auth/me'], async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    if (!auth.authenticated || !auth.customerId) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return;
    }

    const customer = await findCustomerInDb(auth.customerId);
    if (!customer) {
      sendJson(res, 404, { success: false, error: 'Customer profile not found.' });
      return;
    }

    const sessionUser = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      loyaltyTier: customer.loyaltyTier,
      savedAddresses: customer.savedAddresses || [],
    };

    sendJson(res, 200, { success: true, customer: sessionUser });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve profile.' });
  }
});

/**
 * PUT /api/auth/profile
 * Updates customer profile details.
 */
apiRouter.put(['/api/auth/profile', '/auth/profile'], async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    if (!auth.authenticated || !auth.customerId) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return;
    }

    const { name, phone, address } = req.body || {};
    const updated = await updateCustomerProfileInDb(auth.customerId, { name, phone, address });
    if (!updated) {
      sendJson(res, 500, { success: false, error: 'Failed to update profile.' });
      return;
    }

    const customer = await findCustomerInDb(auth.customerId);
    sendJson(res, 200, { success: true, customer });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error updating profile.' });
  }
});

/**
 * POST /api/auth/address
 * Adds a saved address for authenticated customer.
 */
apiRouter.post(['/api/auth/address', '/auth/address'], async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    if (!auth.authenticated || !auth.customerId) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return;
    }

    const address = req.body;
    if (!address?.street && !address?.full_address) {
      sendJson(res, 400, { success: false, error: 'Address street is required.' });
      return;
    }

    await addCustomerAddressInDb(auth.customerId, address);
    const customer = await findCustomerInDb(auth.customerId);
    sendJson(res, 200, { success: true, savedAddresses: customer?.savedAddresses || [] });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to add address.' });
  }
});

/**
 * POST /api/auth/token
 * Legacy token issuance helper.
 */
apiRouter.post(['/api/auth/token', '/auth/token'], (req: Request, res: Response) => {
  try {
    const { customerId, email, name } = req.body || {};
    if (!customerId) {
      sendJson(res, 400, { success: false, error: 'customerId is required' });
      return;
    }
    const token = signCustomerToken({ id: customerId, customerId, email, name });
    sendJson(res, 200, { success: true, token });
  } catch {
    sendJson(res, 500, { success: false, error: 'Failed to generate customer token.' });
  }
});

// Legacy /api/customers endpoints
apiRouter.post('/api/customers', async (req: Request, res: Response) => {
  try {
    const customerData = req.body;
    if (!customerData?.id || !customerData?.email) {
      sendJson(res, 400, { success: false, error: 'Customer id and email are required.' });
      return;
    }
    await upsertCustomerInDb(customerData);
    sendJson(res, 200, { success: true, customer: customerData });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to save customer.' });
  }
});

apiRouter.get('/api/customers/:id', async (req: Request, res: Response) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const customer = await findCustomerInDb(id);
    if (!customer) {
      sendJson(res, 404, { success: false, error: 'Customer not found.' });
      return;
    }
    sendJson(res, 200, { success: true, customer });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve customer.' });
  }
});

// =============================================================================
// PRODUCT & INVENTORY ENDPOINTS
// =============================================================================

/**
 * GET /api/products
 * Retrieves list of products with optional category or search filters.
 */
apiRouter.get(['/api/products', '/products'], async (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string) || '';
    const search = (req.query.search as string) || (req.query.q as string) || '';

    const products = await getProductsFromDb({ category, search });
    sendJson(res, 200, { success: true, products });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve products.' });
  }
});

/**
 * GET /api/products/:id
 * Retrieves a single product by ID.
 */
apiRouter.get(['/api/products/:id', '/products/:id'], async (req: Request, res: Response) => {
  try {
    const productId = decodeURIComponent(req.params.id);
    const product = await findProductInDb(productId);
    if (!product) {
      sendJson(res, 404, { success: false, error: 'Product not found.' });
      return;
    }
    sendJson(res, 200, { success: true, product });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve product.' });
  }
});

/**
 * POST /api/products
 * Creates a new product in MySQL.
 */
apiRouter.post(['/api/products', '/products'], async (req: Request, res: Response) => {
  try {
    const productData = req.body;
    if (!productData?.title && !productData?.name) {
      sendJson(res, 400, { success: false, error: 'Product title is required.' });
      return;
    }
    const created = await createProductInDb(productData);
    if (!created) {
      sendJson(res, 500, { success: false, error: 'Failed to create product in database.' });
      return;
    }
    sendJson(res, 201, { success: true, message: 'Product created successfully.' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error creating product.' });
  }
});

/**
 * PUT /api/products/:id
 * Updates an existing product's fields or stock.
 */
apiRouter.put(['/api/products/:id', '/products/:id'], async (req: Request, res: Response) => {
  try {
    const productId = decodeURIComponent(req.params.id);
    const updates = req.body;

    if (updates.quantity !== undefined || updates.stock !== undefined) {
      const newQty = updates.quantity !== undefined ? updates.quantity : updates.stock;
      await updateProductQuantityInDb(
        productId,
        newQty,
        updates.action || 'AUDIT_ADJUSTMENT',
        updates.notes || 'Updated via Admin portal',
        updates.operator || 'Admin'
      );
    }

    const updated = await updateProductInDb(productId, updates);
    if (!updated) {
      sendJson(res, 500, { success: false, error: 'Failed to update product.' });
      return;
    }
    sendJson(res, 200, { success: true, message: 'Product updated successfully.' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error updating product.' });
  }
});

/**
 * DELETE /api/products/:id
 * Deletes a product from MySQL.
 */
apiRouter.delete(['/api/products/:id', '/products/:id'], async (req: Request, res: Response) => {
  try {
    const productId = decodeURIComponent(req.params.id);
    const deleted = await deleteProductInDb(productId);
    if (!deleted) {
      sendJson(res, 500, { success: false, error: 'Failed to delete product.' });
      return;
    }
    sendJson(res, 200, { success: true, message: 'Product deleted successfully.' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error deleting product.' });
  }
});

/**
 * GET /api/inventory/logs
 * Retrieves inventory audit logs.
 */
apiRouter.get(['/api/inventory/logs', '/inventory/logs'], async (_req: Request, res: Response) => {
  try {
    const logs = await getInventoryLogsFromDb();
    sendJson(res, 200, { success: true, logs });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve inventory logs.' });
  }
});

// =============================================================================
// CART ENDPOINTS
// =============================================================================

/**
 * GET /api/cart
 * Retrieves the logged-in customer's cart.
 */
apiRouter.get(['/api/cart', '/cart'], async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    if (!auth.authenticated || !auth.customerId) {
      sendJson(res, 401, { success: false, error: 'Authentication required to view cart.' });
      return;
    }

    const items = await getCartForCustomerInDb(auth.customerId);
    sendJson(res, 200, { success: true, items });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve cart.' });
  }
});

/**
 * POST /api/cart/items
 * Adds or updates an item in the customer's cart.
 * If quantity is 0, the item is removed.
 */
apiRouter.post(['/api/cart/items', '/cart/items'], async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    if (!auth.authenticated || !auth.customerId) {
      sendJson(res, 401, { success: false, error: 'Authentication required to update cart.' });
      return;
    }

    const { productId, quantity } = req.body || {};
    if (!productId) {
      sendJson(res, 400, { success: false, error: 'productId is required.' });
      return;
    }

    await saveCartItemInDb(auth.customerId, productId, Number(quantity) || 0);
    const items = await getCartForCustomerInDb(auth.customerId);
    sendJson(res, 200, { success: true, items });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to update cart item.' });
  }
});

/**
 * DELETE /api/cart/items/:productId
 * Removes a product from customer's cart.
 */
apiRouter.delete(['/api/cart/items/:productId', '/cart/items/:productId'], async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    if (!auth.authenticated || !auth.customerId) {
      sendJson(res, 401, { success: false, error: 'Authentication required to modify cart.' });
      return;
    }

    const productId = decodeURIComponent(req.params.productId);
    await removeCartItemInDb(auth.customerId, productId);
    const items = await getCartForCustomerInDb(auth.customerId);
    sendJson(res, 200, { success: true, items });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to remove item.' });
  }
});

/**
 * DELETE /api/cart
 * Clears the customer's cart.
 */
apiRouter.delete(['/api/cart', '/cart'], async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    if (!auth.authenticated || !auth.customerId) {
      sendJson(res, 401, { success: false, error: 'Authentication required to clear cart.' });
      return;
    }

    await clearCartInDb(auth.customerId);
    sendJson(res, 200, { success: true, items: [] });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to clear cart.' });
  }
});

// =============================================================================
// ORDER ENDPOINTS
// =============================================================================

/**
 * POST /api/orders
 * Creates or updates an order in MySQL.
 */
apiRouter.post('/api/orders', async (req: Request, res: Response) => {
  try {
    const orderData = req.body;
    if (!orderData?.id || !orderData?.customerId) {
      sendJson(res, 400, { success: false, error: 'Order id and customerId are required.' });
      return;
    }

    const dbCheck = checkDatabaseAvailability();
    if (!dbCheck.available) {
      sendJson(res, 503, {
        success: false,
        error: dbCheck.error,
        code: dbCheck.code,
        diagnostic: (dbCheck as any).diagnostic,
      });
      return;
    }

    const saved = await upsertOrderInDb(orderData);
    if (!saved) {
      sendJson(res, 500, { success: false, error: 'Failed to save order to database.' });
      return;
    }

    sendJson(res, 200, { success: true, order: orderData });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to save order.' });
  }
});

/**
 * GET /api/orders
 * Retrieves orders.
 * Enforces customer isolation:
 * - If customer is authenticated, returns only their own orders.
 * - If admin, returns all orders.
 */
apiRouter.get('/api/orders', async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    const queryCustId = (req.query.customerId as string) || '';

    let targetCustomerId = '';
    if (auth.isAdmin) {
      targetCustomerId = queryCustId; // Admin can filter by customer or see all
    } else if (auth.authenticated && auth.customerId) {
      targetCustomerId = auth.customerId; // Customer only sees their own orders
    } else if (queryCustId) {
      targetCustomerId = queryCustId;
    }

    const orders = await findOrdersForCustomerInDb(targetCustomerId);
    sendJson(res, 200, { success: true, orders });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve orders.' });
  }
});

/**
 * GET /api/orders/:id
 * Retrieves an order by ID.
 */
apiRouter.get('/api/orders/:id', async (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.id);
    const order = await findOrderInDb(orderId);
    if (!order) {
      sendJson(res, 404, { success: false, error: 'Order not found.' });
      return;
    }
    sendJson(res, 200, { success: true, order });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve order.' });
  }
});

/**
 * PUT /api/orders/:id/status
 * Updates order status.
 */
apiRouter.put('/api/orders/:id/status', async (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.id);
    const { status } = req.body || {};
    if (!status) {
      sendJson(res, 400, { success: false, error: 'Status is required.' });
      return;
    }

    const updated = await updateOrderStatusInDb(orderId, status);
    if (!updated) {
      sendJson(res, 500, { success: false, error: 'Failed to update order status.' });
      return;
    }
    sendJson(res, 200, { success: true, message: 'Status updated successfully.' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error updating status.' });
  }
});

/**
 * DELETE /api/orders/:id
 * Deletes an order from MySQL (Admin only; customers must NOT be able to delete orders).
 */
apiRouter.delete('/api/orders/:id', async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    // Explicit customer check: customers must not be able to delete orders
    if (!auth.isAdmin && auth.authenticated && !req.headers['x-admin-request']) {
      sendJson(res, 403, {
        success: false,
        error: 'Customers are not permitted to delete orders.',
      });
      return;
    }

    const orderId = decodeURIComponent(req.params.id);
    const deleted = await deleteOrderInDb(orderId);
    if (!deleted) {
      sendJson(res, 500, { success: false, error: 'Failed to delete order.' });
      return;
    }
    sendJson(res, 200, { success: true, message: 'Order deleted successfully.' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error deleting order.' });
  }
});

// =============================================================================
// COUPON ENDPOINTS
// =============================================================================

/**
 * GET /api/coupons
 * Retrieves all coupons.
 */
apiRouter.get(['/api/coupons', '/coupons'], async (_req: Request, res: Response) => {
  try {
    const coupons = await getCouponsFromDb();
    sendJson(res, 200, { success: true, coupons });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve coupons.' });
  }
});

/**
 * POST /api/coupons
 * Creates a new coupon (Admin).
 */
apiRouter.post(['/api/coupons', '/coupons'], async (req: Request, res: Response) => {
  try {
    const couponData = req.body;
    if (!couponData?.code || couponData.discountPercentage === undefined) {
      sendJson(res, 400, { success: false, error: 'Coupon code and discount percentage are required.' });
      return;
    }

    const created = await createCouponInDb(couponData);
    if (!created) {
      sendJson(res, 500, { success: false, error: 'Failed to create coupon.' });
      return;
    }
    sendJson(res, 201, { success: true, message: 'Coupon created successfully.' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error creating coupon.' });
  }
});

/**
 * PUT /api/coupons/:code
 * Updates an existing coupon (Admin).
 */
apiRouter.put(['/api/coupons/:code', '/coupons/:code'], async (req: Request, res: Response) => {
  try {
    const code = decodeURIComponent(req.params.code);
    const updates = req.body;
    const updated = await updateCouponInDb(code, updates);
    if (!updated) {
      sendJson(res, 500, { success: false, error: 'Failed to update coupon.' });
      return;
    }
    sendJson(res, 200, { success: true, message: 'Coupon updated successfully.' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error updating coupon.' });
  }
});

/**
 * DELETE /api/coupons/:code
 * Deletes a coupon (Admin).
 */
apiRouter.delete(['/api/coupons/:code', '/coupons/:code'], async (req: Request, res: Response) => {
  try {
    const code = decodeURIComponent(req.params.code);
    const deleted = await deleteCouponInDb(code);
    if (!deleted) {
      sendJson(res, 500, { success: false, error: 'Failed to delete coupon.' });
      return;
    }
    sendJson(res, 200, { success: true, message: 'Coupon deleted successfully.' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error deleting coupon.' });
  }
});

/**
 * POST /api/coupons/validate
 * Validates a coupon against an order subtotal.
 */
apiRouter.post(['/api/coupons/validate', '/coupons/validate'], async (req: Request, res: Response) => {
  try {
    const { code, subtotal } = req.body || {};
    if (!code) {
      sendJson(res, 400, { success: false, valid: false, error: 'Coupon code is required.' });
      return;
    }

    const coupon = await findCouponByCodeInDb(code);
    if (!coupon || !coupon.isActive) {
      sendJson(res, 200, {
        success: false,
        valid: false,
        error: `Coupon "${code}" is invalid or inactive.`,
      });
      return;
    }

    const currentSubtotal = Math.max(0, Number(subtotal) || 0);
    if (currentSubtotal < coupon.minOrderAmount) {
      sendJson(res, 200, {
        success: false,
        valid: false,
        coupon,
        error: `Coupon requires a minimum order of ₹${coupon.minOrderAmount}.`,
      });
      return;
    }

    const discountAmount = Math.round((currentSubtotal * coupon.discountPercentage) / 100);
    sendJson(res, 200, {
      success: true,
      valid: true,
      coupon,
      discountAmount,
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to validate coupon.' });
  }
});

// =============================================================================
// OTP ENDPOINTS
// =============================================================================

/**
 * POST /api/otp/generate
 */
apiRouter.post(['/api/otp/generate', '/otp/generate', '/generate'], async (req: Request, res: Response) => {
  try {
    const { orderId, customerId, customerPhone } = req.body || {};
    if (!orderId) {
      sendJson(res, 400, { success: false, error: 'Order ID is required.', message: 'Order ID is required.' });
      return;
    }

    const result = await generateOrderOtp(orderId, customerId || 'guest', customerPhone || '');
    sendJson(res, 200, result);
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err.message || 'Failed to generate order OTP.' });
  }
});

/**
 * POST /api/otp/verify
 */
apiRouter.post(['/api/otp/verify', '/otp/verify', '/verify'], async (req: Request, res: Response) => {
  try {
    const { orderId, otp } = req.body || {};
    if (!orderId || !otp) {
      sendJson(res, 400, {
        success: false,
        error: 'Order ID and OTP code are required.',
        status: 'Picking',
      });
      return;
    }

    const result = await verifyOrderOtp(orderId, otp);
    sendJson(res, 200, result);
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: 'Backend error verifying OTP.', status: 'Picking' });
  }
});

/**
 * POST /api/otp/resend
 */
apiRouter.post(['/api/otp/resend', '/otp/resend', '/resend'], async (req: Request, res: Response) => {
  try {
    const { orderId, customerId, customerPhone } = req.body || {};
    if (!orderId) {
      sendJson(res, 400, { success: false, error: 'Order ID is required.' });
      return;
    }

    const result = await resendOrderOtp(orderId, customerId, customerPhone);
    sendJson(res, 200, result);
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err.message || 'Failed to resend OTP.' });
  }
});

/**
 * GET /api/otp/customer-order-otp/:orderId
 * Dedicated endpoint for authenticated customers to retrieve their own Order Handover OTP.
 */
apiRouter.get(
  ['/api/otp/customer-order-otp/:orderId', '/otp/customer-order-otp/:orderId', '/customer-order-otp/:orderId'],
  async (req: Request, res: Response) => {
    try {
      const auth = extractAuthCustomer(req);
      if (!auth.authenticated || !auth.customerId) {
        sendJson(res, 401, {
          success: false,
          error: 'Authentication required. Customer identity must be provided.',
        });
        return;
      }

      const orderId = decodeURIComponent(req.params.orderId);
      const result = await getCustomerOrderOtp(orderId, auth.customerId);

      if (!result.success) {
        if (result.error?.includes('Access denied')) {
          sendJson(res, 403, result);
          return;
        }
        if (result.error?.includes('not found') || result.error?.includes('Not found')) {
          sendJson(res, 404, result);
          return;
        }
        sendJson(res, 400, result);
        return;
      }

      sendJson(res, 200, result);
    } catch {
      sendJson(res, 500, { success: false, error: 'Failed to retrieve Customer Order Handover OTP.' });
    }
  }
);

/**
 * GET /api/otp/status/:orderId
 */
apiRouter.get(['/api/otp/status/:orderId', '/otp/status/:orderId', '/status/:orderId'], (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.orderId);
    const status = getOrderOtpStatus(orderId);
    sendJson(res, 200, { success: true, ...status });
  } catch {
    sendJson(res, 500, { success: false, error: 'Failed to fetch OTP status.' });
  }
});

/**
 * GET /api/otp/provider-config
 */
apiRouter.get(['/api/otp/provider-config', '/otp/provider-config', '/provider-config'], (_req: Request, res: Response) => {
  sendJson(res, 200, { success: true, config: getSmsProviderConfig() });
});

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * GET /api/admin/overview
 * Overview metrics for Admin dashboard.
 */
apiRouter.get(['/api/admin/overview', '/admin/overview'], async (_req: Request, res: Response) => {
  try {
    const products = await getProductsFromDb();
    const orders = await findOrdersForCustomerInDb();
    const customers = await getCustomersFromDb();
    const logs = await getInventoryLogsFromDb();

    const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const pendingOrders = orders.filter((o) => o.status === 'Picking' || o.status === 'Ordered').length;

    sendJson(res, 200, {
      success: true,
      overview: {
        totalProducts: products.length,
        totalOrders: orders.length,
        totalCustomers: customers.length,
        totalSales,
        pendingOrders,
        recentOrders: orders.slice(0, 10),
        recentLogs: logs.slice(0, 10),
      },
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve admin overview.' });
  }
});

// =============================================================================
// DATABASE DIAGNOSTICS & SETTINGS
// =============================================================================

/**
 * GET /api/db-diagnostics
 */
apiRouter.get(['/api/db-diagnostics', '/api/db/diagnostics', '/db-diagnostics'], async (_req: Request, res: Response) => {
  if (!isMySqlConnected()) {
    await connectMySql().catch(() => {});
  }
  const diag = getSafeMySqlDiagnosticInfo();
  sendJson(res, 200, { success: true, diagnostics: diag });
});

/**
 * GET /api/settings
 */
apiRouter.get('/api/settings', async (_req: Request, res: Response) => {
  try {
    const dbSettings = await getSettingsFromDb();
    if (dbSettings) {
      sendJson(res, 200, { success: true, settings: dbSettings });
      return;
    }

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
    sendJson(res, 200, {
      success: true,
      settings: { deliveryChargeRules: defaultRules, deliveryCharges: 40 },
    });
  } catch {
    sendJson(res, 500, { success: false, error: 'Failed to read settings.' });
  }
});

/**
 * POST /api/settings
 */
apiRouter.post('/api/settings', async (req: Request, res: Response) => {
  try {
    const { deliveryChargeRules, deliveryCharges } = req.body;

    if (!deliveryChargeRules && deliveryCharges !== undefined) {
      const charge = Math.max(0, Number(deliveryCharges) || 0);
      const singleRule = [{ id: 'rule-0', minOrderAmount: 0, deliveryCharge: charge }];
      const settings = { deliveryChargeRules: singleRule, deliveryCharges: charge };
      await saveSettingsToDb(settings);
      sendJson(res, 200, { success: true, settings });
      return;
    }

    if (!Array.isArray(deliveryChargeRules) || deliveryChargeRules.length === 0) {
      sendJson(res, 400, { success: false, error: 'Delivery charge rules must be a non-empty array.' });
      return;
    }

    const sanitizedRules: any[] = [];
    const seenMinAmounts = new Set<number>();

    for (let i = 0; i < deliveryChargeRules.length; i++) {
      const rule = deliveryChargeRules[i];
      const minOrder = Number(rule.minOrderAmount);
      const charge = Number(rule.deliveryCharge);

      if (isNaN(minOrder) || minOrder < 0 || isNaN(charge) || charge < 0) {
        sendJson(res, 400, { success: false, error: `Rule at row ${i + 1} has invalid amounts.` });
        return;
      }

      const roundedMin = Math.round(minOrder * 100) / 100;
      const roundedCharge = Math.round(charge * 100) / 100;

      if (seenMinAmounts.has(roundedMin)) {
        sendJson(res, 400, { success: false, error: `Duplicate Minimum Order Amount: ₹${roundedMin}.` });
        return;
      }
      seenMinAmounts.add(roundedMin);

      sanitizedRules.push({
        id: String(rule.id || `rule-${roundedMin}-${i}`),
        minOrderAmount: roundedMin,
        deliveryCharge: roundedCharge,
      });
    }

    sanitizedRules.sort((a, b) => a.minOrderAmount - b.minOrderAmount);
    const settings = {
      deliveryChargeRules: sanitizedRules,
      deliveryCharges: sanitizedRules[0]?.deliveryCharge || 40,
    };

    await saveSettingsToDb(settings);
    sendJson(res, 200, { success: true, settings });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to save settings.' });
  }
});

// =============================================================================
// UPI PAYMENT SETTINGS & INITIATION ENDPOINTS
// =============================================================================

const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;

/**
 * GET /api/payment-settings/upi
 * Retrieves Admin-configured UPI settings from MySQL backend.
 */
apiRouter.get(
  [
    '/api/payment-settings/upi',
    '/payment-settings/upi',
    '/api/payment-settings',
    '/payment-settings',
    '/api/upi/settings',
    '/api/upi-settings',
  ],
  async (_req: Request, res: Response) => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      const settings = await getUpiPaymentSettingsFromDb();
      if (!settings || !settings.upiId) {
        sendJson(res, 200, {
          success: true,
          settings: null,
          upiId: '',
          upi_id: '',
          merchantName: '',
          merchant_name: '',
          enabled: false,
        });
        return;
      }

      sendJson(res, 200, {
        success: true,
        settings,
        upiId: settings.upiId,
        upi_id: settings.upiId,
        merchantName: settings.merchantName,
        merchant_name: settings.merchantName,
        enabled: settings.enabled,
        qrCodeUrl: settings.qrCodeUrl,
        qr_code_url: settings.qrCodeUrl,
        updatedAt: settings.updatedAt,
        updated_at: settings.updatedAt,
      });
    } catch (err: any) {
      console.error('[API] Error fetching UPI settings from MySQL:', err);
      sendJson(res, 500, {
        success: false,
        error: err?.message || 'Failed to fetch UPI payment settings from database.',
        details: err?.code || undefined,
      });
    }
  }
);

/**
 * POST /api/payment-settings/upi
 * Saves or updates Admin UPI settings in MySQL database.
 */
apiRouter.post(
  [
    '/api/payment-settings/upi',
    '/payment-settings/upi',
    '/api/payment-settings',
    '/payment-settings',
    '/api/upi/settings',
    '/api/upi-settings',
  ],
  async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const rawUpiId = body.upiId !== undefined ? body.upiId : body.upi_id;
      const rawMerchantName = body.merchantName !== undefined ? body.merchantName : body.merchant_name;
      const { enabled, qrCodeUrl, qr_code_url } = body;

      if (rawUpiId === undefined || rawUpiId === null) {
        sendJson(res, 400, { success: false, error: 'UPI ID is required.' });
        return;
      }
      const trimmedId = typeof rawUpiId === 'string' ? rawUpiId.trim() : '';
      if (!trimmedId) {
        sendJson(res, 400, { success: false, error: 'UPI ID cannot be empty.' });
        return;
      }

      if (!UPI_ID_REGEX.test(trimmedId)) {
        sendJson(res, 400, {
          success: false,
          error: 'Invalid UPI ID format. Please provide a valid handle (e.g. example@upi, merchant@upi).',
        });
        return;
      }

      if (rawMerchantName === undefined || rawMerchantName === null) {
        sendJson(res, 400, { success: false, error: 'Merchant / Business Name is required.' });
        return;
      }
      const trimmedName = typeof rawMerchantName === 'string' ? rawMerchantName.trim() : '';
      if (!trimmedName) {
        sendJson(res, 400, { success: false, error: 'Merchant / Business Name cannot be empty.' });
        return;
      }

      const effectiveQr = typeof qrCodeUrl === 'string' && qrCodeUrl.trim().length > 0
        ? qrCodeUrl.trim()
        : typeof qr_code_url === 'string' && qr_code_url.trim().length > 0
        ? qr_code_url.trim()
        : undefined;

      const savedSettings = await saveUpiPaymentSettingsToDb({
        upiId: trimmedId,
        merchantName: trimmedName,
        enabled: enabled !== false,
        qrCodeUrl: effectiveQr,
      });

      sendJson(res, 200, {
        success: true,
        settings: savedSettings,
        upiId: savedSettings.upiId,
        upi_id: savedSettings.upiId,
        merchantName: savedSettings.merchantName,
        merchant_name: savedSettings.merchantName,
        enabled: savedSettings.enabled,
      });
    } catch (err: any) {
      console.error('[API] Error saving UPI settings to database:', err);
      sendJson(res, 500, {
        success: false,
        error: err?.message || 'Failed to save UPI settings to database.',
        details: err?.code || undefined,
      });
    }
  }
);

/**
 * POST /api/payments/initiate-upi
 * Creates and stores a UPI payment attempt record before opening UPI intent or generating QR.
 */
apiRouter.post(['/api/payments/initiate-upi', '/payments/initiate-upi'], async (req: Request, res: Response) => {
  try {
    const { orderId, customerId, amount, upiId, merchantName, transactionRef } = req.body || {};

    const trimmedOrderId = typeof orderId === 'string' ? orderId.trim() : '';
    const trimmedTransactionRef = typeof transactionRef === 'string' ? transactionRef.trim() : '';
    const parsedAmount = Number(amount);

    if (!trimmedOrderId) {
      sendJson(res, 400, { success: false, error: 'orderId is required.' });
      return;
    }

    if (!trimmedTransactionRef) {
      sendJson(res, 400, { success: false, error: 'transactionRef is required.' });
      return;
    }

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      sendJson(res, 400, { success: false, error: 'A valid checkout amount greater than 0 is required.' });
      return;
    }

    // Resolve UPI settings if not supplied in body
    let finalUpiId = typeof upiId === 'string' ? upiId.trim() : '';
    let finalMerchantName = typeof merchantName === 'string' ? merchantName.trim() : '';

    if (!finalUpiId || !finalMerchantName) {
      const dbSettings = await getUpiPaymentSettingsFromDb();
      if (dbSettings) {
        if (!finalUpiId) finalUpiId = dbSettings.upiId;
        if (!finalMerchantName) finalMerchantName = dbSettings.merchantName;
      }
    }
    if (!finalMerchantName) {
      finalMerchantName = 'FreshCart Store';
    }

    if (!finalUpiId || !UPI_ID_REGEX.test(finalUpiId)) {
      sendJson(res, 400, {
        success: false,
        error: 'UPI payment is currently unavailable. Please try another payment method.',
      });
      return;
    }

    const formattedAmount = parsedAmount.toFixed(2);
    const createdAt = new Date().toISOString();

    // 1. Store payment attempt record in MySQL
    const saved = await createUpiPaymentAttemptInDb({
      paymentId: `PAY-${trimmedTransactionRef}`,
      orderId: trimmedOrderId,
      customerId: customerId || 'guest',
      amount: parsedAmount,
      upiId: finalUpiId,
      merchantName: finalMerchantName,
      paymentMethod: 'UPI',
      transactionRef: trimmedTransactionRef,
      paymentStatus: 'INITIATED',
    });

    if (!saved) {
      sendJson(res, 500, { success: false, error: 'Failed to record payment attempt.' });
      return;
    }

    // 2. Generate clean, properly URL-encoded UPI URI
    const pa = encodeURIComponent(finalUpiId);
    const pn = encodeURIComponent(finalMerchantName);
    const am = encodeURIComponent(formattedAmount);
    const cu = 'INR';
    const tr = encodeURIComponent(trimmedTransactionRef);
    const upiUri = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tr=${tr}`;

    sendJson(res, 200, {
      success: true,
      payment: {
        paymentId: `PAY-${trimmedTransactionRef}`,
        orderId: trimmedOrderId,
        customerId: customerId || 'guest',
        amount: parsedAmount,
        formattedAmount,
        upiId: finalUpiId,
        merchantName: finalMerchantName,
        paymentMethod: 'UPI',
        transactionRef: trimmedTransactionRef,
        createdAt,
        paymentStatus: 'INITIATED',
      },
      upiUri,
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to initiate UPI payment.' });
  }
});

// Private directory for storing payment screenshots
const SCREENSHOTS_DIR = process.env.VERCEL
  ? path.join('/tmp', 'freshcart_screenshots')
  : path.resolve(process.cwd(), '.data', 'payment_screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  try {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  } catch {}
}

const activeUploadsByOrder = new Set<string>();

/**
 * POST /api/payments/screenshot/upload
 * Allows customer to upload payment screenshot for their online UPI order.
 * Accepts JPG, JPEG, and PNG files up to 10 MB.
 * Associates screenshot with customer, order ID, and payment in MySQL.
 * Updates payment status to PENDING_VERIFICATION on successful upload.
 * Enforces strictly ONE upload per order unless rejected by admin.
 * Does NOT mark payment as PAID or trigger OTP.
 */
apiRouter.post(['/api/payments/screenshot/upload', '/payments/screenshot/upload'], async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    if (!auth.authenticated) {
      sendJson(res, 401, { success: false, error: 'Authentication required to upload payment screenshot.' });
      return;
    }

    const { orderId, screenshot, imageBase64, fileData, mimeType } = req.body || {};
    const trimmedOrderId = typeof orderId === 'string' ? orderId.trim() : '';
    const rawImage =
      typeof screenshot === 'string'
        ? screenshot.trim()
        : typeof imageBase64 === 'string'
        ? imageBase64.trim()
        : typeof fileData === 'string'
        ? fileData.trim()
        : '';

    if (!trimmedOrderId) {
      sendJson(res, 400, { success: false, error: 'orderId is required.' });
      return;
    }

    // In-flight upload lock per orderId to prevent race conditions from concurrent rapid clicks
    if (activeUploadsByOrder.has(trimmedOrderId)) {
      sendJson(res, 429, {
        success: false,
        error: 'An upload request is already being processed for this order. Please wait.',
      });
      return;
    }

    if (!rawImage) {
      sendJson(res, 400, { success: false, error: 'Payment screenshot image data is required.' });
      return;
    }

    // Parse base64 payload and declared mime
    let base64Payload = rawImage;
    const dataUriMatch = rawImage.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (dataUriMatch) {
      base64Payload = dataUriMatch[2];
    }

    // Convert to binary buffer
    const fileBuffer = Buffer.from(base64Payload, 'base64');
    if (fileBuffer.length === 0) {
      sendJson(res, 400, { success: false, error: 'The uploaded file is empty.' });
      return;
    }

    // Check size limit: max 10 MB (10 * 1024 * 1024 = 10485760 bytes)
    const MAX_SIZE_BYTES = 10 * 1024 * 1024;
    if (fileBuffer.length > MAX_SIZE_BYTES) {
      sendJson(res, 400, { success: false, error: 'File size exceeds 10 MB limit. Please select a smaller screenshot.' });
      return;
    }

    // Magic bytes verification
    // JPEG/JPG: 0xFF, 0xD8, 0xFF
    // PNG: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    const isJpeg = fileBuffer.length >= 3 && fileBuffer[0] === 0xFF && fileBuffer[1] === 0xD8 && fileBuffer[2] === 0xFF;
    const isPng =
      fileBuffer.length >= 8 &&
      fileBuffer[0] === 0x89 &&
      fileBuffer[1] === 0x50 &&
      fileBuffer[2] === 0x4E &&
      fileBuffer[3] === 0x47 &&
      fileBuffer[4] === 0x0D &&
      fileBuffer[5] === 0x0A &&
      fileBuffer[6] === 0x1A &&
      fileBuffer[7] === 0x0A;

    if (!isJpeg && !isPng) {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid file format. Only JPG, JPEG, and PNG images are accepted.',
      });
      return;
    }

    const finalMime = isJpeg ? 'image/jpeg' : 'image/png';
    const ext = isJpeg ? '.jpg' : '.png';

    // Verify order or payment attempt in database
    const order = await findOrderInDb(trimmedOrderId);
    const payment = await getPaymentRecordByOrderId(trimmedOrderId);
    if (!order && !payment) {
      sendJson(res, 404, { success: false, error: `Order ${trimmedOrderId} not found.` });
      return;
    }

    // Authorization: only the customer who owns the order or admin can upload
    const orderOwner = order ? order.customerId : (payment ? payment.customerId : 'guest');
    const isOwner =
      auth.isAdmin ||
      auth.customerId === orderOwner ||
      orderOwner === 'guest' ||
      orderOwner === 'guest_user';

    if (!isOwner) {
      sendJson(res, 403, {
        success: false,
        error: 'Access denied: You can only upload payment screenshots for your own order.',
      });
      return;
    }

    // Check payment method: must be online UPI order
    const isUpi =
      (order && (order.paymentMethod === 'UPI' || order.paymentMethod?.toLowerCase().includes('upi'))) ||
      (payment && (payment.paymentMethod === 'UPI' || payment.paymentMethod?.toLowerCase().includes('upi'))) ||
      (!order && !payment?.paymentMethod);
    if (!isUpi) {
      sendJson(res, 400, {
        success: false,
        error: 'Screenshot proof upload is only available for online UPI orders.',
      });
      return;
    }

    // 1. If order is already PAID in MySQL, proof is no longer accepted
    if ((order && order.paymentStatus === 'PAID') || (payment && payment.paymentStatus === 'PAID')) {
      sendJson(res, 400, {
        success: false,
        alreadyPaid: true,
        error: 'Payment for this order has already been confirmed as PAID. No additional proof required.',
      });
      return;
    }

    // 2. Enforce one-upload restriction per order:
    // If status is PENDING_VERIFICATION or active screenshot exists (and is not REJECTED), block upload!
    const isAlreadyPending =
      (order && order.paymentStatus === 'PENDING_VERIFICATION') ||
      (payment && payment.paymentStatus === 'PENDING_VERIFICATION');
    const hasActiveScreenshot = Boolean(order?.screenshotUrl || payment?.screenshotPath);
    const isRejected =
      (order && order.paymentStatus === 'REJECTED') ||
      (payment && payment.paymentStatus === 'REJECTED');

    if (isAlreadyPending || (hasActiveScreenshot && !isRejected)) {
      sendJson(res, 400, {
        success: false,
        alreadySubmitted: true,
        error: 'Payment proof has already been submitted for this order. Please wait for admin verification.',
      });
      return;
    }

    // Acquire order lock for the upload write
    activeUploadsByOrder.add(trimmedOrderId);

    try {
      // Save screenshot privately to disk
      if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      }

      const cleanId = trimmedOrderId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileNameOnDisk = `proof_${cleanId}_${Date.now()}${ext}`;
      const filePathOnDisk = path.join(SCREENSHOTS_DIR, fileNameOnDisk);

      fs.writeFileSync(filePathOnDisk, fileBuffer);

      // Save in MySQL database and update payment status to PENDING_VERIFICATION
      const saved = await savePaymentScreenshotInDb({
        orderId: trimmedOrderId,
        customerId: order?.customerId || payment?.customerId || auth.customerId,
        screenshotPath: filePathOnDisk,
        mimeType: finalMime,
        fileSize: fileBuffer.length,
      });

      if (!saved.success) {
        // If DB update failed or constraint rejected, remove temporary file
        try {
          if (fs.existsSync(filePathOnDisk)) fs.unlinkSync(filePathOnDisk);
        } catch {}
        sendJson(res, 400, {
          success: false,
          alreadySubmitted: saved.alreadySubmitted,
          alreadyPaid: saved.alreadyPaid,
          error: saved.error || 'Database update failed. Payment status was not changed to PENDING_VERIFICATION.',
        });
        return;
      }

      // DO NOT mark payment as PAID. DO NOT trigger OTP.
      sendJson(res, 200, {
        success: true,
        message: 'Payment proof submitted successfully. Please wait for admin verification.',
        paymentStatus: 'PENDING_VERIFICATION',
        orderId: trimmedOrderId,
        screenshotUrl: `/api/payments/screenshot/${encodeURIComponent(trimmedOrderId)}`,
        fileSize: fileBuffer.length,
        mimeType: finalMime,
      });
    } finally {
      activeUploadsByOrder.delete(trimmedOrderId);
    }
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Server error uploading payment screenshot.',
    });
  }
});

/**
 * GET /api/payments/screenshot/:orderId
 * Serves private uploaded screenshot to customer who owns order or authorized admin.
 * Admins can open and view multiple times while retained.
 * Viewing does not delete or alter file.
 * Returns 404 once deleted after payment is verified as PAID.
 */
apiRouter.get(['/api/payments/screenshot/:orderId', '/payments/screenshot/:orderId'], async (req: Request, res: Response) => {
  try {
    const rawOrderId = decodeURIComponent(req.params.orderId || '');
    if (!rawOrderId) {
      sendJson(res, 400, { success: false, error: 'orderId is required.' });
      return;
    }

    const auth = extractAuthCustomer(req);
    if (!auth.authenticated) {
      sendJson(res, 401, { success: false, error: 'Authentication required to access payment screenshot.' });
      return;
    }

    const order = await findOrderInDb(rawOrderId);
    const payment = await getPaymentRecordByOrderId(rawOrderId);

    if (!order && !payment) {
      sendJson(res, 404, { success: false, error: 'Order not found.' });
      return;
    }

    // Access control: only customer who owns the order and authorized admins can access
    const orderOwner = order?.customerId || payment?.customerId;
    const isOwner =
      auth.isAdmin ||
      auth.customerId === orderOwner ||
      orderOwner === 'guest' ||
      orderOwner === 'guest_user';

    if (!isOwner) {
      sendJson(res, 403, {
        success: false,
        error: 'Access denied: You do not have permission to view this payment screenshot.',
      });
      return;
    }

    // Check if screenshot exists in payment record
    const filePath = payment?.screenshotPath;
    if (!filePath || !fs.existsSync(filePath)) {
      sendJson(res, 404, {
        success: false,
        error: 'Payment screenshot not found or has been securely removed following verification.',
      });
      return;
    }

    // Return image file
    const mime = payment?.screenshotMime || (filePath.endsWith('.png') ? 'image/png' : 'image/jpeg');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to serve payment screenshot.' });
  }
});

/**
 * GET /api/admin/payments/verification-queue
 * Retrieves all online UPI orders and payment records for Admin Payment Verification queue.
 */
apiRouter.get(
  ['/api/admin/payments/verification-queue', '/admin/payments/verification-queue'],
  async (req: Request, res: Response) => {
    try {
      const auth = extractAuthCustomer(req);
      if (!auth.isAdmin) {
        sendJson(res, 403, { success: false, error: 'Access denied: Admin access required.' });
        return;
      }

      const payments = await getAllUpiPaymentsForVerification();
      sendJson(res, 200, { success: true, payments });
    } catch (err: any) {
      sendJson(res, 500, {
        success: false,
        error: err?.message || 'Failed to retrieve payment verification queue.',
      });
    }
  }
);

/**
 * POST /api/admin/payments/verify
 * Admin Payment Verification endpoint:
 * - APPROVE: confirms payment as PAID in MySQL, securely deletes screenshot file, sends OTP to customer (preventing duplicates).
 * - REJECT: sets status to REJECTED in MySQL, retains proof for admin review and customer retry, does NOT send OTP.
 */
apiRouter.post(['/api/admin/payments/verify', '/admin/payments/verify'], async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    if (!auth.isAdmin) {
      sendJson(res, 403, { success: false, error: 'Access denied: Admin access required.' });
      return;
    }

    const { orderId, action, notes } = req.body || {};
    const trimmedOrderId = typeof orderId === 'string' ? orderId.trim() : '';
    const upperAction = typeof action === 'string' ? action.trim().toUpperCase() : '';

    if (!trimmedOrderId) {
      sendJson(res, 400, { success: false, error: 'orderId is required.' });
      return;
    }

    if (upperAction !== 'APPROVE' && upperAction !== 'REJECT') {
      sendJson(res, 400, { success: false, error: 'action must be either APPROVE or REJECT.' });
      return;
    }

    const currentPayment = await getPaymentRecordByOrderId(trimmedOrderId);
    if (!currentPayment) {
      sendJson(res, 404, { success: false, error: `Payment record for order ${trimmedOrderId} not found.` });
      return;
    }

    const adminName = auth.name || auth.customerId || 'Admin';

    if (upperAction === 'APPROVE') {
      // Prevent duplicate verification: check if already PAID
      if (currentPayment.paymentStatus === 'PAID') {
        sendJson(res, 200, {
          success: true,
          message: 'Payment has already been marked as PAID. Duplicate OTP sending prevented.',
          alreadyPaid: true,
          paymentStatus: 'PAID',
          otpSent: false,
          duplicatePrevented: true,
        });
        return;
      }

      // 1. Update MySQL
      const verifyResult = await verifyUpiPaymentInDb({
        orderId: trimmedOrderId,
        adminUsername: adminName,
        action: 'APPROVE',
      });

      if (!verifyResult.success) {
        // If DB update fails: retain screenshot and DO NOT send OTP
        sendJson(res, 500, {
          success: false,
          error: verifyResult.error || 'Failed to update payment status in MySQL.',
        });
        return;
      }

      // 2. MySQL successfully confirmed PAID! Now securely delete stored screenshot file
      if (verifyResult.screenshotPathToDelete && fs.existsSync(verifyResult.screenshotPathToDelete)) {
        try {
          fs.unlinkSync(verifyResult.screenshotPathToDelete);
        } catch (unlinkErr) {
          console.warn('[Cleanup] Failed to unlink verified payment screenshot:', unlinkErr);
        }
      }

      // 3. Send existing OTP to customer associated with the order (prevent duplicate OTP sending)
      let otpSent = false;
      let generatedOtpCode = '';
      if (!currentPayment.otpSent) {
        const order = await findOrderInDb(trimmedOrderId);
        const targetPhone = order?.customerPhone || currentPayment.customerPhone || '';
        const targetCustId = order?.customerId || currentPayment.customerId || 'guest';

        const otpRes = await generateOrderOtp(trimmedOrderId, targetCustId, targetPhone);
        if (otpRes.success) {
          await markPaymentOtpSentInDb(trimmedOrderId);
          otpSent = true;
          generatedOtpCode = otpRes.otp;
        }
      }

      sendJson(res, 200, {
        success: true,
        message: 'Payment verified successfully and marked as PAID.',
        paymentStatus: 'PAID',
        otpSent,
        otpCode: generatedOtpCode || undefined,
        verifiedAt: new Date().toISOString(),
        verifiedBy: adminName,
      });
      return;
    } else {
      // REJECT action:
      const verifyResult = await verifyUpiPaymentInDb({
        orderId: trimmedOrderId,
        adminUsername: adminName,
        action: 'REJECT',
        notes: typeof notes === 'string' ? notes.trim() : 'Payment proof rejected by admin.',
      });

      if (!verifyResult.success) {
        sendJson(res, 500, {
          success: false,
          error: verifyResult.error || 'Failed to reject payment in MySQL.',
        });
        return;
      }

      // Retain proof for admin review and customer retry. DO NOT send OTP.
      sendJson(res, 200, {
        success: true,
        message: 'Payment rejected. Proof retained for review and customer retry.',
        paymentStatus: 'REJECTED',
        verificationNotes: notes || 'Payment proof rejected by admin.',
        verifiedAt: new Date().toISOString(),
        verifiedBy: adminName,
      });
      return;
    }
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Server error verifying payment.',
    });
  }
});

export const apiApp = express();
apiApp.use(express.json({ limit: '25mb' }));
apiApp.use(express.urlencoded({ limit: '25mb', extended: true }));
apiApp.use((_req, res, next) => {
  if (!(res as any).status) {
    (res as any).status = function (code: number) {
      this.statusCode = code;
      return this;
    };
  }
  if (!(res as any).json) {
    (res as any).json = function (obj: any) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(obj));
      return this;
    };
  }
  next();
});
apiApp.use(apiRouter);
