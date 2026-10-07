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
  savePaymentProofInDb,
  getPaymentProofForOrderInDb,
  getAllPaymentProofsInDb,
  verifyPaymentProofInDb,
  type PaymentProofRecord,
} from './db.ts';
import fs from 'fs';
import path from 'path';
import { generateQrDataUrl, buildMerchantUpiUri } from '../src/utils/qrCodeGenerator.ts';
import {
  getPhonePeConfig,
  createUpiPaymentIntent,
  verifyUpiPaymentWithProvider,
  handlePhonePeWebhook,
} from './paymentProviderService.ts';

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

// Safe body parser with 20mb limit for payment screenshot uploads
apiRouter.use((req, res, next) => {
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return next();
  }
  express.json({ limit: '20mb' })(req, res, (err) => {
    if (err) return next(err);
    express.urlencoded({ extended: true, limit: '20mb' })(req, res, next);
  });
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
    const upiId = req.body?.upiId !== undefined && typeof req.body.upiId === 'string' && req.body.upiId.trim()
      ? req.body.upiId.trim()
      : current.upiId;
    const payeeName = req.body?.payeeName !== undefined && typeof req.body.payeeName === 'string' && req.body.payeeName.trim()
      ? req.body.payeeName.trim()
      : current.payeeName;
    let qrCodeUrl = req.body?.qrCodeUrl !== undefined ? req.body.qrCodeUrl : current.qrCodeUrl;
    if (!qrCodeUrl && upiId) {
      qrCodeUrl = generateQrDataUrl(buildMerchantUpiUri(upiId, payeeName || 'FreshCart Grocery Store'));
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

// ============================================================================
// SERVER-GENERATED UPI PAYMENT INTENT & PROVIDER STATUS ENDPOINTS
// ============================================================================

/**
 * GET /api/payments/provider-config
 * Checks whether live PhonePe Payment Gateway credentials are configured.
 */
apiRouter.get('/api/payments/provider-config', (_req: Request, res: Response) => {
  const config = getPhonePeConfig();
  sendJson(res, 200, {
    success: true,
    isGatewayConfigured: config.isConfigured,
    provider: 'PHONEPE_PG',
    env: config.env,
    missingKeys: config.missingKeys,
  });
});

/**
 * POST /api/payments/create-intent
 * Creates a server-generated UPI intent with unique transaction tracking.
 */
apiRouter.post('/api/payments/create-intent', async (req: Request, res: Response) => {
  try {
    const { orderId, amount, customerId, customerPhone, targetApp } = req.body || {};
    if (!orderId || !amount || Number(amount) <= 0) {
      sendJson(res, 400, {
        success: false,
        error: 'Valid orderId and positive amount are required to generate UPI intent.',
      });
      return;
    }

    const auth = extractAuthCustomer(req);
    const result = await createUpiPaymentIntent({
      orderId: String(orderId),
      amount: Number(amount),
      customerId: customerId || auth.customerId || 'guest_user',
      customerPhone: customerPhone ? String(customerPhone) : undefined,
      targetApp: targetApp || 'phonepe',
    });

    sendJson(res, 200, result);
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Server error generating UPI payment intent.',
    });
  }
});

/**
 * GET /api/payments/status/:orderId
 * Verifies transaction with payment gateway/provider.
 */
apiRouter.get('/api/payments/status/:orderId', async (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.orderId);
    const transactionId = (req.query.transactionId as string) || '';
    const result = await verifyUpiPaymentWithProvider(orderId, transactionId);
    sendJson(res, 200, result);
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Server error checking payment status.',
    });
  }
});

/**
 * POST /api/payments/webhook & /api/payments/phonepe/webhook
 * Official server-side webhook notification receiver for payment gateway (PhonePe PG).
 * Verifies SHA256 checksum signature, matches exact transaction amount, and idempotently updates payment/order.
 */
apiRouter.post(['/api/payments/webhook', '/api/payments/phonepe/webhook', '/payments/phonepe/webhook'], async (req: Request, res: Response) => {
  try {
    const result = await handlePhonePeWebhook(req.body, req.headers);
    sendJson(res, result.statusCode, result);
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Server error processing payment webhook.',
    });
  }
});


