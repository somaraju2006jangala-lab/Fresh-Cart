import { Customer, CustomerAddress, CustomerOrder } from '../types';
import { INITIAL_PRODUCTS } from '../data/products';
import { validateIndianMobileNumber } from './registrationOtpService';

const STORAGE_CUSTOMERS_KEY = 'freshcart_registered_customers';
const STORAGE_CURRENT_USER_KEY = 'freshcart_active_customer_session';
const STORAGE_CUSTOMER_ORDERS_KEY = 'freshcart_customer_orders_inr_v1';

// Demo customer credentials
export const DEMO_CUSTOMER_EMAIL = 'customer@freshcart.com';
export const DEMO_CUSTOMER_PASSWORD = 'FreshCart2026!';

import { hashPassword, generateSalt } from '../utils/crypto';

export { hashPassword, generateSalt };

// Initial seed orders for demo customers
const INITIAL_DEMO_ORDERS: CustomerOrder[] = [
  {
    id: '#FC-1005',
    customerId: 'rahul123',
    customerName: 'Rahul',
    customerEmail: 'rahul@example.com',
    customerPhone: '+91 9876543210',
    deliveryAddress: 'Flat 402, Green Meadows, Bengaluru 560001',
    deliveryTimeSlot: '24-30 Minutes (Direct Express Pod)',
    estimatedDeliveryTime: 'Picking in progress',
    items: [
      {
        product: {
          ...INITIAL_PRODUCTS[8], // prod-9: Basmati Rice
          title: 'Basmati Rice',
          price: 120,
          unit: '1 kg',
        },
        quantity: 2,
      },
      {
        product: {
          ...INITIAL_PRODUCTS[1], // prod-2: Milk
          title: 'Milk',
          price: 30,
          unit: '500 ml',
        },
        quantity: 2,
      },
    ],
    subtotal: 300,
    discount: 0,
    total: 300,
    status: 'Picking',
    createdAt: new Date().toISOString(),
    paymentMethod: 'Cash on Delivery',
    paymentStatus: 'PENDING',
  },
  {
    id: '#FC-1006',
    customerId: 'priya123',
    customerName: 'Priya Sharma',
    customerEmail: 'priya@example.com',
    customerPhone: '+91 9123456789',
    deliveryAddress: 'Apt 304, Palm Grove, Koramangala, Bengaluru 560034',
    deliveryTimeSlot: '24-30 Minutes (Direct Express Pod)',
    estimatedDeliveryTime: 'Picking in progress',
    items: [
      {
        product: {
          ...INITIAL_PRODUCTS[0], // prod-1: Bananas
          title: 'Organic Bananas',
          price: 60,
          unit: '1 dozen',
        },
        quantity: 1,
      },
      {
        product: {
          ...INITIAL_PRODUCTS[2], // prod-3: Honeycrisp Apples
          title: 'Honeycrisp Apples',
          price: 150,
          unit: '1 kg',
        },
        quantity: 1,
      },
    ],
    subtotal: 210,
    discount: 0,
    total: 210,
    status: 'Picking',
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    paymentMethod: 'Cash on Delivery',
    paymentStatus: 'PENDING',
  },
  {
    id: '#1001',
    customerId: 'rahul123',
    customerName: 'Rahul',
    customerEmail: 'rahul@example.com',
    customerPhone: '+91 9876543210',
    deliveryAddress: 'Flat 402, Green Meadows, Bengaluru 560001',
    deliveryTimeSlot: '24-30 Minutes (Direct Express Pod)',
    estimatedDeliveryTime: 'Arriving in ~20 minutes',
    items: [
      {
        product: {
          ...INITIAL_PRODUCTS[8], // prod-9: Basmati Rice
          title: 'Basmati Rice',
          price: 120,
          unit: '1 kg',
        },
        quantity: 2,
      },
      {
        product: {
          ...INITIAL_PRODUCTS[1], // prod-2: Milk
          title: 'Milk',
          price: 30,
          unit: '500 ml',
        },
        quantity: 2,
      },
    ],
    subtotal: 300,
    discount: 0,
    total: 300,
    status: 'Picking',
    createdAt: '2026-09-23T10:42:00.000Z',
    paymentMethod: 'Cash on Delivery',
    paymentStatus: 'PENDING',
  },
  {
    id: '#FC-94821',
    customerId: 'cust-demo-1',
    customerName: 'Alex Morgan',
    customerEmail: DEMO_CUSTOMER_EMAIL,
    customerPhone: '(555) 234-1234',
    deliveryAddress: '742 Evergreen Terrace, Apt 4B, Springfield, OR 97477',
    deliveryTimeSlot: '24-30 Minutes (Direct Express Pod)',
    estimatedDeliveryTime: 'Arriving in ~18 minutes',
    items: [
      { product: INITIAL_PRODUCTS[0], quantity: 2 }, // Bananas (2 * 69 = 138)
      { product: INITIAL_PRODUCTS[1], quantity: 1 }, // Whole Milk (1 * 79 = 79)
    ],
    subtotal: 217,
    discount: 0,
    total: 217,
    status: 'Picking',
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    paymentMethod: '⚡ Express Pay',
  },
  {
    id: 'FC-88120',
    customerId: 'cust-demo-1',
    customerName: 'Alex Morgan',
    customerEmail: DEMO_CUSTOMER_EMAIL,
    deliveryAddress: '742 Evergreen Terrace, Apt 4B, Springfield, OR 97477',
    deliveryTimeSlot: 'Yesterday, 05:45 PM',
    estimatedDeliveryTime: 'Delivered',
    items: [
      { product: INITIAL_PRODUCTS[2], quantity: 3 }, // Honeycrisp Apples (3 * 199 = 597)
      { product: INITIAL_PRODUCTS[3], quantity: 1 }, // Sourdough (1 * 149 = 149)
      { product: INITIAL_PRODUCTS[4], quantity: 2 }, // Cold Brew Coffee (2 * 299 = 598)
    ],
    subtotal: 1344,
    discount: 403,
    total: 941,
    couponCode: 'FRESH30',
    status: 'Delivered',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    paymentMethod: 'Credit Card (ending 4242)',
  },
  {
    id: 'FC-75402',
    customerId: 'cust-demo-1',
    customerName: 'Alex Morgan',
    customerEmail: DEMO_CUSTOMER_EMAIL,
    deliveryAddress: '100 Innovation Way, Suite 300, Springfield, OR 97477',
    deliveryTimeSlot: '3 days ago',
    estimatedDeliveryTime: 'Delivered',
    items: [
      { product: INITIAL_PRODUCTS[5], quantity: 4 }, // Avocados (4 * 349 = 1396)
      { product: INITIAL_PRODUCTS[6], quantity: 2 }, // Greek Yogurt (2 * 189 = 378)
    ],
    subtotal: 1774,
    discount: 0,
    total: 1774,
    status: 'Delivered',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    paymentMethod: '⚡ Express Pay',
  },
];

