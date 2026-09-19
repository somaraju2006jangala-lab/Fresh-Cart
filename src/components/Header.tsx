import React, { useState } from 'react';
import {
  BRAND_LOGO_URL,
  USER_AVATAR_URL,
  AISLE_CATEGORIES,
} from '../data/products';
import {
  Navigation,
  Search,
  ShieldCheck,
  ShoppingCart,
  Store,
  X,
  MapPin,
  ChevronDown,
} from 'lucide-react';

interface HeaderProps {
  currentView: 'storefront' | 'admin';
  onToggleView: (view: 'storefront' | 'admin') => void;
  cartCount: number;
  onOpenCart: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onToggleView,
  cartCount,
  onOpenCart,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onSelectCategory,
}) => {
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [currentLocation, setCurrentLocation] = useState('Downtown Supercenter · 30m');
  const [isLocationSaving, setIsLocationSaving] = useState(false);

  const locations = [
    { name: 'Downtown Supercenter · 30m', address: '452 Grand Ave, Floor 1' },
    { name: 'Midtown Express Hub · 20m', address: '128 5th Ave, Pod #102' },
    { name: 'Suburban Distribution Center · 45m', address: '880 Silicon Blvd' },
  ];

  const handleSelectLocation = (loc: string) => {
    setIsLocationSaving(true);
    setTimeout(() => {
      setCurrentLocation(loc);
      setIsLocationSaving(false);
      setShowLocationModal(false);
    }, 250);
  };

  return (
    <header className="fixed top-0 left-0 w-full z-40 bg-[#f8f9ff]/95 backdrop-blur-xl border-b border-[#e5eeff] shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col justify-between">
        {/* Top Tier */}
        <div className="flex items-center justify-between gap-3 sm:gap-6">
          {/* Brand Logo & View Tag */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => onToggleView('storefront')}
              className="flex items-center gap-2 text-left focus:outline-hidden group"
              id="brand-logo-btn"
            >
              <img
                src={BRAND_LOGO_URL}
                alt="FreshCart Brand Logo"
                className="h-8 w-auto object-contain transition-transform group-hover:scale-105"
              />
              <span className="text-[20px] font-extrabold tracking-tight text-[#006b2c] font-display">
                FreshCart
              </span>
            </button>
            <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-[#e5eeff] text-[#565e74] text-[11px] font-semibold tracking-wide">
              {currentView === 'storefront' ? 'Retail Storefront' : 'Ops Portal'}
            </span>
          </div>

          {/* Delivering To Hub Picker */}
          <div className="relative hidden md:flex items-center">
            <button
              id="delivery-hub-picker"
              type="button"
              onClick={() => setShowLocationModal(!showLocationModal)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#eff4ff] hover:bg-[#e5eeff] transition-colors text-left border border-[#e2e8f0]/60"
            >
              <Navigation className="w-4 h-4 text-[#006b2c] shrink-0" />
              <div className="flex flex-col text-left">
                <span className="text-[11px] text-[#3e4a3d] leading-tight">Delivering to</span>
                <span className="text-[12px] text-[#0b1c30] font-semibold truncate max-w-[190px] leading-tight flex items-center gap-1">
                  {currentLocation}
                  <ChevronDown className="w-3 h-3 text-[#565e74]" />
                </span>
              </div>
            </button>

            {showLocationModal && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-[#e2e8f0] p-3 z-50">
                <div className="flex items-center justify-between pb-2 border-b border-[#e2e8f0]">
                  <span className="text-[12px] font-bold text-[#0b1c30]">Select Delivery Hub</span>
                  <button
                    onClick={() => setShowLocationModal(false)}
                    className="text-[#565e74] hover:text-[#0b1c30]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1.5 mt-2">
                  {locations.map((loc) => (
                    <button
                      key={loc.name}
                      onClick={() => handleSelectLocation(loc.name)}
                      className={`w-full text-left p-2 rounded-lg text-[12px] transition-colors flex items-start gap-2 ${
                        currentLocation === loc.name
                          ? 'bg-[#eff4ff] text-[#006b2c] font-semibold'
                          : 'hover:bg-[#f8fafc] text-[#0b1c30]'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#006b2c]" />
                      <div>
                        <div>{loc.name}</div>
                        <div className="text-[10px] text-[#565e74]">{loc.address}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search Box */}
          <div className="flex-1 max-w-xl mx-1 sm:mx-3">
            <div className="relative flex items-center w-full">
              <Search className="absolute left-3 w-4 h-4 text-[#6e7b6c] pointer-events-none" />
              <input
                id="global-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search fresh vegetables, organic milk, fruits, artisanal bakery..."
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-white font-body text-[13px] text-[#0b1c30] placeholder:text-[#6e7b6c] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c] shadow-xs border border-[#e2e8f0]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 text-[#6e7b6c] hover:text-[#0b1c30]"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Toggle between Storefront & Admin Portal */}
            <button
              id="toggle-admin-portal-btn"
              type="button"
              data-path="dashboard-overview"
              onClick={() => onToggleView(currentView === 'storefront' ? 'admin' : 'storefront')}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all border ${
                currentView === 'admin'
                  ? 'bg-[#006b2c] text-white border-[#006b2c]'
                  : 'bg-[#dae2fd] text-[#131b2e] border-transparent hover:bg-[#cbdbf5]'
              }`}
            >
              {currentView === 'admin' ? (
                <>
                  <Store className="w-4 h-4" />
                  <span>Retail Storefront</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Admin Portal</span>
                </>
              )}
            </button>

            {/* Cart Button */}
            <button
              id="header-cart-btn"
              type="button"
              onClick={onOpenCart}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#006b2c] text-white hover:bg-[#00873a] transition-colors text-[12px] font-semibold shadow-xs"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Cart</span>
              <span
                id="header-cart-count"
                className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#7ffc97] text-[#002109] text-[11px] font-bold"
              >
                {cartCount}
              </span>
            </button>

            {/* Profile Avatar */}
            <div className="flex items-center gap-1 pl-1">
              <img
                src={USER_AVATAR_URL}
                alt="Sarah L. Store Manager"
                className="w-8 h-8 rounded-full object-cover ring-2 ring-[#006b2c]/30"
                title="Sarah L. (Store Operations Manager)"
              />
            </div>
          </div>
        </div>

        {/* Secondary Aisles Navigation Bar */}
        {currentView === 'storefront' && (
          <div className="flex items-center justify-between border-t border-[#e5eeff] pt-1.5 mt-2">
            <nav className="flex items-center gap-1.5 overflow-x-auto py-1 w-full text-[12px]">
              <button
                type="button"
                onClick={() => onSelectCategory('all')}
                className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap font-medium ${
                  selectedCategory === 'all'
                    ? 'bg-[#00873a] text-white font-semibold shadow-xs'
                    : 'text-[#3e4a3d] hover:bg-[#dce9ff] hover:text-[#0b1c30]'
                }`}
              >
                All Aisles
              </button>
              {AISLE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap font-medium ${
                    selectedCategory === cat.id
                      ? 'bg-[#00873a] text-white font-semibold shadow-xs'
                      : 'text-[#3e4a3d] hover:bg-[#dce9ff] hover:text-[#0b1c30]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};