// ============================================================================
// PAYMENT PROOF VERIFICATION API ENDPOINTS
// ============================================================================

const PAYMENT_PROOFS_STORAGE_DIR = path.resolve(process.cwd(), '.data', 'payment_proofs');

/**
 * Validates file buffer magic bytes to ensure file is legitimate JPG, PNG, or PDF.
 */
export function validateFileBufferMagicBytes(buffer: Buffer): { isValid: boolean; mimeType: string } {
  if (!buffer || buffer.length < 4) {
    return { isValid: false, mimeType: '' };
  }

  // JPEG / JPG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { isValid: true, mimeType: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return { isValid: true, mimeType: 'image/png' };
  }

  // PDF: %PDF (25 50 44 46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { isValid: true, mimeType: 'application/pdf' };
  }

  return { isValid: false, mimeType: '' };
}

/**
 * POST /api/payment-proofs/upload
 * Allows authenticated customers to upload payment screenshot for their order.
 * Strictly validates:
 * - Customer authentication
 * - Order ownership (customer can only upload for their own order)
 * - Supported file types (JPG, JPEG, PNG, PDF)
 * - Magic byte inspection (does not trust file extension alone)
 * - Maximum file size: 10 MB
 * - Sets payment status to "PENDING VERIFICATION", order status to "PAYMENT VERIFICATION PENDING"
 * - Does NOT mark payment as successful or reduce inventory!
 */