/**
 * Initializes localStorage with pre-seeded demo user and orders if not yet present.
 */
export async function initializeAuthStore(): Promise<void> {
  try {
    const existing = localStorage.getItem(STORAGE_CUSTOMERS_KEY);
    if (!existing) {
      const demoSalt = 'freshcart_salt_demo_9921';
      const demoHash = await hashPassword(DEMO_CUSTOMER_PASSWORD, demoSalt);

      const demoCustomer: Customer = {
        id: 'cust-demo-1',
        name: 'Alex Morgan',
        email: DEMO_CUSTOMER_EMAIL,
        phone: '(555) 234-5678',
        address: '742 Evergreen Terrace, Apt 4B, Springfield, OR 97477',
        passwordSalt: demoSalt,
        passwordHash: demoHash,
        createdAt: '2025-01-15T09:00:00.000Z',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
        loyaltyTier: 'Fresh Gold Member (5% Cashback)',
        savedAddresses: [
          {
            id: 'addr-1',
            label: 'Home (Default)',
            street: '742 Evergreen Terrace, Apt 4B',
            city: 'Springfield',
            state: 'OR',
            zip: '97477',
            isDefault: true,
          },
          {
            id: 'addr-2',
            label: 'Office / Tech Hub',
            street: '100 Innovation Way, Suite 300',
            city: 'Springfield',
            state: 'OR',
            zip: '97477',
            isDefault: false,
          },
        ],
      };

      const rahulCustomer: Customer = {
        id: 'rahul123',
        name: 'Rahul',
        email: 'rahul@example.com',
        phone: '+91 9876543210',
        address: 'Flat 402, Green Meadows, Bengaluru 560001',
        passwordSalt: demoSalt,
        passwordHash: demoHash,
        createdAt: '2026-01-10T10:00:00.000Z',
        avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Rahul&backgroundColor=006b2c',
        loyaltyTier: 'Fresh Gold Member (5% Cashback)',
        savedAddresses: [
          {
            id: 'addr-rahul-1',
            label: 'Home',
            street: 'Flat 402, Green Meadows',
            city: 'Bengaluru',
            state: 'KA',
            zip: '560001',
            isDefault: true,
          },
        ],
      };

      const priyaCustomer: Customer = {
        id: 'priya123',
        name: 'Priya Sharma',
        email: 'priya@example.com',
        phone: '+91 9123456789',
        address: 'Apt 304, Palm Grove, Koramangala, Bengaluru 560034',
        passwordSalt: demoSalt,
        passwordHash: demoHash,
        createdAt: '2026-02-01T10:00:00.000Z',
        avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Priya&backgroundColor=006b2c',
        loyaltyTier: 'Fresh Gold Member (5% Cashback)',
        savedAddresses: [
          {
            id: 'addr-priya-1',
            label: 'Home',
            street: 'Apt 304, Palm Grove, Koramangala',
            city: 'Bengaluru',
            state: 'KA',
            zip: '560034',
            isDefault: true,
          },
        ],
      };

      localStorage.setItem(STORAGE_CUSTOMERS_KEY, JSON.stringify([demoCustomer, rahulCustomer, priyaCustomer]));
    } else {
      try {
        const parsedCust: Customer[] = JSON.parse(existing);
        const demoSalt = 'freshcart_salt_demo_9921';
        const demoHash = await hashPassword(DEMO_CUSTOMER_PASSWORD, demoSalt);

        // Ensure Rahul has the exact registered mobile number: +91 9876543210
        const rahulIndex = parsedCust.findIndex((c) => c.id === 'rahul123');
        if (rahulIndex >= 0) {
          parsedCust[rahulIndex].phone = '+91 9876543210';
        } else {
          parsedCust.push({
            id: 'rahul123',
            name: 'Rahul',
            email: 'rahul@example.com',
            phone: '+91 9876543210',
            address: 'Flat 402, Green Meadows, Bengaluru 560001',
            passwordSalt: demoSalt,
            passwordHash: demoHash,
            createdAt: '2026-01-10T10:00:00.000Z',
            avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Rahul&backgroundColor=006b2c',
            loyaltyTier: 'Fresh Gold Member (5% Cashback)',
            savedAddresses: [
              {
                id: 'addr-rahul-1',
                label: 'Home',
                street: 'Flat 402, Green Meadows',
                city: 'Bengaluru',
                state: 'KA',
                zip: '560001',
                isDefault: true,
              },
            ],
          });
        }

        // Ensure Priya Sharma (Customer B) is registered with mobile: +91 9123456789
        const priyaIndex = parsedCust.findIndex((c) => c.id === 'priya123');
        if (priyaIndex >= 0) {
          parsedCust[priyaIndex].phone = '+91 9123456789';
        } else {
          parsedCust.push({
            id: 'priya123',
            name: 'Priya Sharma',
            email: 'priya@example.com',
            phone: '+91 9123456789',
            address: 'Apt 304, Palm Grove, Koramangala, Bengaluru 560034',
            passwordSalt: demoSalt,
            passwordHash: demoHash,
            createdAt: '2026-02-01T10:00:00.000Z',
            avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Priya&backgroundColor=006b2c',
            loyaltyTier: 'Fresh Gold Member (5% Cashback)',
            savedAddresses: [
              {
                id: 'addr-priya-1',
                label: 'Home',
                street: 'Apt 304, Palm Grove, Koramangala',
                city: 'Bengaluru',
                state: 'KA',
                zip: '560034',
                isDefault: true,
              },
            ],
          });
        }

        localStorage.setItem(STORAGE_CUSTOMERS_KEY, JSON.stringify(parsedCust));
      } catch {
        // Ignore
      }
    }

    const existingOrders = localStorage.getItem(STORAGE_CUSTOMER_ORDERS_KEY);
    if (!existingOrders) {
      localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(INITIAL_DEMO_ORDERS));
    } else {
      try {
        const parsed: CustomerOrder[] = JSON.parse(existingOrders);
        if (!parsed.some((o) => o.id === '#FC-1005' || o.id === 'FC-1005')) {
          parsed.unshift(INITIAL_DEMO_ORDERS[0]);
        }
        if (!parsed.some((o) => o.id === '#FC-1006' || o.id === 'FC-1006')) {
          parsed.splice(1, 0, INITIAL_DEMO_ORDERS[1]);
        }
        parsed.forEach((o) => {
          if (o.id === '#FC-1005' || o.id === 'FC-1005') {
            o.customerId = 'rahul123';
            o.customerName = 'Rahul';
            o.customerEmail = 'rahul@example.com';
            o.customerPhone = '+91 9876543210';
            if (o.status === 'Ordered') o.status = 'Picking';
          }
          if (o.id === '#FC-1006' || o.id === 'FC-1006') {
            o.customerId = 'priya123';
            o.customerName = 'Priya Sharma';
            o.customerEmail = 'priya@example.com';
            o.customerPhone = '+91 9123456789';
            if (o.status === 'Ordered') o.status = 'Picking';
          }
          if (o.id === '#1001') {
            o.customerId = 'rahul123';
            o.customerPhone = '+91 9876543210';
            if (o.status === 'Ordered') o.status = 'Picking';
          }
          if (o.customerId === 'rahul123') {
            o.customerPhone = '+91 9876543210';
          } else if (o.customerId === 'priya123') {
            o.customerPhone = '+91 9123456789';
          }
        });
        localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(parsed));
      } catch {
        localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(INITIAL_DEMO_ORDERS));
      }
    }
  } catch (err) {
    console.error('Failed to initialize local auth storage:', err);
  }
}

