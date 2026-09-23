import React from 'react';
import { Product } from '../types';
import { ProductCard } from './ProductCard';
import { TrustBanner } from './TrustBanner';
import { Footer } from './Footer';
import { Search, ArrowLeft, Sparkles, PackageSearch } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface SearchResultsPageProps {
  searchQuery: string;
  products: Product[];
  onAddToCart: (product: Product, quantity: number) => void;
  onOpenDetails: (product: Product) => void;
  onBackToStorefront: () => void;
  onOpenAdmin: () => void;
  onSelectCategory: (category: string) => void;
  onOpenLogin: () => void;
  onOpenDashboard: () => void;
}

export const SearchResultsPage: React.FC<SearchResultsPageProps> = ({
  searchQuery,
  products,
  onAddToCart,
  onOpenDetails,
  onBackToStorefront,
  onOpenAdmin,
  onSelectCategory,
  onOpenLogin,
  onOpenDashboard,
}) => {
  const { t } = useLanguage();
  const normalizedQuery = searchQuery.trim().toLowerCase();

  // Search by product name (supports exact and partial names, e.g., "mil" -> "Milk")
  const matchingProducts = products.filter((product) => {
    if (!normalizedQuery) return false;
    const titleLower = product.title.toLowerCase();

    // Partial substring match
    if (titleLower.includes(normalizedQuery)) {
      return true;
    }

    // Multiple space-separated keywords match
    const words = normalizedQuery.split(/\s+/).filter(Boolean);
    if (words.length > 1 && words.every((word) => titleLower.includes(word))) {
      return true;
    }

    return false;
  });

  return (
    <div className="flex flex-col w-full min-h-[calc(100vh-6rem)]">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto flex-1">
        {/* Navigation & Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#e2e8f0]">
          <div>
            <button
              type="button"
              id="search-back-btn"
              onClick={onBackToStorefront}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#006b2c] hover:text-[#00873a] transition-colors mb-2 cursor-pointer group"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              <span>{t('backToStorefrontBtn')}</span>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#006b2c]">
                <Search className="w-4 h-4" />
              </div>
              <h1 className="text-[24px] sm:text-[30px] font-bold text-[#0b1c30] font-display">
                Search Results
              </h1>
            </div>
            {searchQuery && (
              <p className="text-[14px] text-[#565e74] mt-1">
                Showing results for <span className="font-semibold text-[#0b1c30]">"{searchQuery}"</span>
                {matchingProducts.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-[#eff4ff] text-[#006b2c] text-[12px] font-semibold">
                    {matchingProducts.length} {matchingProducts.length === 1 ? 'item' : 'items'}
                  </span>
                )}
              </p>
            )}
          </div>

          <button
            type="button"
            id="return-to-storefront-top-btn"
            onClick={onBackToStorefront}
            className="self-start sm:self-auto px-4 py-2 bg-white text-[#006b2c] border border-[#cbd5e1] text-[12px] font-semibold rounded-lg hover:bg-[#eff4ff] transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Storefront</span>
          </button>
        </div>

        {/* Results Container */}
        {matchingProducts.length === 0 ? (
          /* Empty State: Display "No products found" */
          <div className="text-center py-16 bg-white rounded-2xl border border-[#e2e8f0] p-8 max-w-xl mx-auto shadow-xs my-8">
            <div className="w-16 h-16 rounded-full bg-[#f8f9ff] flex items-center justify-center mx-auto mb-4 text-[#565e74]">
              <PackageSearch className="w-8 h-8 text-[#006b2c]" />
            </div>
            <h2 id="no-products-found-message" className="text-[22px] font-bold text-[#0b1c30] mb-2 font-display">
              No products found
            </h2>
            <p className="text-[14px] text-[#565e74] max-w-md mx-auto mb-6">
              {searchQuery
                ? `No products matching "${searchQuery}" were found in our catalog.`
                : 'Please enter a product name in the search bar to find fresh groceries.'}
            </p>
            <button
              type="button"
              id="return-to-storefront-empty-btn"
              onClick={onBackToStorefront}
              className="px-5 py-2.5 bg-[#006b2c] text-white text-[13px] font-semibold rounded-xl hover:bg-[#00873a] transition-all shadow-xs cursor-pointer inline-flex items-center gap-2 active:scale-98"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Storefront</span>
            </button>
          </div>
        ) : (
          /* Matching Products Grid */
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {matchingProducts.map((product) => (
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
                id="return-to-storefront-bottom-btn"
                onClick={onBackToStorefront}
                className="px-5 py-2 bg-white text-[#006b2c] border border-[#cbd5e1] text-[13px] font-semibold rounded-xl hover:bg-[#eff4ff] transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Storefront</span>
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
