import React, { useState } from 'react';
import { Product, CartItem, InventoryLog } from './types';
import { INITIAL_PRODUCTS, INITIAL_INVENTORY_LOGS } from './data/products';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { CategoryGrid } from './components/CategoryGrid';
import { ProductCard } from './components/ProductCard';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { ProductModal } from './components/ProductModal';
import { AdminPortal } from './components/AdminPortal';
import { TrustBanner } from './components/TrustBanner';
import { Footer } from './components/Footer';
import { RefreshCw, Sparkles } from 'lucide-react';

export default function App() {
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [currentView, setCurrentView] = useState<'storefront' | 'admin'>('storefront');

  // Initial cart with 3 items matching the design mockup:
  const [cart, setCart] = useState<CartItem[]>([
    {
      product: INITIAL_PRODUCTS[2], // Crisp Honeycrisp Apples ($2.49)
      quantity: 1,
    },
    {
      product: INITIAL_PRODUCTS[1], // Grade-A Whole Milk ($3.99)
      quantity: 1,
    },
    {
      product: INITIAL_PRODUCTS[5], // Organic Hass Avocados ($4.99) or Bananas ($1.89)
      quantity: 1,
    },
  ]);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeModalProduct, setActiveModalProduct] = useState<Product | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'organic' | 'quickPrep'>('all');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>(INITIAL_INVENTORY_LOGS);

  // Cart Handlers
  const handleAddToCart = (product: Product, quantity: number) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
  };

  const handleUpdateCartQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
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

  // Inventory Updates (from Admin or simulated events)
  const handleUpdateProductStock = (productId: string, newStock: number, reason: string) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const change = newStock - p.stock;
          const logEntry: InventoryLog = {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            sku: p.sku,
            productTitle: p.title,
            changeType: change > 0 ? 'RESTOCK' : 'SALE',
            quantityChange: change,
            newStock,
            operator: 'Manager Override',
            notes: reason,
          };
          setInventoryLogs((prevLogs) => [logEntry, ...prevLogs]);
          return { ...p, stock: Math.max(0, newStock) };
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

  // Simulate real-time MongoDB CDC pulse (e.g., online customer order decrements inventory)
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

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9ff] text-[#0b1c30]">
      {/* Header */}
      <Header
        currentView={currentView}
        onToggleView={setCurrentView}
        cartCount={cartCount}
        onOpenCart={() => setIsCartOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      {/* Main Content Area */}
      <main className="flex-1 pt-24 sm:pt-28">
        {currentView === 'admin' ? (
          <AdminPortal
            products={products}
            inventoryLogs={inventoryLogs}
            onBackToStorefront={() => setCurrentView('storefront')}
            onUpdateProductStock={handleUpdateProductStock}
            onUpdateProductPrice={handleUpdateProductPrice}
            onSimulateCdcPulse={handleSimulateCdcPulse}
          />
        ) : (
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
                    <span>Live Synchronized Produce &amp; Staples</span>
                  </div>
                  <h2 className="text-[26px] sm:text-[32px] text-[#0b1c30] font-bold font-display">
                    Featured Harvest &amp; Daily Goods
                  </h2>
                </div>

                {/* Filter Chips */}
                <div className="flex items-center gap-1 bg-[#eff4ff] p-1 rounded-xl border border-[#e2e8f0]/60">
                  <button
                    type="button"
                    onClick={() => setStockFilter('all')}
                    className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all ${
                      stockFilter === 'all'
                        ? 'bg-white text-[#0b1c30] shadow-xs'
                        : 'text-[#565e74] hover:text-[#0b1c30]'
                    }`}
                  >
                    All Live Stock
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockFilter('organic')}
                    className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all ${
                      stockFilter === 'organic'
                        ? 'bg-white text-[#0b1c30] shadow-xs'
                        : 'text-[#565e74] hover:text-[#0b1c30]'
                    }`}
                  >
                    Organic Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockFilter('quickPrep')}
                    className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all ${
                      stockFilter === 'quickPrep'
                        ? 'bg-white text-[#0b1c30] shadow-xs'
                        : 'text-[#565e74] hover:text-[#0b1c30]'
                    }`}
                  >
                    Quick Meal Prep
                  </button>
                </div>
              </div>

              {/* Products Grid */}
              {filteredProducts.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-[#e2e8f0] p-8">
                  <Sparkles className="w-10 h-10 text-[#006b2c] mx-auto mb-3 opacity-60" />
                  <h3 className="text-[18px] font-bold text-[#0b1c30]">
                    No items found matching your filter
                  </h3>
                  <p className="text-[13px] text-[#565e74] mt-1 max-w-md mx-auto">
                    Try clearing the search &quot;{searchQuery}&quot; or resetting the category selection.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                      setStockFilter('all');
                    }}
                    className="mt-4 px-4 py-2 bg-[#006b2c] text-white text-[12px] font-semibold rounded-lg hover:bg-[#00873a] transition-colors"
                  >
                    Reset All Filters
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
              onOpenAdmin={() => setCurrentView('admin')}
              onSelectCategory={setSelectedCategory}
            />
          </div>
        )}
      </main>

      {/* Floating Cart Drawer Toggle & Panel */}
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

      {/* Product Quick View Modal */}
      <ProductModal
        product={activeModalProduct}
        onClose={() => setActiveModalProduct(null)}
        onAddToCart={handleAddToCart}
      />

      {/* Express Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cart}
        appliedCoupon={appliedCoupon}
        onClearCart={handleClearCart}
      />
    </div>
  );
}