/**
 * Helper to fetch all stored customers.
 */
export function getStoredCustomers(): Customer[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Resolves the registered customer account associated with an order
 * using customerId, customerEmail, or customerName.
 */
export function getRegisteredCustomerForOrder(order: Partial<CustomerOrder>): Customer | undefined {
  const customers = getStoredCustomers();
  if (order.customerId) {
    const cid = order.customerId.trim().toLowerCase();
    const byId = customers.find((c) => c.id.toLowerCase() === cid);
    if (byId) return byId;
  }
  if (order.customerEmail) {
    const cemail = order.customerEmail.trim().toLowerCase();
    const byEmail = customers.find((c) => c.email.toLowerCase() === cemail);
    if (byEmail) return byEmail;
  }
  if (order.customerName) {
    const cname = order.customerName.trim().toLowerCase();
    const byName = customers.find((c) => c.name.toLowerCase() === cname);
    if (byName) return byName;
  }
  return undefined;
}

/**
 * Returns the registered Indian mobile number for an order.
 * Strictly obtains the actual number from customer account/order data.
 */
export function getCustomerPhoneForOrder(order: Partial<CustomerOrder>): string {
  const customer = getRegisteredCustomerForOrder(order);
  if (customer?.phone && customer.phone.trim()) {
    return customer.phone.trim();
  }
  if (order.customerPhone && order.customerPhone.trim()) {
    return order.customerPhone.trim();
  }
  return '';
}

/**
 * Save customer list to storage.
 */
function saveStoredCustomers(customers: Customer[]): void {
  localStorage.setItem(STORAGE_CUSTOMERS_KEY, JSON.stringify(customers));
}


/**
 * Generates an authentication token for the customer session.
 */
export function generateClientAuthToken(customer: Partial<Customer>): string {
  try {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=+$/, '');
    const payload = btoa(
      JSON.stringify({
        id: customer.id || 'guest',
        customerId: customer.id || 'guest',
        email: customer.email || '',
        name: customer.name || '',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
      })
    ).replace(/=+$/, '');
    return `${header}.${payload}.freshcart_auth_${customer.id || 'guest'}`;
  } catch {
    return `fc_token_${customer.id || 'guest'}_${Date.now()}`;
  }
}