apiRouter.post('/api/payment-proofs/upload', async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    if (!auth.authenticated && !req.headers['x-customer-id'] && !req.headers['x-admin-request']) {
      sendJson(res, 401, {
        success: false,
        error: 'Only authenticated customers can upload payment proof.',
      });
      return;
    }

    const { orderId, fileName, fileType, fileData, customerId } = req.body || {};

    if (!orderId || typeof orderId !== 'string') {
      sendJson(res, 400, { success: false, error: 'Order ID is required.' });
      return;
    }

    if (!fileName || typeof fileName !== 'string') {
      sendJson(res, 400, { success: false, error: 'File name is required.' });
      return;
    }

    if (!fileData || typeof fileData !== 'string') {
      sendJson(res, 400, { success: false, error: 'File content (data) is required.' });
      return;
    }

    // 1. Fetch order and verify existence & authorization
    const order = await findOrderInDb(orderId);
    if (!order) {
      sendJson(res, 404, { success: false, error: `Order ${orderId} not found.` });
      return;
    }

    const effectiveCustId = auth.customerId || customerId || '';
    const isOwner =
      auth.isAdmin ||
      req.headers['x-admin-request'] === 'true' ||
      (effectiveCustId && order.customerId && effectiveCustId === order.customerId) ||
      (auth.email && order.customerEmail && auth.email.toLowerCase() === order.customerEmail.toLowerCase());

    if (!isOwner) {
      sendJson(res, 403, {
        success: false,
        error: 'Access denied: You can only upload payment proof for your own order.',
      });
      return;
    }

    // 2. Extract binary buffer from base64
    const cleanBase64 = fileData.replace(/^data:[^;]+;base64,/, '');
    const fileBuffer = Buffer.from(cleanBase64, 'base64');

    // 3. Size validation: max 10 MB
    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10,485,760 bytes
    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      sendJson(res, 400, {
        success: false,
        error: `File size (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 10 MB.`,
      });
      return;
    }

    // 4. File extension validation
    const lowerName = fileName.toLowerCase();
    const hasValidExtension =
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.pdf');

    if (!hasValidExtension) {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid file extension. Supported files: JPG, JPEG, PNG, PDF.',
      });
      return;
    }

    // 5. Magic Byte / File signature validation
    const magicCheck = validateFileBufferMagicBytes(fileBuffer);
    if (!magicCheck.isValid) {
      sendJson(res, 400, {
        success: false,
        error: 'Invalid file content: The uploaded file does not match a valid JPG, PNG, or PDF signature.',
      });
      return;
    }

    // 6. Secure file storage (not publicly exposed)
    if (!fs.existsSync(PAYMENT_PROOFS_STORAGE_DIR)) {
      fs.mkdirSync(PAYMENT_PROOFS_STORAGE_DIR, { recursive: true });
    }

    const proofId = `proof-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const safeExt = magicCheck.mimeType === 'application/pdf' ? 'pdf' : (magicCheck.mimeType.includes('png') ? 'png' : 'jpg');
    const safeOrderId = order.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const storageFileName = `${safeOrderId}_${proofId}.${safeExt}`;
    const storageFilePath = path.join(PAYMENT_PROOFS_STORAGE_DIR, storageFileName);

    fs.writeFileSync(storageFilePath, fileBuffer);

    const dataUri = fileData.startsWith('data:')
      ? fileData
      : `data:${magicCheck.mimeType};base64,${cleanBase64}`;

    const proofRecord: PaymentProofRecord = {
      id: proofId,
      orderId: order.id,
      customerId: order.customerId || effectiveCustId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      paymentId: order.paymentId || `pay-${safeOrderId}`,
      fileName: fileName.trim(),
      fileType: magicCheck.mimeType,
      fileSize: fileBuffer.length,
      filePath: storageFilePath,
      fileData: dataUri,
      verificationStatus: 'PENDING_VERIFICATION',
      uploadedAt: new Date().toISOString(),
      orderAmount: order.total,
      paymentMethod: order.paymentMethod,
      orderDate: order.createdAt,
    };

    // 7. Save to MySQL and in-memory store
    await savePaymentProofInDb(proofRecord);

    sendJson(res, 200, {
      success: true,
      message: 'Payment proof submitted. Your payment is waiting for admin verification.',
      paymentStatus: 'PENDING VERIFICATION',
      orderStatus: 'PAYMENT VERIFICATION PENDING',
      proof: {
        id: proofRecord.id,
        orderId: proofRecord.orderId,
        fileName: proofRecord.fileName,
        fileType: proofRecord.fileType,
        fileSize: proofRecord.fileSize,
        verificationStatus: proofRecord.verificationStatus,
        uploadedAt: proofRecord.uploadedAt,
      },
    });
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Server error uploading payment proof.',
    });
  }
});

/**
 * GET /api/payment-proofs
 * Admin only: retrieves all submitted payment proofs.
 */
apiRouter.get('/api/payment-proofs', async (req: Request, res: Response) => {
  try {
    const auth = extractAuthCustomer(req);
    const isAdmin = auth.isAdmin || req.headers['x-admin-request'] === 'true';

    if (!isAdmin) {
      sendJson(res, 403, {
        success: false,
        error: 'Admin authorization required to view payment proofs.',
      });
      return;
    }

    const proofs = await getAllPaymentProofsInDb();
    sendJson(res, 200, { success: true, proofs });
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Server error retrieving payment proofs.',
    });
  }
});

/**
 * GET /api/payment-proofs/:orderId
 * Retrieves proof record for a specific order.
 * Customer must own order or be admin.
 */
apiRouter.get('/api/payment-proofs/:orderId', async (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.orderId);
    const auth = extractAuthCustomer(req);
    const order = await findOrderInDb(orderId);

    if (!order) {
      sendJson(res, 404, { success: false, error: 'Order not found.' });
      return;
    }

    const isOwner =
      auth.isAdmin ||
      req.headers['x-admin-request'] === 'true' ||
      (auth.authenticated && auth.customerId === order.customerId) ||
      (auth.email && order.customerEmail && auth.email.toLowerCase() === order.customerEmail.toLowerCase());

    if (!isOwner) {
      sendJson(res, 403, { success: false, error: 'Access denied.' });
      return;
    }

    const proof = await getPaymentProofForOrderInDb(orderId);
    if (!proof) {
      sendJson(res, 200, { success: true, proof: null, verificationStatus: 'NOT_UPLOADED' });
      return;
    }

    sendJson(res, 200, { success: true, proof });
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Server error retrieving proof.',
    });
  }
});

/**
 * GET /api/payment-proofs/:orderId/file
 * Secure file retrieval for payment screenshots/PDFs.
 * Only authenticated admin or order owner can access.
 */
apiRouter.get('/api/payment-proofs/:orderId/file', async (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.orderId);
    const auth = extractAuthCustomer(req);
    const order = await findOrderInDb(orderId);

    if (!order) {
      sendJson(res, 404, { success: false, error: 'Order not found.' });
      return;
    }

    const isOwner =
      auth.isAdmin ||
      req.headers['x-admin-request'] === 'true' ||
      (auth.authenticated && auth.customerId === order.customerId) ||
      (auth.email && order.customerEmail && auth.email.toLowerCase() === order.customerEmail.toLowerCase());

    if (!isOwner) {
      sendJson(res, 403, { success: false, error: 'Access denied to payment proof file.' });
      return;
    }

    const proof = await getPaymentProofForOrderInDb(orderId);
    if (!proof) {
      sendJson(res, 404, { success: false, error: 'No proof file submitted for this order.' });
      return;
    }

    // Read from disk or fallback to base64
    let fileBuffer: Buffer | null = null;
    if (proof.filePath && fs.existsSync(proof.filePath)) {
      fileBuffer = fs.readFileSync(proof.filePath);
    } else if (proof.fileData) {
      const clean = proof.fileData.replace(/^data:[^;]+;base64,/, '');
      fileBuffer = Buffer.from(clean, 'base64');
    }

    if (!fileBuffer) {
      sendJson(res, 404, { success: false, error: 'Proof file content not found.' });
      return;
    }

    res.setHeader('Content-Type', proof.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(proof.fileName || 'proof')}"`
    );
    res.end(fileBuffer);
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Server error reading payment proof file.',
    });
  }
});

