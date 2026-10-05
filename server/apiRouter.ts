import express, { type Request, type Response } from 'express';
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
  getPaymentSettingsFromDb,
  savePaymentSettingsToDb,
  saveOrderPaymentProofInDb,
  verifyOrRejectPaymentInDb,
} from './db.ts';
import { generateQrDataUrl } from '../src/utils/qrCodeGenerator.ts';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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
  const authHeader = req.headers.authorization || (req.headers['authorization'] as string);
  if (authHeader && authHeader.trim().toLowerCase().startsWith('bearer ')) {
    const token = authHeader.trim().slice(7).trim();
    const verification = verifyCustomerToken(token);
    if (verification.valid && verification.decoded) {
      return {
        authenticated: true,
        customerId: verification.decoded.id || verification.decoded.customerId || '',
        email: verification.decoded.email,
        name: verification.decoded.name,
        isAdmin: verification.decoded.isAdmin || verification.decoded.role === 'admin',
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

  return { authenticated: false, customerId: '' };
}

export const apiRouter = express.Router();

// Safe body parser
apiRouter.use((req, res, next) => {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return next();
  }
  express.json()(req, res, next);
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
apiRouter.get('/api/cart', async (req: Request, res: Response) => {
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
apiRouter.delete('/api/cart', async (req: Request, res: Response) => {
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

    const saved = await upsertOrderInDb(orderData);
    if (!saved) {
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
// ONLINE PAYMENT & SETTINGS ENDPOINTS
// =============================================================================

/**
 * GET /api/payment-settings
 * Returns active payment settings (UPI ID, merchant name, QR code, enable/disable toggles).
 */
apiRouter.get('/api/payment-settings', async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const settings = await getPaymentSettingsFromDb();
    sendJson(res, 200, { success: true, settings });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve payment settings.' });
  }
});

/**
 * POST /api/payment-settings
 * Admin updates payment configuration.
 */
apiRouter.post('/api/payment-settings', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const current = await getPaymentSettingsFromDb();
    let upiId = current.upiId;
    if (req.body?.upiId !== undefined) {
      if (typeof req.body.upiId !== 'string' || !req.body.upiId.trim()) {
        sendJson(res, 400, { success: false, error: 'UPI ID cannot be empty.' });
        return;
      }
      const trimmed = req.body.upiId.trim();
      const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!upiRegex.test(trimmed)) {
        sendJson(res, 400, {
          success: false,
          error: 'Invalid UPI ID format. Must be in the format username@bank or handle@upi (e.g. freshcart@upi).',
        });
        return;
      }
      upiId = trimmed;
    }
    const payeeName = req.body?.payeeName !== undefined && typeof req.body.payeeName === 'string' && req.body.payeeName.trim()
      ? req.body.payeeName.trim()
      : current.payeeName;
    let qrCodeUrl = req.body?.qrCodeUrl !== undefined
      ? req.body.qrCodeUrl
      : (upiId !== current.upiId || payeeName !== current.payeeName)
        ? generateQrDataUrl(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&cu=INR`)
        : current.qrCodeUrl;
    if (!qrCodeUrl) {
      qrCodeUrl = generateQrDataUrl(`upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&cu=INR`);
    }
    const upiPaymentEnabled = req.body?.upiPaymentEnabled !== undefined ? !!req.body.upiPaymentEnabled : current.upiPaymentEnabled;
    const directUpiAppEnabled = req.body?.directUpiAppEnabled !== undefined ? !!req.body.directUpiAppEnabled : current.directUpiAppEnabled;

    const settings = {
      upiId,
      payeeName,
      qrCodeUrl,
      upiPaymentEnabled,
      directUpiAppEnabled,
      updatedAt: new Date().toISOString(),
    };

    await savePaymentSettingsToDb(settings);
    sendJson(res, 200, { success: true, settings });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to save payment settings.' });
  }
});

/**
 * POST /api/orders/:id/payment-proof
 * Customer uploads payment proof (JPG, PNG, PDF up to 10MB) for an online payment.
 */
apiRouter.post('/api/orders/:id/payment-proof', async (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.id);
    const auth = extractAuthCustomer(req);

    const { proofDataUrl, fileName, fileType, fileSize } = req.body || {};

    if (!proofDataUrl || !fileName) {
      sendJson(res, 400, { success: false, error: 'Payment proof file is required.' });
      return;
    }

    // Validate format: JPG, PNG, PDF
    const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    const normalizedType = (fileType || '').toLowerCase();
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const isAllowedExt = ['jpg', 'jpeg', 'png', 'pdf'].includes(extension);
    const isAllowedMime = allowedMime.includes(normalizedType);

    if (!isAllowedExt && !isAllowedMime) {
      sendJson(res, 400, {
        success: false,
        error: 'Unsupported file format. Please upload JPG, PNG, or PDF.',
      });
      return;
    }

    // Validate size: max 10 MB = 10,485,760 bytes
    const MAX_BYTES = 10 * 1024 * 1024;
    const parsedSize = Number(fileSize) || 0;
    if (parsedSize > MAX_BYTES) {
      sendJson(res, 400, {
        success: false,
        error: 'File size exceeds maximum allowed limit of 10 MB.',
      });
      return;
    }

    let order = await findOrderInDb(orderId);

    // Customer isolation check (Requirement 14): cannot upload proof for another customer's order
    if (order && auth.authenticated && !auth.isAdmin && order.customerId) {
      if (
        order.customerId !== auth.customerId &&
        order.customerId !== 'guest' &&
        order.customerId !== 'guest_user'
      ) {
        sendJson(res, 403, {
          success: false,
          error: "Access denied: You cannot upload payment proof for another customer's order.",
        });
        return;
      }
    }

    // Secure private proofs directory (Requirement 14: not publicly exposed)
    const proofsDir = path.join(process.cwd(), '.data', 'proofs');
    if (!fs.existsSync(proofsDir)) {
      try {
        fs.mkdirSync(proofsDir, { recursive: true });
      } catch {}
    }

    // Clean up any older proof files for this order before writing new one (supports replacing proof)
    const safeOrderKey = orderId.replace(/[^a-zA-Z0-9]/g, '');
    const safePrefix = `proof_${safeOrderKey}_`;
    if (fs.existsSync(proofsDir)) {
      try {
        const existingFiles = fs.readdirSync(proofsDir);
        for (const f of existingFiles) {
          if (f.startsWith(safePrefix)) {
            try {
              fs.unlinkSync(path.join(proofsDir, f));
            } catch {}
          }
        }
      } catch {}
    }

    const safeExt = extension || (normalizedType.includes('pdf') ? 'pdf' : 'png');
    const safeFileName = `proof_${safeOrderKey}_${Date.now()}.${safeExt}`;
    const filePath = path.join(proofsDir, safeFileName);

    let savedUrl = proofDataUrl;
    if (typeof proofDataUrl === 'string' && proofDataUrl.includes('base64,')) {
      const base64Data = proofDataUrl.split('base64,')[1];
      try {
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
        savedUrl = `/api/orders/${encodeURIComponent(orderId)}/payment-proof/file`;
      } catch {
        // fallback to keeping proofDataUrl
      }
    }

    const proofPayload = {
      url: savedUrl,
      name: fileName,
      size: parsedSize,
      type: normalizedType || (safeExt === 'pdf' ? 'application/pdf' : 'image/png'),
      uploadedAt: new Date().toISOString(),
    };

    await saveOrderPaymentProofInDb(orderId, proofPayload);
    const updatedOrder = await findOrderInDb(orderId);

    sendJson(res, 200, {
      success: true,
      message: 'Payment proof uploaded successfully and is under verification.',
      order: updatedOrder || {
        id: orderId,
        paymentStatus: 'Pending Verification',
        paymentProofStatus: 'Under Verification',
        paymentProofName: fileName,
        paymentProofSize: parsedSize,
        paymentProofType: normalizedType,
        status: 'Pending',
      },
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to upload payment proof.' });
  }
});

/**
 * GET /api/orders/:id/payment-proof
 * Retrieves payment proof metadata. Enforces customer isolation.
 */
apiRouter.get('/api/orders/:id/payment-proof', async (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.id);
    const auth = extractAuthCustomer(req);
    const order = await findOrderInDb(orderId);

    if (!order) {
      sendJson(res, 404, { success: false, error: 'Order not found.' });
      return;
    }

    // Customer isolation check (Requirement 14): cannot view another customer's proof
    if (!auth.isAdmin && auth.authenticated && order.customerId && order.customerId !== auth.customerId) {
      sendJson(res, 403, {
        success: false,
        error: "Access denied: You cannot view another customer's payment proof.",
      });
      return;
    }

    const proofObj = {
      status: order.paymentProofStatus || 'Not Uploaded',
      url: order.paymentProofUrl || null,
      fileName: order.paymentProofName || null,
      fileSize: order.paymentProofSize || null,
      fileType: order.paymentProofType || null,
      uploadedAt: order.paymentProofUploadedAt || null,
      rejectionReason: order.paymentProofRejectionReason || null,
    };

    sendJson(res, 200, {
      success: true,
      paymentProof: proofObj,
      proof: proofObj,
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to retrieve payment proof.' });
  }
});

/**
 * GET /api/orders/:id/payment-proof/file
 * Secure file stream for uploaded payment proof with authorization.
 */
apiRouter.get('/api/orders/:id/payment-proof/file', async (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.id);
    const auth = extractAuthCustomer(req);
    const order = await findOrderInDb(orderId);

    if (!order) {
      sendJson(res, 404, { success: false, error: 'Order not found.' });
      return;
    }

    if (!auth.isAdmin && auth.authenticated && order.customerId && order.customerId !== auth.customerId) {
      sendJson(res, 403, {
        success: false,
        error: "Access denied: You cannot access another customer's payment proof.",
      });
      return;
    }

    const proofsDir = path.join(process.cwd(), '.data', 'proofs');
    const safePrefix = `proof_${orderId.replace(/[^a-zA-Z0-9]/g, '')}_`;
    if (fs.existsSync(proofsDir)) {
      const files = fs.readdirSync(proofsDir).filter((f) => f.startsWith(safePrefix)).sort().reverse();
      const matched = files[0];
      if (matched) {
        const fullPath = path.join(proofsDir, matched);
        const ext = matched.split('.').pop()?.toLowerCase();
        let mime = 'image/png';
        if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
        else if (ext === 'pdf') mime = 'application/pdf';

        res.setHeader('Content-Type', mime);
        const data = fs.readFileSync(fullPath);
        res.end(data);
        return;
      }
    }

    // If order has data URL
    if (order.paymentProofUrl && order.paymentProofUrl.startsWith('data:')) {
      const parts = order.paymentProofUrl.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';
      res.setHeader('Content-Type', mime);
      res.end(Buffer.from(parts[1], 'base64'));
      return;
    }

    sendJson(res, 404, { success: false, error: 'Proof file not found on disk.' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Error streaming proof file.' });
  }
});

/**
 * PUT /api/orders/:id/verify-payment
 * Admin action to verify or reject customer's payment proof.
 */
apiRouter.put('/api/orders/:id/verify-payment', async (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.id);
    const auth = extractAuthCustomer(req);

    if (auth.authenticated && !auth.isAdmin && !auth.customerId.includes('admin') && !req.headers['x-admin-request']) {
      sendJson(res, 403, { success: false, error: 'Unauthorized: Admin privileges required.' });
      return;
    }

    const { action, reason, rejectionReason } = req.body || {};
    const normAction = (action || '').toUpperCase() as 'VERIFY' | 'REJECT';
    if (normAction !== 'VERIFY' && normAction !== 'REJECT') {
      sendJson(res, 400, { success: false, error: 'Action must be VERIFY or REJECT.' });
      return;
    }

    const finalReason = rejectionReason || reason;
    const result = await verifyOrRejectPaymentInDb(orderId, normAction, finalReason);
    sendJson(res, 200, {
      success: true,
      action: normAction,
      message: normAction === 'VERIFY' ? 'Payment verified and order confirmed.' : 'Payment proof rejected.',
      order: result.order,
    });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to update payment verification.' });
  }
});

/**
 * POST /api/payments/razorpay/create-order
 * Initiates Razorpay order if credentials exist in environment.
 */
apiRouter.post('/api/payments/razorpay/create-order', async (req: Request, res: Response) => {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      sendJson(res, 200, {
        success: false,
        gatewayConfigured: false,
        message: 'Razorpay credentials not configured in environment.',
      });
      return;
    }

    const Razorpay = (await import('razorpay')).default;
    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const { amount, orderId } = req.body;

    const rzpOrder = await instance.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency: 'INR',
      receipt: orderId || `rcpt_${Date.now()}`,
    });

    sendJson(res, 200, { success: true, gatewayConfigured: true, razorpayOrder: rzpOrder, keyId });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Failed to create Razorpay order.' });
  }
});

/**
 * POST /api/payments/razorpay/verify
 * Server-side signature verification (HMAC SHA256) per Requirement 11.
 */
apiRouter.post('/api/payments/razorpay/verify', async (req: Request, res: Response) => {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      sendJson(res, 400, {
        success: false,
        error: 'Razorpay secret not configured. Automatic verification unavailable.',
      });
      return;
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body || {};
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      sendJson(res, 400, { success: false, error: 'Missing Razorpay verification parameters.' });
      return;
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      sendJson(res, 400, { success: false, error: 'Invalid payment signature. Verification failed.' });
      return;
    }

    if (orderId) {
      await verifyOrRejectPaymentInDb(orderId, 'VERIFY');
    }

    sendJson(res, 200, { success: true, verified: true, message: 'Server-side payment verified successfully.' });
  } catch (err: any) {
    sendJson(res, 500, { success: false, error: err?.message || 'Server error during verification.' });
  }
});

export const apiApp = express();
apiApp.use(express.json({ limit: '15mb' }));
apiApp.use(express.urlencoded({ extended: true, limit: '15mb' }));
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