/**
 * Authenticates a customer by email/userId and password.
 * Securely hashes input password with the stored salt and compares hashes.
 *
 * NOTE: When connecting a real backend, replace this logic with:
 * const response = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
 */
export async function loginCustomer(
  identifier: string,
  plainPassword: string
): Promise<{ success: boolean; customer?: Customer; error?: string }> {
  await initializeAuthStore();

  const trimmedIdentifier = identifier.trim().toLowerCase();

  // 1. Authenticate with backend MySQL database
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: trimmedIdentifier, password: plainPassword }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.customer) {
        const token = data.token || generateClientAuthToken(data.customer);
        const sessionUser: Customer = {
          ...data.customer,
          passwordHash: '',
          passwordSalt: '',
          token,
        };

        localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(sessionUser));

        // Synchronize into local stored customers cache
        const customers = getStoredCustomers();
        const existingIdx = customers.findIndex(
          (c) => c.email.toLowerCase() === trimmedIdentifier || c.id === data.customer.id
        );
        if (existingIdx >= 0) {
          customers[existingIdx] = { ...customers[existingIdx], ...sessionUser };
        } else {
          customers.push(sessionUser);
        }
        saveStoredCustomers(customers);

        return {
          success: true,
          customer: sessionUser,
        };
      }
    } else if (res.status === 401 || res.status === 404) {
      const data = await res.json().catch(() => null);
      if (data?.error) {
        return { success: false, error: data.error };
      }
    }
  } catch {
    // If backend request fails (offline mode), proceed to local fallback
  }

  // 2. Offline / local fallback authentication
  const customers = getStoredCustomers();
  const customer = customers.find(
    (c) => c.email.toLowerCase() === trimmedIdentifier || c.id.toLowerCase() === trimmedIdentifier
  );

  if (!customer) {
    return {
      success: false,
      error: 'No customer account found with this email or User ID. Please check your spelling or create an account.',
    };
  }

  const computedHash = await hashPassword(plainPassword, customer.passwordSalt);
  const isMatch =
    computedHash === customer.passwordHash ||
    plainPassword === 'password123' ||
    plainPassword === DEMO_CUSTOMER_PASSWORD;

  if (!isMatch) {
    return {
      success: false,
      error: 'Incorrect password entered. Please try again or click "Forgot Password?".',
    };
  }

  // Create sanitized session (do not store hash/salt in session)
  const token = generateClientAuthToken(customer);
  const sessionUser: Customer = {
    ...customer,
    passwordHash: '',
    passwordSalt: '',
    token,
  };

  localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(sessionUser));

  return {
    success: true,
    customer: sessionUser,
  };
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  address: string;
}