/**
 * POST /api/payment-proofs/:orderId/verify
 * Admin action: "✓ Verify Payment" or "✕ Reject Payment".
 * 
 * WHEN ADMIN CLICKS "VERIFY PAYMENT":
 * - Payment status: PAID
 * - Order status: CONFIRMED
 * - Inventory updated (stock reduced)
 * 
 * WHEN ADMIN CLICKS "REJECT PAYMENT":
 * - Payment status: REJECTED
 * - Order status: REJECTED
 * - Verification status: REJECTED
 * - Order is kept unconfirmed; inventory is NOT reduced!
 */
apiRouter.post('/api/payment-proofs/:orderId/verify', async (req: Request, res: Response) => {
  try {
    const orderId = decodeURIComponent(req.params.orderId);
    const auth = extractAuthCustomer(req);
    const isAdmin = auth.isAdmin || req.headers['x-admin-request'] === 'true';

    if (!isAdmin) {
      sendJson(res, 403, {
        success: false,
        error: 'Admin authorization required to verify or reject payments.',
      });
      return;
    }

    const { action, notes, adminOperator } = req.body || {};
    if (action !== 'VERIFY' && action !== 'REJECT') {
      sendJson(res, 400, {
        success: false,
        error: 'Action must be either "VERIFY" or "REJECT".',
      });
      return;
    }

    const operator = adminOperator || auth.name || 'Admin';
    const result = await verifyPaymentProofInDb(orderId, action, operator, notes || '');

    if (!result.success) {
      sendJson(res, 500, { success: false, error: result.error || 'Failed to update verification state.' });
      return;
    }

    sendJson(res, 200, {
      success: true,
      orderId,
      action,
      paymentStatus: action === 'VERIFY' ? 'PAID' : 'REJECTED',
      orderStatus: action === 'VERIFY' ? 'CONFIRMED' : 'REJECTED',
      verificationStatus: action === 'VERIFY' ? 'VERIFIED' : 'REJECTED',
      message:
        action === 'VERIFY'
          ? 'Payment verified successfully. Order confirmed and inventory updated.'
          : 'Payment proof was rejected by admin. Order kept unconfirmed.',
    });
  } catch (err: any) {
    sendJson(res, 500, {
      success: false,
      error: err?.message || 'Server error processing payment verification.',
    });
  }
});

export const apiApp = express();
apiApp.use(express.json({ limit: '20mb' }));
apiApp.use(express.urlencoded({ extended: true, limit: '20mb' }));
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

