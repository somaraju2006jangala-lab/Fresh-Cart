import React from 'react';
import { Product } from '../types';
import { ProductCard } from './ProductCard';
import { TrustBanner } from './TrustBanner';
import { Footer } from './Footer';
import { AISLE_CATEGORIES } from '../data/products';
import {
  ArrowLeft,
  Apple,
  Milk,
  Croissant,
  Coffee,
  Cookie,
  Wheat,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface CategoryResultsPageProps {
  selectedCategory: string;
  products: Product[];
  onAddToCart: (product: Product, quantity: number) => void;
  onOpenDetails: (product: Product) => void;
  onBackToStorefront: () => void;
  onSelectCategory: (category: string) => void;
  onOpenAdmin: () => void;
  onOpenLogin: () => void;
  onOpenDashboard: () => void;
}

export const CategoryResultsPage: React.FC<CategoryResultsPageProps> = ({
  selectedCategory,
  products,
  onAddToCart,
  onOpenDetails,
  onBackToStorefront,
  onSelectCategory,
  onOpenAdmin,
  onOpenLogin,
  onOpenDashboard,
}) => {
  const { t } = useLanguage();

  // Normalize category ID
  const getNormalizedId = (cat: string): string => {
    const lower = (cat || '').trim().toLowerCase();
    if (lower === 'produce' || lower.includes('fruit') || lower.includes('veg')) return 'produce';
    if (lower === 'dairy' || lower.includes('egg')) return 'dairy';
    if (lower === 'bakery' || lower.includes('bread')) return 'bakery';
    if (lower === 'beverages' || lower === 'beverage' || lower.includes('drink')) return 'beverages';
    if (lower === 'snacks' || lower === 'snack') return 'snacks';
    if (lower === 'grains' || lower === 'grain' || lower.includes('rice')) return 'grains';
    return lower;
  };

  const currentNormId = getNormalizedId(selectedCategory);

  const getCategoryTitle = (id: string): string => {
    switch (id) {
      case 'produce':
        return 'Produce & Fruit';
      case 'dairy':
        return 'Dairy & Eggs';
      case 'bakery':
        return 'Bakery';
      case 'beverages':
        return 'Beverages';
      case 'snacks':
        return 'Snacks';
      case 'grains':
        return 'Rice & Grains';
      default: {
        const found = AISLE_CATEGORIES.find((c) => c.id.toLowerCase() === id.toLowerCase());
        return found ? found.name : selectedCategory || 'Category';
      }
    }
  };

  const getCategoryIcon = (id: string) => {
    switch (id) {
      case 'produce':
        return <Apple className="w-6 h-6 text-[#006b2c]" />;
      case 'dairy':
        return <Milk className="w-6 h-6 text-[#006b2c]" />;
      case 'bakery':
        return <Croissant className="w-6 h-6 text-[#006b2c]" />;
      case 'beverages':
        return <Coffee className="w-6 h-6 text-[#006b2c]" />;
      case 'snacks':
        return <Cookie className="w-6 h-6 text-[#006b2c]" />;
      case 'grains':
        return <Wheat className="w-6 h-6 text-[#006b2c]" />;
      default:
        return <LayoutGrid className="w-6 h-6 text-[#006b2c]" />;
    }
  };

  // Filter products belonging to this category
  const categoryProducts = products.filter((product) => {
    if (!selectedCategory || selectedCategory === 'all') return true;

    const prodNorm = getNormalizedId(product.category);
    if (prodNorm === currentNormId) return true;

    const catLower = (product.category || '').toLowerCase();
    const labelLower = (product.categoryLabel || '').toLowerCase();
    const queryLower = selectedCategory.toLowerCase();

    return (
      catLower === queryLower ||
      labelLower.includes(queryLower) ||
      (currentNormId && catLower.includes(currentNormId))
    );
  });

  const categoryName = getCategoryTitle(currentNormId);

  return (
    <div className="flex flex-col w-full min-h-[calc(100vh-6rem)]">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto flex-1">
        {/* Navigation Breadcrumb Bar */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            id="category-back-btn"
            onClick={onBackToStorefront}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#006b2c] hover:text-[#00873a] transition-colors cursor-pointer group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to Store</span>
          </button>

          <button
            type="button"
            id="category-return-home-btn"
            onClick={onBackToStorefront}
            className="px-3.5 py-1.5 bg-white text-[#006b2c] border border-[#cbd5e1] text-[12px] font-semibold rounded-lg hover:bg-[#eff4ff] transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Storefront</span>
          </button>
        </div>

        {/* Selected Category Header Banner */}
        <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6 shadow-xs mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-[#eff4ff] flex items-center justify-center shrink-0 shadow-xs border border-[#dce9ff]">
                {getCategoryIcon(currentNormId)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#006b2c]">
                    Product Category
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#eff4ff] text-[#006b2c] text-[11px] font-bold">
                    {categoryProducts.length} {categoryProducts.length === 1 ? 'Product' : 'Products'}
                  </span>
                </div>
                <h1
                  id="category-results-title"
                  className="text-[26px] sm:text-[32px] font-bold text-[#0b1c30] font-display leading-tight"
                >
                  {categoryName}
                </h1>
                <p className="text-[13px] text-[#565e74] mt-0.5">
                  Fresh farm groceries and curated products in <span className="font-semibold text-[#0b1c30]">{categoryName}</span>
                </p>
              </div>
            </div>

            {/* Quick Category Switcher Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onBackToStorefront()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#eff4ff] text-[#3e4a3d] hover:bg-[#e5eeff] transition-all cursor-pointer"
              >
                All Aisles
              </button>
              {AISLE_CATEGORIES.map((cat) => {
                const isActive = getNormalizedId(cat.id) === currentNormId;
                return (
                  <button
                    key={cat.id}
                    id={`category-switch-${cat.id}`}
                    type="button"
                    onClick={() => onSelectCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#006b2c] text-white shadow-xs'
                        : 'bg-[#eff4ff] text-[#3e4a3d] hover:bg-[#e5eeff]'
                    }`}
                  >
                    {getCategoryTitle(cat.id)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Product Catalog Grid for Category */}
        {categoryProducts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-[#e2e8f0] p-8 max-w-xl mx-auto shadow-xs my-8">
            <Sparkles className="w-10 h-10 text-[#006b2c] mx-auto mb-3 opacity-60" />
            <h2 className="text-[20px] font-bold text-[#0b1c30] mb-2 font-display">
              No products found in {categoryName}
            </h2>
            <p className="text-[14px] text-[#565e74] max-w-md mx-auto mb-6">
              There are currently no products available under this category. Explore other fresh aisles.
            </p>
            <button
              type="button"
              onClick={onBackToStorefront}
              className="px-5 py-2.5 bg-[#006b2c] text-white text-[13px] font-semibold rounded-xl hover:bg-[#00873a] transition-all shadow-xs cursor-pointer inline-flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Store</span>
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {categoryProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={onAddToCart}
                  onOpenDetails={onOpenDetails}
                />
              ))}
            </div>

            <div className="flex justify-center pt-6 pb-2">
              <button
                type="button"
                id="category-bottom-back-btn"
                onClick={onBackToStorefront}
                className="px-5 py-2.5 bg-white text-[#006b2c] border border-[#cbd5e1] text-[13px] font-semibold rounded-xl hover:bg-[#eff4ff] transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Store / All Aisles</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Trust & Guarantee Banner */}
      <TrustBanner />

      {/* Footer */}
      <Footer
        onOpenAdmin={onOpenAdmin}
        onSelectCategory={onSelectCategory}
        onOpenLogin={onOpenLogin}
        onOpenDashboard={onOpenDashboard}
      />
    </div>
  );
};
