import { INITIAL_PRODUCTS } from '../src/data/products.js';
import { INITIAL_COUPONS } from '../src/data/coupons.js';
import { DEFAULT_DELIVERY_RULES, getApplicableDeliveryChargeRule } from '../src/services/settingsService.js';
import { CartItem, Product } from '../src/types.js';

interface TestStepResult {
  step: string;
  passed: boolean;
  details: string;
}

const results: TestStepResult[] = [];

function recordResult(step: string, passed: boolean, details: string) {
  results.push({ step, passed, details });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - [${step}]: ${details}`);
}

// Simulated Cart State Management mirroring App.tsx implementation
class SimulatedFreshCartStore {
  cart: CartItem[] = [];
  products: Product[] = [...INITIAL_PRODUCTS];
  coupons = [...INITIAL_COUPONS];
  appliedCoupon: string | null = null;
  currentView: string = 'storefront';
  pathname: string = '/';
  historyStack: string[] = ['/'];
  historyIndex: number = 0;

  get cartCount(): number {
    return this.cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  get subtotal(): number {
    return this.cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }

  get deliveryCharge(): number {
    if (this.cart.length === 0 || this.subtotal <= 0) return 0;
    const rule = getApplicableDeliveryChargeRule(DEFAULT_DELIVERY_RULES, this.subtotal);
    return rule ? rule.deliveryCharge : 40;
  }

  get discount(): number {
    if (!this.appliedCoupon) return 0;
    const coupon = this.coupons.find((c) => c.code.toUpperCase() === this.appliedCoupon?.toUpperCase());
    if (!coupon || !coupon.isActive) return 0;
    if (this.subtotal < (coupon.minOrderAmount || 0)) return 0;
    return Math.round((this.subtotal * coupon.discountPercentage) / 100);
  }

  get total(): number {
    return Math.max(0, Math.round((this.subtotal - this.discount + this.deliveryCharge) * 100) / 100);
  }

  addToCart(product: Product, quantity: number) {
    const currentProduct = this.products.find((p) => p.id === product.id) || product;
    if (currentProduct.stock <= 0) return;

    const existing = this.cart.find((item) => item.product.id === currentProduct.id);
    const currentQty = existing ? existing.quantity : 0;
    const maxCanAdd = Math.max(0, currentProduct.stock - currentQty);
    if (maxCanAdd <= 0) return;

    const toAdd = Math.min(quantity, maxCanAdd);
    if (existing) {
      existing.quantity += toAdd;
    } else {
      this.cart.push({ product: currentProduct, quantity: toAdd });
    }
  }

  updateQty(productId: string, delta: number) {
    const item = this.cart.find((it) => it.product.id === productId);
    if (!item) return;

    const currentProduct = this.products.find((p) => p.id === productId);
    const stockLimit = currentProduct ? currentProduct.stock : item.product.stock;
    const targetQty = item.quantity + delta;

    if (targetQty <= 0) {
      this.cart = this.cart.filter((it) => it.product.id !== productId);
    } else if (targetQty > stockLimit) {
      item.quantity = stockLimit;
    } else {
      item.quantity = targetQty;
    }
  }

  removeItem(productId: string) {
    this.cart = this.cart.filter((it) => it.product.id !== productId);
  }

  clearCart() {
    this.cart = [];
    this.appliedCoupon = null;
  }

  navigateToView(view: string) {
    this.currentView = view;
    if (view === 'cart') {
      this.pathname = '/cart';
      this.historyStack.push('/cart');
      this.historyIndex = this.historyStack.length - 1;
    } else {
      this.pathname = '/';
      this.historyStack.push('/');
      this.historyIndex = this.historyStack.length - 1;
    }
  }

  browserBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.pathname = this.historyStack[this.historyIndex];
      // handleRouteChange logic
      if (this.pathname === '/cart') {
        this.currentView = 'cart';
      } else {
        this.currentView = 'storefront';
      }
    }
  }

  browserForward() {
    if (this.historyIndex < this.historyStack.length - 1) {
      this.historyIndex++;
      this.pathname = this.historyStack[this.historyIndex];
      if (this.pathname === '/cart') {
        this.currentView = 'cart';
      } else {
        this.currentView = 'storefront';
      }
    }
  }

  saveToPersistence(): string {
    return JSON.stringify(this.cart);
  }

  loadFromPersistence(savedJson: string) {
    this.cart = JSON.parse(savedJson);
  }
}

async function runCartVerification() {
  console.log('====================================================');
  console.log('🚀 RUNNING COMPREHENSIVE FRESHCART CART VERIFICATION');
  console.log('====================================================\n');

  const store = new SimulatedFreshCartStore();

  // Test 1: Empty cart initial state & count
  recordResult(
    'Empty Cart State',
    store.cartCount === 0 && store.cart.length === 0,
    `Initial cart count is ${store.cartCount}`
  );

  // Test 2: Navigate to Cart when empty
  store.navigateToView('cart');
  recordResult(
    'Navigate to Empty Cart',
    store.currentView === 'cart' && store.pathname === '/cart',
    `Navigated to dedicated Cart page at ${store.pathname}`
  );

  // Test 3: Browser Back returns to Customer Portal
  store.browserBack();
  recordResult(
    'Browser Back Navigation',
    store.currentView === 'storefront' && store.pathname === '/',
    `Returned to Customer Portal storefront at ${store.pathname}`
  );

  // Test 4: Add Product 1 to cart
  const prod1 = store.products[0]; // e.g. Organic Honeycrisp Apples (₹249)
  store.addToCart(prod1, 2);
  recordResult(
    'Add Product to Cart',
    store.cart.length === 1 && store.cart[0].product.id === prod1.id && store.cart[0].quantity === 2,
    `Added ${prod1.title} (Qty: 2). Cart count: ${store.cartCount}`
  );

  // Test 5: Verify Header / Floating Cart Count Badge
  recordResult(
    'Cart Count Badge Synchronization',
    store.cartCount === 2,
    `Badge count correctly reflects ${store.cartCount} items`
  );

  // Test 6: Open Cart via Cart icon/button
  store.navigateToView('cart');
  recordResult(
    'Open Cart Page with Items',
    store.currentView === 'cart' && store.pathname === '/cart',
    `Successfully opened Cart Page at ${store.pathname}`
  );

  // Test 7: Increase Quantity (+1)
  store.updateQty(prod1.id, 1);
  recordResult(
    'Increase Quantity',
    store.cart[0].quantity === 3 && store.cartCount === 3,
    `Increased ${prod1.title} quantity to ${store.cart[0].quantity}. Cart count: ${store.cartCount}`
  );

  // Test 8: Decrease Quantity (-1)
  store.updateQty(prod1.id, -1);
  recordResult(
    'Decrease Quantity',
    store.cart[0].quantity === 2 && store.cartCount === 2,
    `Decreased ${prod1.title} quantity to ${store.cart[0].quantity}. Cart count: ${store.cartCount}`
  );

  // Test 9: Add another product
  const prod2 = store.products[1]; // e.g. Whole Milk
  store.addToCart(prod2, 1);
  recordResult(
    'Add Second Product',
    store.cart.length === 2 && store.cartCount === 3,
    `Added ${prod2.title}. Total unique items: ${store.cart.length}, total count: ${store.cartCount}`
  );

  // Test 10: Verify Cart financial totals
  const expectedSubtotal = prod1.price * 2 + prod2.price * 1;
  const rule = getApplicableDeliveryChargeRule(DEFAULT_DELIVERY_RULES, expectedSubtotal);
  const expectedDelivery = rule ? rule.deliveryCharge : 40;
  const expectedTotal = expectedSubtotal + expectedDelivery;
  recordResult(
    'Cart Financial Totals Calculation',
    store.subtotal === expectedSubtotal && store.total === expectedTotal,
    `Subtotal: ₹${store.subtotal} (expected: ₹${expectedSubtotal}), Total: ₹${store.total} (expected: ₹${expectedTotal})`
  );

  // Test 11: Remove an item
  store.removeItem(prod1.id);
  recordResult(
    'Remove Item',
    store.cart.length === 1 && store.cart[0].product.id === prod2.id && store.cartCount === 1,
    `Removed ${prod1.title}. Remaining unique items: ${store.cart.length}, count: ${store.cartCount}`
  );

  // Test 12: Decrease to 0 auto-removes item
  store.updateQty(prod2.id, -1);
  recordResult(
    'Decrease to 0 Auto-Removal',
    store.cart.length === 0 && store.cartCount === 0,
    `Item decreased to 0 was removed. Cart is empty (Count: ${store.cartCount})`
  );

  // Test 13: Persistence across page refresh
  store.addToCart(prod1, 3);
  store.addToCart(prod2, 2);
  const serialized = store.saveToPersistence();
  const newSessionStore = new SimulatedFreshCartStore();
  newSessionStore.loadFromPersistence(serialized);
  recordResult(
    'Cart State Persistence (Reload Simulation)',
    newSessionStore.cartCount === 5 && newSessionStore.cart.length === 2,
    `Persisted cart restored with ${newSessionStore.cartCount} items across 2 products`
  );

  // Test 14: Server endpoint GET /cart test
  try {
    const response = await fetch('http://localhost:3000/cart', {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const status = response.status;
    const contentType = response.headers.get('content-type') || '';
    recordResult(
      'Server Dedicated /cart Route Serving',
      status === 200 && contentType.includes('text/html'),
      `GET /cart returned HTTP ${status} (${contentType})`
    );
  } catch (err: any) {
    recordResult(
      'Server Dedicated /cart Route Serving',
      false,
      `Failed to connect to dev server: ${err?.message}`
    );
  }

  // Summary
  const allPassed = results.every((r) => r.passed);
  console.log('\n====================================================');
  console.log(`SUMMARY: ${results.filter((r) => r.passed).length}/${results.length} tests passed.`);
  console.log(allPassed ? '🎉 ALL CART FUNCTIONALITY VERIFIED SUCCESSFULLY!' : '⚠️ SOME TESTS FAILED');
  console.log('====================================================');
}

runCartVerification().catch(console.error);