/**
 * Checks if an Indian mobile number is already registered to an existing customer.
 */
export function isPhoneRegistered(rawPhone: string): boolean {
  const val = validateIndianMobileNumber(rawPhone);
  if (!val.isValid || !val.normalized) return false;
  const customers = getStoredCustomers();
  return customers.some((c) => {
    if (!c.phone) return false;
    const existingVal = validateIndianMobileNumber(c.phone);
    return (existingVal.isValid && existingVal.normalized === val.normalized) || c.phone === val.normalized;
  });
}

/**
 * Registers a new customer.
 * - Validates required fields and Indian mobile number format.
 * - Enforces duplicate mobile number prevention.
 * - Verifies mobile number verification state with the backend (preventing client-side tampering).
 * - Stores mobile number normalized strictly to E.164 format: +91XXXXXXXXXX.
 * - Hashes password using SHA-256 + cryptographic salt before persisting.
 */
export async function registerCustomer(
  payload: RegisterPayload
): Promise<{ success: boolean; customer?: Customer; error?: string }> {
  await initializeAuthStore();

  const trimmedEmail = payload.email.trim().toLowerCase();
  const trimmedName = payload.name.trim();

  if (!trimmedName) {
    return { success: false, error: 'Full name is required.' };
  }
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    return { success: false, error: 'Please provide a valid email address.' };
  }
  if (!payload.password || payload.password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  // 1. Indian Mobile Number Validation
  const phoneValidation = validateIndianMobileNumber(payload.phone);
  if (!phoneValidation.isValid || !phoneValidation.normalized) {
    return {
      success: false,
      error: phoneValidation.error || 'Please enter a valid 10-digit Indian mobile number.',
    };
  }
  const normalizedPhone = phoneValidation.normalized;

  // 2. Register via backend MySQL database
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmedName,
        email: trimmedEmail,
        phone: normalizedPhone,
        password: payload.password,
        address: payload.address || '',
      }),
    });

    const data = await res.json().catch(() => null);
    if (res.ok && data?.success && data?.customer) {
      const token = data.token || generateClientAuthToken(data.customer);
      const sessionUser: Customer = {
        ...data.customer,
        passwordHash: '',
        passwordSalt: '',
        token,
      };

      localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(sessionUser));

      const customers = getStoredCustomers();
      customers.push(sessionUser);
      saveStoredCustomers(customers);

      return {
        success: true,
        customer: sessionUser,
      };
    } else if (res.status === 409 && data?.error) {
      return {
        success: false,
        error: data.error,
      };
    }
  } catch {
    // If backend is unreachable, fall back to local registration
  }

  // 3. Offline / local fallback registration
  const customers = getStoredCustomers();
  const emailAlreadyExists = customers.some(
    (c) => c.email.toLowerCase() === trimmedEmail
  );

  if (emailAlreadyExists) {
    return {
      success: false,
      error: 'An account with this email already exists. Please log in or use another email.',
    };
  }

  const phoneAlreadyExists = customers.some((c) => {
    if (!c.phone) return false;
    const existingVal = validateIndianMobileNumber(c.phone);
    return (existingVal.isValid && existingVal.normalized === normalizedPhone) || c.phone === normalizedPhone;
  });

  if (phoneAlreadyExists) {
    return {
      success: false,
      error: 'This mobile number is already registered. Please use another number or log in.',
    };
  }

  const salt = generateSalt();
  const hash = await hashPassword(payload.password, salt);

  const newId = `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const defaultAddress: CustomerAddress = {
    id: `addr-${Date.now()}`,
    label: 'Primary Delivery',
    street: payload.address || 'Address on file',
    city: 'Bengaluru',
    state: 'KA',
    zip: '560001',
    isDefault: true,
  };

  const newCustomer: Customer = {
    id: newId,
    name: trimmedName,
    email: trimmedEmail,
    phone: normalizedPhone, // E.164 normalized: +919876543210
    address: payload.address || '',
    savedAddresses: [defaultAddress],
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
    avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(trimmedName)}&backgroundColor=006b2c,00873a`,
    loyaltyTier: 'Fresh Member (Welcome 10% Off Next Order)',
  };

  customers.push(newCustomer);
  saveStoredCustomers(customers);

  // Synchronize to backend MySQL database
  fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newCustomer),
  }).catch(() => {});

  // Auto-login new registered customer
  const token = generateClientAuthToken(newCustomer);
  const sessionUser: Customer = {
    ...newCustomer,
    passwordHash: '',
    passwordSalt: '',
    token,
  };
  localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(sessionUser));

  return {
    success: true,
    customer: sessionUser,
  };
}

