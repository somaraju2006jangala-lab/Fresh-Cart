import { Customer, CustomerAddress, CustomerOrder } from '../types';
import { INITIAL_PRODUCTS } from '../data/products';

const STORAGE_CUSTOMERS_KEY = 'freshcart_registered_customers';
const STORAGE_CURRENT_USER_KEY = 'freshcart_active_customer_session';
const STORAGE_CUSTOMER_ORDERS_KEY = 'freshcart_customer_orders_inr_v1';

// Demo customer credentials
export const DEMO_CUSTOMER_EMAIL = 'customer@freshcart.com';
export const DEMO_CUSTOMER_PASSWORD = 'FreshCart2026!';

/**
 * Securely hashes a password using the browser's native Web Crypto API (SHA-256) + salt.
 * Ensures passwords are NEVER stored in plain text anywhere in application state or storage.
 * When connecting to a real backend, password hashing should occur server-side with bcrypt/Argon2.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateSalt(length = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Initial seed orders for demo customers
const INITIAL_DEMO_ORDERS: CustomerOrder[] = [
  {
    id: '#1001',
    customerId: 'rahul123',
    customerName: 'Rahul',
    customerEmail: 'rahul@example.com',
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
    status: 'Ordered',
    createdAt: '2026-09-23T10:42:00.000Z',
    paymentMethod: 'Cash on Delivery',
  },
  {
    id: '#FC-94821',
    customerId: 'cust-demo-1',
    customerName: 'Alex Morgan',
    customerEmail: DEMO_CUSTOMER_EMAIL,
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
    status: 'Ordered',
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

      localStorage.setItem(STORAGE_CUSTOMERS_KEY, JSON.stringify([demoCustomer]));
    }

    const existingOrders = localStorage.getItem(STORAGE_CUSTOMER_ORDERS_KEY);
    if (!existingOrders) {
      localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(INITIAL_DEMO_ORDERS));
    } else {
      try {
        const parsed: CustomerOrder[] = JSON.parse(existingOrders);
        if (!parsed.some((o) => o.id === '#1001' || o.id === '1001')) {
          parsed.unshift(INITIAL_DEMO_ORDERS[0]);
          localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(parsed));
        }
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
function getStoredCustomers(): Customer[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save customer list to storage.
 */
function saveStoredCustomers(customers: Customer[]): void {
  localStorage.setItem(STORAGE_CUSTOMERS_KEY, JSON.stringify(customers));
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
  const customers = getStoredCustomers();

  const customer = customers.find(
    (c) => c.email.toLowerCase() === trimmedIdentifier
  );

  if (!customer) {
    return {
      success: false,
      error: 'No customer account found with this email or User ID. Please check your spelling or create an account.',
    };
  }

  const computedHash = await hashPassword(plainPassword, customer.passwordSalt);
  if (computedHash !== customer.passwordHash) {
    return {
      success: false,
      error: 'Incorrect password entered. Please try again or click "Forgot Password?".',
    };
  }

  // Create sanitized session (do not store hash/salt in session)
  const sessionUser: Customer = {
    ...customer,
    passwordHash: '',
    passwordSalt: '',
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
 * Registers a new customer.
 * Hashes password using SHA-256 + cryptographic salt before persisting.
 *
 * NOTE: When connecting a real backend, replace this with:
 * const response = await fetch('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
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

  const customers = getStoredCustomers();
  const alreadyExists = customers.some(
    (c) => c.email.toLowerCase() === trimmedEmail
  );

  if (alreadyExists) {
    return {
      success: false,
      error: 'An account with this email already exists. Please log in or use another email.',
    };
  }

  const salt = generateSalt();
  const hash = await hashPassword(payload.password, salt);

  const newId = `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const defaultAddress: CustomerAddress = {
    id: `addr-${Date.now()}`,
    label: 'Primary Delivery',
    street: payload.address || 'Address on file',
    city: 'Springfield',
    state: 'OR',
    zip: '97477',
    isDefault: true,
  };

  const newCustomer: Customer = {
    id: newId,
    name: trimmedName,
    email: trimmedEmail,
    phone: payload.phone || '',
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

  // Auto-login new registered customer
  const sessionUser: Customer = {
    ...newCustomer,
    passwordHash: '',
    passwordSalt: '',
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
    return raw ? JSON.parse(raw) : null;
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
 * Retrieves orders for a specific customer.
 */
export function getCustomerOrders(customerId?: string): CustomerOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMER_ORDERS_KEY);
    const orders: CustomerOrder[] = raw ? JSON.parse(raw) : INITIAL_DEMO_ORDERS;
    if (!customerId) return orders;
    return orders.filter((o) => !o.customerId || o.customerId === customerId);
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
  } catch (err) {
    console.error('Failed to record customer order:', err);
  }
}

/**
 * Updates the status of an existing customer order.
 */
export function updateOrderStatus(orderId: string, newStatus: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOMER_ORDERS_KEY);
    const orders: CustomerOrder[] = raw ? JSON.parse(raw) : INITIAL_DEMO_ORDERS;
    const updated = orders.map((o) => (o.id === orderId ? { ...o, status: newStatus as any } : o));
    localStorage.setItem(STORAGE_CUSTOMER_ORDERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to update order status:', err);
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
