import React, { useState, useEffect } from 'react';
import { Product, CartItem, InventoryLog, ViewType } from './types';
import { INITIAL_PRODUCTS, INITIAL_INVENTORY_LOGS } from './data/products';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { CategoryGrid } from './components/CategoryGrid';
import { ProductCard } from './components/ProductCard';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { ProductModal } from './components/ProductModal';
import { AdminPortal } from './components/AdminPortal';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';
import { CustomerDashboard } from './components/CustomerDashboard';
import { TrustBanner } from './components/TrustBanner';
import { Footer } from './components/Footer';
import { RefreshCw, Sparkles } from 'lucide-react';

const STORAGE_PRODUCTS_KEY = 'freshcart_products_inr_v2';

const LEGACY_UNIT_MAP: Record<string, string> = {
  jug: '500 ml',
  carton: '1 dozen',
  lb: '1 kg',
  kg: '1 kg',
  loaf: '1 piece',
  btl: '1 litre',
  bag: '1 packet',
  tub: '500 g',
  ml: '500 ml',
  litre: '1 litre',
  dozen: '1 dozen',
  packet: '1 packet',
  piece: '1 piece',
  box: '1 box',
};

function FreshCartStore() {
  const { currentUser, isLoading, logout } = useAuth();
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const savedV2 = localStorage.getItem(STORAGE_PRODUCTS_KEY);
      if (savedV2) {
        return JSON.parse(savedV2);
      }
      const savedV1 = localStorage.getItem('freshcart_products_inr_v1');
      if (savedV1) {
        const parsed: Product[] = JSON.parse(savedV1);
        const migrated = parsed.map((p) => ({
          ...p,
          unit: LEGACY_UNIT_MAP[p.unit] || p.unit,
        }));
        // Ensure new example products (Rice, Sugar, Turmeric) are added if not present
        INITIAL_PRODUCTS.forEach((initP) => {
          if (!migrated.some((m) => m.id === initP.id)) {
            migrated.push(initP);
          }
        });
        return migrated;
      }
    } catch {
      // fallback
    }
    return INITIAL_PRODUCTS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_PRODUCTS_KEY, JSON.stringify(products));
  }, [products]);

  // Default to login when unauthenticated; storefront when authenticated
  const [currentView, setCurrentView] = useState<ViewType>('login');

  // Cart state: starts with no pre-seeded items (NO minimum product requirement)
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('freshcart_cart_v3');
      if (saved !== null) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('freshcart_cart_v3', JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

  // Keep cart items' product metadata (unit, price, title, stock) in sync with products
  useEffect(() => {
    setCart((prevCart) =>
      prevCart.map((item) => {
        const matchingProduct = products.find((p) => p.id === item.product.id);
        if (matchingProduct && (matchingProduct.unit !== item.product.unit || matchingProduct.price !== item.product.price)) {
          return { ...item, product: matchingProduct };
        }
        return item;
      })
    );
  }, [products]);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeModalProduct, setActiveModalProduct] = useState<Product | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'organic' | 'quickPrep'>('all');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>(INITIAL_INVENTORY_LOGS);

  // Synchronize URL Hash routing with currentView and enforce route protection
  useEffect(() => {
    if (isLoading) return;

    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();

      if (!currentUser) {
        // UNAUTHENTICATED USERS:
        // Only 'login', 'register', and 'admin' are permitted.
        // The main storefront and customer dashboard are strictly protected.
        if (hash === '#/admin' || hash === '#admin') {
          setCurrentView('admin');
        } else if (hash === '#/register' || hash === '#register') {
          setCurrentView('register');
        } else {
          // Default to login page on initial site visit or any protected page attempt
          setCurrentView('login');
          if (hash !== '#/login' && hash !== '#login') {
            window.location.hash = '#/login';
          }
        }
      } else {
        // AUTHENTICATED CUSTOMERS:
        if (hash === '#/admin' || hash === '#admin') {
          setCurrentView('admin');
        } else if (hash === '#/dashboard' || hash === '#dashboard') {
          setCurrentView('dashboard');
        } else if (hash === '#/login' || hash === '#/register' || hash === '#login' || hash === '#register') {
          // Already logged in: redirect to storefront
          setCurrentView('storefront');
          window.location.hash = '#/storefront';
        } else {
          // Default authenticated view is storefront homepage
          setCurrentView('storefront');
        }
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentUser, isLoading]);

  const navigateToView = (view: ViewType) => {
    // Route guard: if trying to open storefront or dashboard without auth, redirect to login
    if (!currentUser && (view === 'storefront' || view === 'dashboard')) {
      setCurrentView('login');
      window.location.hash = '#/login';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setCurrentView(view);
    if (view === 'admin') {
      setIsCartOpen(false);
      setIsCheckoutOpen(false);
    }
    if (view === 'storefront') {
      window.location.hash = '#/storefront';
    } else {
      window.location.hash = `#/${view}`;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cart Handlers
  const handleAddToCart = (product: Product, quantity: number) => {
    const currentProduct = products.find((p) => p.id === product.id) || product;
    if (currentProduct.stock <= 0) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === currentProduct.id);
      const currentQty = existing ? existing.quantity : 0;
      const maxCanAdd = Math.max(0, currentProduct.stock - currentQty);
      if (maxCanAdd <= 0) return prev;

      const toAdd = Math.min(quantity, maxCanAdd);
      if (existing) {
        return prev.map((item) =>
          item.product.id === currentProduct.id
            ? { ...item, quantity: item.quantity + toAdd }
            : item
        );
      }
      return [...prev, { product: currentProduct, quantity: toAdd }];
    });
  };

  const handleUpdateCartQty = (productId: string, delta: number) => {
    const currentProduct = products.find((p) => p.id === productId);

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const stockLimit = currentProduct ? currentProduct.stock : item.product.stock;
            const targetQty = item.quantity + delta;
            // If decreased to 0 or below, automatically remove that product from the cart
            if (targetQty <= 0) {
              return null;
            }
            // Cannot exceed available product quantity
            if (targetQty > stockLimit) {
              return { ...item, quantity: stockLimit };
            }
            return { ...item, quantity: targetQty };
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // When a customer purchases a product, reduce the available quantity accordingly
  const handleOrderPlaced = (purchasedItems: CartItem[]) => {
    setProducts((prev) =>
      prev.map((p) => {
        const purchased = purchasedItems.find((it) => it.product.id === p.id);
        if (purchased) {
          const newStock = Math.max(0, p.stock - purchased.quantity);
          return { ...p, stock: newStock };
        }
        return p;
      })
    );

    // Record CDC inventory audit log entries for the purchase
    purchasedItems.forEach((it) => {
      const remainingStock = Math.max(0, it.product.stock - it.quantity);
      const logEntry: InventoryLog = {
        id: `log-${Date.now()}-${it.product.id}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sku: it.product.sku,
        productTitle: it.product.title,
        changeType: 'SALE',
        quantityChange: -it.quantity,
        newStock: remainingStock,
        operator: 'Customer Checkout',
        notes: `Customer Order Purchase (${it.quantity} ${it.product.unit})`,
      };
      setInventoryLogs((prevLogs) => [logEntry, ...prevLogs]);
    });
  };

  // Inventory Updates (from Admin or simulated events)
  const handleUpdateProductStock = (productId: string, newStock: number, reason: string) => {
    const validStock = Math.max(0, newStock);
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const change = validStock - p.stock;
          const logEntry: InventoryLog = {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sku: p.sku,
            productTitle: p.title,
            changeType: change > 0 ? 'RESTOCK' : 'SALE',
            quantityChange: change,
            newStock: validStock,
            operator: 'Manager Override',
            notes: reason,
          };
          setInventoryLogs((prevLogs) => [logEntry, ...prevLogs]);
          return { ...p, stock: validStock };
        }
        return p;
      })
    );
  };

  const handleUpdateProductPrice = (productId: string, newPrice: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, price: newPrice } : p))
    );
  };

  const handleAddProduct = (newProduct: Product) => {
    setProducts((prev) => [newProduct, ...prev]);

    const logEntry: InventoryLog = {
      id: `log-${Date.now()}-${newProduct.id}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sku: newProduct.sku,
      productTitle: newProduct.title,
      changeType: 'RESTOCK',
      quantityChange: newProduct.stock,
      newStock: newProduct.stock,
      operator: 'Admin Portal',
      notes: `Added new product: ${newProduct.title} (₹${newProduct.price} / ${newProduct.unit})`,
    };
    setInventoryLogs((prevLogs) => [logEntry, ...prevLogs]);
  };

  const handleDeleteProduct = (productId: string) => {
    const productToDelete = products.find((p) => p.id === productId);
    if (productToDelete) {
      const logEntry: InventoryLog = {
        id: `log-${Date.now()}-${productId}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sku: productToDelete.sku,
        productTitle: productToDelete.title,
        changeType: 'SPOILAGE_DISPOSAL',
        quantityChange: -productToDelete.stock,
        newStock: 0,
        operator: 'Admin Portal',
        notes: `Removed product from store: ${productToDelete.title}`,
      };
      setInventoryLogs((prevLogs) => [logEntry, ...prevLogs]);
    }

    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
    if (activeModalProduct && activeModalProduct.id === productId) {
      setActiveModalProduct(null);
    }
  };

  const handleUpdateProductUnit = (productId: string, newUnit: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, unit: newUnit } : p))
    );

    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, product: { ...item.product, unit: newUnit } }
          : item
      )
    );

    if (activeModalProduct && activeModalProduct.id === productId) {
      setActiveModalProduct((prev) => (prev ? { ...prev, unit: newUnit } : null));
    }

    const targetProduct = products.find((p) => p.id === productId);
    if (targetProduct) {
      const logEntry: InventoryLog = {
        id: `log-${Date.now()}-${productId}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sku: targetProduct.sku,
        productTitle: targetProduct.title,
        changeType: 'AUDIT_ADJUSTMENT',
        quantityChange: 0,
        newStock: targetProduct.stock,
        operator: 'Admin Portal',
        notes: `Updated unit for ${targetProduct.title} to "${newUnit}"`,
      };
      setInventoryLogs((prevLogs) => [logEntry, ...prevLogs]);
    }
  };

  // Simulate real-time MongoDB CDC pulse
  const handleSimulateCdcPulse = () => {
    const candidate = products.find((p) => p.stock > 1);
    if (!candidate) return;

    handleUpdateProductStock(
      candidate.id,
      candidate.stock - 1,
      'Live Online Order #FC-' + Math.floor(1000 + Math.random() * 9000)
    );
  };

  // Product Filtering logic
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      searchQuery === '' ||
      product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === 'all' || product.category === selectedCategory;

    const matchesStockFilter =
      stockFilter === 'all' ||
      (stockFilter === 'organic' && product.isOrganic) ||
      (stockFilter === 'quickPrep' && product.isQuickPrep);

    return matchesSearch && matchesCategory && matchesStockFilter;
  });

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff]">
        <div className="flex flex-col items-center gap-3">
          <span className="w-8 h-8 border-3 border-[#006b2c]/30 border-t-[#006b2c] rounded-full animate-spin" />
          <span className="text-[13px] font-semibold text-[#565e74]">{t('loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9ff] text-[#0b1c30]">
      {/* Universal Header with View Navigation & Customer Authentication */}
      <Header
        currentView={currentView}
        onToggleView={(view) => navigateToView(view)}
        cartCount={cartCount}
        onOpenCart={() => setIsCartOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onSelectCategory={(cat) => {
          setSelectedCategory(cat);
          if (currentView !== 'storefront') {
            navigateToView('storefront');
          }
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 pt-24 sm:pt-28">
        {currentView === 'admin' ? (
          <AdminPortal
            products={products}
            inventoryLogs={inventoryLogs}
            onBackToStorefront={() => navigateToView(currentUser ? 'storefront' : 'login')}
            onUpdateProductStock={handleUpdateProductStock}
            onUpdateProductPrice={handleUpdateProductPrice}
            onUpdateProductUnit={handleUpdateProductUnit}
            onAddProduct={handleAddProduct}
            onDeleteProduct={handleDeleteProduct}
            onSimulateCdcPulse={handleSimulateCdcPulse}
          />
        ) : currentView === 'login' ? (
          <LoginPage
            onNavigateToRegister={() => navigateToView('register')}
            onLoginSuccess={() => navigateToView('storefront')}
            onNavigateToAdmin={() => navigateToView('admin')}
          />
        ) : currentView === 'register' ? (
          <RegisterPage
            onNavigateToLogin={() => navigateToView('login')}
            onRegisterSuccess={() => navigateToView('storefront')}
            onNavigateToAdmin={() => navigateToView('admin')}
          />
        ) : currentView === 'dashboard' ? (
          currentUser ? (
            <CustomerDashboard
              cart={cart}
              onOpenCart={() => setIsCartOpen(true)}
              onOpenCheckout={() => setIsCheckoutOpen(true)}
              onAddToCart={handleAddToCart}
              onUpdateQty={handleUpdateCartQty}
              onRemoveItem={handleRemoveCartItem}
              onBackToStorefront={() => navigateToView('storefront')}
              onLogout={() => {
                logout();
                navigateToView('login');
              }}
            />
          ) : (
            <LoginPage
              onNavigateToRegister={() => navigateToView('register')}
              onLoginSuccess={() => navigateToView('storefront')}
              onNavigateToAdmin={() => navigateToView('admin')}
            />
          )
        ) : currentUser ? (
          /* Main Grocery Storefront (Protected: only visible when successfully logged in) */
          <div className="flex flex-col w-full">
            {/* Hero Section */}
            <HeroSection
              onSearch={setSearchQuery}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              onApplyCoupon={(code) => setAppliedCoupon(code)}
              appliedCoupon={appliedCoupon}
            />

            {/* Curated Catalog Category Grid */}
            <CategoryGrid
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />

            {/* Featured Harvest & Daily Goods Section */}
            <section className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-6">
                <div>
                  <div className="flex items-center gap-1.5 text-[#006b2c] text-[11px] uppercase tracking-wider font-bold">
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('liveProduceHeader')}</span>
                  </div>
                  <h2 className="text-[26px] sm:text-[32px] text-[#0b1c30] font-bold font-display">
                    {t('featuredHarvestTitle')}
                  </h2>
                </div>

                {/* Filter Chips */}
                <div className="flex items-center gap-1 bg-[#eff4ff] p-1 rounded-xl border border-[#e2e8f0]/60">
                  <button
                    type="button"
                    onClick={() => setStockFilter('all')}
                    className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                      stockFilter === 'all'
                        ? 'bg-white text-[#0b1c30] shadow-xs'
                        : 'text-[#565e74] hover:text-[#0b1c30]'
                    }`}
                  >
                    {t('filterAllStock')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockFilter('organic')}
                    className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                      stockFilter === 'organic'
                        ? 'bg-white text-[#0b1c30] shadow-xs'
                        : 'text-[#565e74] hover:text-[#0b1c30]'
                    }`}
                  >
                    {t('filterOrganicOnly')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockFilter('quickPrep')}
                    className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                      stockFilter === 'quickPrep'
                        ? 'bg-white text-[#0b1c30] shadow-xs'
                        : 'text-[#565e74] hover:text-[#0b1c30]'
                    }`}
                  >
                    {t('filterQuickPrep')}
                  </button>
                </div>
              </div>

              {/* Products Grid */}
              {filteredProducts.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-[#e2e8f0] p-8">
                  <Sparkles className="w-10 h-10 text-[#006b2c] mx-auto mb-3 opacity-60" />
                  <h3 className="text-[18px] font-bold text-[#0b1c30]">
                    {t('noItemsFound')}
                  </h3>
                  <p className="text-[13px] text-[#565e74] mt-1 max-w-md mx-auto">
                    {t('tryClearingSearch', { query: searchQuery })}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                      setStockFilter('all');
                    }}
                    className="mt-4 px-4 py-2 bg-[#006b2c] text-white text-[12px] font-semibold rounded-lg hover:bg-[#00873a] transition-colors cursor-pointer"
                  >
                    {t('resetAllFilters')}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={handleAddToCart}
                      onOpenDetails={(p) => setActiveModalProduct(p)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Trust & Guarantee Banner */}
            <TrustBanner />

            {/* Footer */}
            <Footer
              onOpenAdmin={() => navigateToView('admin')}
              onSelectCategory={(cat) => {
                setSelectedCategory(cat);
                navigateToView('storefront');
              }}
              onOpenLogin={() => navigateToView(currentUser ? 'dashboard' : 'login')}
              onOpenDashboard={() => navigateToView('dashboard')}
            />
          </div>
        ) : (
          /* Fallback if unauthenticated and somehow on storefront view */
          <LoginPage
            onNavigateToRegister={() => navigateToView('register')}
            onLoginSuccess={() => navigateToView('storefront')}
            onNavigateToAdmin={() => navigateToView('admin')}
          />
        )}
      </main>

      {/* Floating Cart Drawer Toggle & Panel (Only available for customers; completely removed from Admin Portal) */}
      {currentUser && currentView !== 'admin' && (
        <CartDrawer
          items={cart}
          isOpen={isCartOpen}
          onToggle={() => setIsCartOpen(!isCartOpen)}
          onUpdateQty={handleUpdateCartQty}
          onRemoveItem={handleRemoveCartItem}
          onOpenCheckout={() => {
            setIsCartOpen(false);
            setIsCheckoutOpen(true);
          }}
          appliedCoupon={appliedCoupon}
          onApplyCoupon={(code) => setAppliedCoupon(code)}
          onRemoveCoupon={() => setAppliedCoupon(null)}
        />
      )}

      {/* Product Quick View Modal */}
      {currentUser && currentView !== 'admin' && (
        <ProductModal
          product={activeModalProduct}
          onClose={() => setActiveModalProduct(null)}
          onAddToCart={handleAddToCart}
        />
      )}

      {/* Express Checkout Modal (Completely removed from Admin Portal) */}
      {currentUser && currentView !== 'admin' && (
        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          items={cart}
          appliedCoupon={appliedCoupon}
          onClearCart={handleClearCart}
          onOrderPlaced={handleOrderPlaced}
          onNavigateToDashboard={() => navigateToView('dashboard')}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <FreshCartStore />
      </AuthProvider>
    </LanguageProvider>
  );
}