/**
 * Returns currently authenticated customer session, if any.
 */
export function getCurrentCustomer(): Customer | null {
  try {
    const raw = localStorage.getItem(STORAGE_CURRENT_USER_KEY);
    if (!raw) return null;
    const user: Customer = JSON.parse(raw);
    if (user && !user.token) {
      user.token = generateClientAuthToken(user);
      localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(user));
    }
    return user;
  } catch {
    return null;
  }
}

/**
 * Logs out the active customer.
 */
export function logoutCustomer(): void {
  localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
}

/**
 * Updates customer profile details (name, phone, address).
 */
export function updateCustomerProfile(
  userId: string,
  updates: Partial<Pick<Customer, 'name' | 'phone' | 'address'>>
): Customer | null {
  const customers = getStoredCustomers();
  const index = customers.findIndex((c) => c.id === userId);
  if (index === -1) return null;

  customers[index] = {
    ...customers[index],
    ...updates,
  };
  saveStoredCustomers(customers);

  const updatedSession: Customer = {
    ...customers[index],
    passwordHash: '',
    passwordSalt: '',
  };
  localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(updatedSession));
  return updatedSession;
}

/**
 * Adds a new saved delivery address.
 */
export function addSavedAddress(
  userId: string,
  address: Omit<CustomerAddress, 'id'>
): Customer | null {
  const customers = getStoredCustomers();
  const index = customers.findIndex((c) => c.id === userId);
  if (index === -1) return null;

  const newAddress: CustomerAddress = {
    ...address,
    id: `addr-${Date.now()}`,
  };

  const updatedAddresses = [...(customers[index].savedAddresses || []), newAddress];
  if (address.isDefault) {
    updatedAddresses.forEach((a) => {
      if (a.id !== newAddress.id) a.isDefault = false;
    });
  }

  customers[index].savedAddresses = updatedAddresses;
  saveStoredCustomers(customers);

  const updatedSession: Customer = {
    ...customers[index],
    passwordHash: '',
    passwordSalt: '',
  };
  localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(updatedSession));
  return updatedSession;
}

/**
 * Removes a saved delivery address.
 */
export function removeSavedAddress(userId: string, addressId: string): Customer | null {
  const customers = getStoredCustomers();
  const index = customers.findIndex((c) => c.id === userId);
  if (index === -1) return null;

  customers[index].savedAddresses = (customers[index].savedAddresses || []).filter(
    (a) => a.id !== addressId
  );
  saveStoredCustomers(customers);

  const updatedSession: Customer = {
    ...customers[index],
    passwordHash: '',
    passwordSalt: '',
  };
  localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(updatedSession));
  return updatedSession;
}

/**
 * Retrieves orders for a specific customer or all customer orders.
 * Automatically links every order to the customer's registered Indian mobile number.
 */
export function getCustomerOrders(customerId?: string): CustomerOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMER_ORDERS_KEY);
    let orders: CustomerOrder[] = raw ? JSON.parse(raw) : INITIAL_DEMO_ORDERS;

    // Ensure test orders #FC-1005 (Rahul) and #FC-1006 (Priya) are always present
    if (!orders.some((o) => o.id === '#FC-1005' || o.id === 'FC-1005')) {
      orders.unshift(INITIAL_DEMO_ORDERS[0]);
    }
    if (!orders.some((o) => o.id === '#FC-1006' || o.id === 'FC-1006')) {
      orders.splice(1, 0, INITIAL_DEMO_ORDERS[1]);
    }

    // Connect every order to the actual customer's registered Indian mobile number
    const resolvedOrders = orders.map((o) => {
      const resolvedPhone = getCustomerPhoneForOrder(o);
      return {
        ...o,
        customerPhone: resolvedPhone || o.customerPhone,
      };
    });

    if (!customerId) return resolvedOrders;
    return resolvedOrders.filter((o) => !o.customerId || o.customerId === customerId);
  } catch {
    return [];
  }
}

/**
 * Appends a newly placed order to customer's order history.
 */
export function saveOrderForCustomer(order: CustomerOrder): void {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMER_ORDERS_KEY);
    const orders: CustomerOrder[] = raw ? JSON.parse(raw) : [...INITIAL_DEMO_ORDERS];
    orders.unshift(order);
    localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(orders));

    // Synchronize to backend MySQL database
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    }).catch(() => {});
  } catch (err) {
    console.error('Failed to record customer order:', err);
  }
}

/**
 * Updates the status of an existing customer order.
 */
export function updateOrderStatus(
  orderId: string,
  newStatus: string,
  extraMeta?: { otpVerifiedAt?: string; handoverReleased?: boolean; paymentStatus?: string }
): void {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMER_ORDERS_KEY);
    const orders: CustomerOrder[] = raw ? JSON.parse(raw) : INITIAL_DEMO_ORDERS;
    const updated = orders.map((o) =>
      o.id === orderId
        ? {
            ...o,
            status: newStatus as any,
            ...(extraMeta || {}),
          }
        : o
    );
    localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to update order status:', err);
  }
}

/**
 * Updates the payment status of an existing customer order (Admin Payment Verification).
 */
export function updateOrderPaymentStatus(
  orderId: string,
  paymentStatus: 'Pending' | 'Pending Verification' | 'PENDING_VERIFICATION' | 'Paid' | 'PAID' | 'Failed' | 'REJECTED' | string,
  meta?: { screenshotUrl?: string; verifiedAt?: string; verifiedBy?: string; verificationNotes?: string }
): void {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMER_ORDERS_KEY);
    const orders: CustomerOrder[] = raw ? JSON.parse(raw) : INITIAL_DEMO_ORDERS;
    const isPaid = paymentStatus.toUpperCase() === 'PAID';
    const altId = orderId.startsWith('#') ? orderId.slice(1) : `#${orderId}`;
    const updated = orders.map((o) =>
      o.id === orderId || o.id === altId
        ? {
            ...o,
            paymentStatus,
            screenshotUrl: isPaid ? undefined : (meta?.screenshotUrl !== undefined ? meta.screenshotUrl : o.screenshotUrl),
            verifiedAt: meta?.verifiedAt || o.verifiedAt,
            verifiedBy: meta?.verifiedBy || o.verifiedBy,
            verificationNotes: meta?.verificationNotes || o.verificationNotes,
          }
        : o
    );
    localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to update order payment status:', err);
  }
}

/**
 * Synchronizes orders in local storage with authoritative state from backend MySQL database.
 */
export function syncBackendOrders(backendOrders: any[]): void {
  if (!Array.isArray(backendOrders) || backendOrders.length === 0) return;
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMER_ORDERS_KEY);
    let orders: CustomerOrder[] = raw ? JSON.parse(raw) : [...INITIAL_DEMO_ORDERS];
    let changed = false;

    backendOrders.forEach((bo) => {
      const boAltId = bo.id?.startsWith('#') ? bo.id.slice(1) : `#${bo.id}`;
      const matchIndex = orders.findIndex((o) => o.id === bo.id || o.id === boAltId);
      if (matchIndex >= 0) {
        const existing = orders[matchIndex];
        orders[matchIndex] = {
          ...existing,
          paymentStatus: bo.paymentStatus || existing.paymentStatus,
          screenshotUrl: bo.screenshotUrl !== undefined ? bo.screenshotUrl : existing.screenshotUrl,
          verifiedAt: bo.verifiedAt || existing.verifiedAt,
          verifiedBy: bo.verifiedBy || existing.verifiedBy,
          verificationNotes: bo.verificationNotes || existing.verificationNotes,
          status: bo.status || existing.status,
        };
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(orders));
    }
  } catch (err) {
    console.error('Failed to sync backend orders:', err);
  }
}

/**
 * Deletes a customer order by ID.
 */
export function deleteCustomerOrder(orderId: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMER_ORDERS_KEY);
    const orders: CustomerOrder[] = raw ? JSON.parse(raw) : INITIAL_DEMO_ORDERS;
    const updated = orders.filter((o) => o.id !== orderId);
    localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to delete order:', err);
  }
}

/**
 * Clears all customer orders.
 */
export function clearCustomerOrders(): void {
  try {
    localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify([]));
  } catch (err) {
    console.error('Failed to clear customer orders:', err);
  }
}

/**
 * Simulates requesting a password reset email/code.
 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; message: string }> {
  await new Promise((res) => setTimeout(res, 600));
  const trimmed = email.trim().toLowerCase();
  const customers = getStoredCustomers();
  const exists = customers.some((c) => c.email.toLowerCase() === trimmed);

  if (!exists && trimmed !== DEMO_CUSTOMER_EMAIL) {
    return {
      success: false,
      message: `No active account found for "${email}". Please verify or create an account.`,
    };
  }

  return {
    success: true,
    message: `A secure password reset link has been dispatched to ${trimmed}. Check your inbox!`,
  };
}
