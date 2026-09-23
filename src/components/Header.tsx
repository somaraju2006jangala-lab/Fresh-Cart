import React, { useState } from 'react';
import { ViewType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSelector } from './LanguageSelector';
import {
  BRAND_LOGO_URL,
  AISLE_CATEGORIES,
} from '../data/products';
import {
  Search,
  ShieldCheck,
  ShoppingCart,
  Store,
  X,
  ChevronDown,
  User,
  LogOut,
  Truck,
} from 'lucide-react';

interface HeaderProps {
  currentView: ViewType;
  onToggleView: (view: ViewType) => void;
  cartCount: number;
  onOpenCart: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit?: (query: string) => void;
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
  onSearchSubmit,
  selectedCategory,
  onSelectCategory,
}) => {
  const { currentUser, logout } = useAuth();
  const { t } = useLanguage();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const getViewBadgeLabel = () => {
    switch (currentView) {
      case 'storefront':
        return t('navRetailStorefront');
      case 'admin':
        return t('navOpsPortal');
      case 'dashboard':
        return t('navCustomerPortal');
      case 'login':
        return t('navSignIn');
      case 'register':
        return t('navNewAccount');
      case 'search':
        return 'Search Results';
      case 'category':
        return 'Category Catalog';
      default:
        return t('navRetailStorefront');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearchSubmit) {
      onSearchSubmit(searchQuery);
    }
  };

  const getCategoryName = (catId: string, fallback: string) => {
    switch (catId) {
      case 'produce': return t('catProduce');
      case 'dairy': return t('catDairy');
      case 'bakery': return t('catBakery');
      case 'beverages': return t('catBeverages');
      case 'snacks': return t('catSnacks');
      case 'grains': return t('catGrains');
      default: return fallback;
    }
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
              className="flex items-center gap-2 text-left focus:outline-hidden group cursor-pointer"
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
              {getViewBadgeLabel()}
            </span>
          </div>



          {/* Search Box / Tagline */}
          <div className="flex-1 max-w-xl mx-1 sm:mx-3">
            {currentView === 'login' || currentView === 'register' ? (
              <div className="text-center hidden md:block">
                <span className="text-[12px] font-medium text-[#565e74]">
                  {t('tagline')}
                </span>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="relative flex items-center w-full">
                <Search className="absolute left-3 w-4 h-4 text-[#6e7b6c] pointer-events-none" />
                <input
                  id="global-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="w-full pl-9 pr-24 py-2 rounded-lg bg-white font-body text-[13px] text-[#0b1c30] placeholder:text-[#6e7b6c] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c] shadow-xs border border-[#e2e8f0]"
                />
                <div className="absolute right-1.5 flex items-center gap-1.5">
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => onSearchChange('')}
                      className="p-1 text-[#6e7b6c] hover:text-[#0b1c30] cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="submit"
                    id="header-search-find-btn"
                    className="px-2.5 py-1 rounded-md bg-[#006b2c] text-white text-[12px] font-semibold hover:bg-[#00873a] transition-colors cursor-pointer shadow-2xs"
                  >
                    {t('find')}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Customer Portal Language Selector (Only shown after customer successfully logs in) */}
            {currentUser && currentView !== 'login' && currentView !== 'register' && currentView !== 'admin' && (
              <LanguageSelector variant="light" compact={true} idPrefix="header-lang" />
            )}

            {/* Toggle between Storefront/Login & Admin Portal */}
            <button
              id="toggle-admin-portal-btn"
              type="button"
              data-path="dashboard-overview"
              onClick={() =>
                onToggleView(
                  currentView === 'admin'
                    ? currentUser
                      ? 'storefront'
                      : 'login'
                    : 'admin'
                )
              }
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all border cursor-pointer ${
                currentView === 'admin'
                  ? 'bg-[#006b2c] text-white border-[#006b2c]'
                  : 'bg-[#dae2fd] text-[#131b2e] border-transparent hover:bg-[#cbdbf5]'
              }`}
            >
              {currentView === 'admin' ? (
                <>
                  <Store className="w-4 h-4" />
                  <span>{currentUser ? t('navRetailStorefront') : t('navSignIn')}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('navAdminPortal')}</span>
                </>
              )}
            </button>

            {/* Cart Button (Only on storefront and customer dashboard; completely removed from Admin Portal) */}
            {currentView !== 'login' && currentView !== 'register' && currentView !== 'admin' && (
              <button
                id="header-cart-btn"
                type="button"
                onClick={onOpenCart}
                aria-label={t('cart')}
                title={t('cart')}
                className="relative flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-[#006b2c] text-white hover:bg-[#00873a] transition-colors shadow-xs cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
              </button>
            )}

            {/* Customer Account / Sign In / Register */}
            {currentUser ? (
              <div className="relative">
                <button
                  type="button"
                  id="customer-profile-menu-btn"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-[#eff4ff] transition-colors border border-transparent hover:border-[#cbd5e1]/60 cursor-pointer"
                >
                  <img
                    src={
                      currentUser.avatarUrl ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.name)}&backgroundColor=006b2c`
                    }
                    alt={currentUser.name}
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-[#006b2c]/40"
                  />
                  <div className="hidden lg:flex flex-col text-left">
                    <span className="text-[12px] font-bold text-[#0b1c30] leading-tight max-w-[110px] truncate">
                      {currentUser.name}
                    </span>
                    <span className="text-[10px] text-[#006b2c] font-semibold leading-tight">
                      {t('myDashboard')}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[#565e74]" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-[#e2e8f0] p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2 border-b border-[#e2e8f0] mb-1">
                      <p className="text-[13px] font-bold text-[#0b1c30] truncate">{currentUser.name}</p>
                      <p className="text-[11px] text-[#565e74] truncate">{currentUser.email}</p>
                    </div>

                    <button
                      type="button"
                      id="menu-dashboard-link"
                      onClick={() => {
                        setShowUserMenu(false);
                        onToggleView('dashboard');
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-[12px] font-semibold text-[#0b1c30] hover:bg-[#eff4ff] hover:text-[#006b2c] flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <User className="w-4 h-4 text-[#006b2c]" />
                      <span>{t('navCustomerPortal')}</span>
                    </button>

                    <button
                      type="button"
                      id="menu-orders-link"
                      onClick={() => {
                        setShowUserMenu(false);
                        onToggleView('dashboard');
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-[12px] font-semibold text-[#0b1c30] hover:bg-[#eff4ff] hover:text-[#006b2c] flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Truck className="w-4 h-4 text-[#006b2c]" />
                      <span>{t('myOrdersTracking')}</span>
                    </button>

                    <div className="border-t border-[#e2e8f0] mt-1 pt-1">
                      <button
                        type="button"
                        id="header-logout-btn"
                        onClick={() => {
                          setShowUserMenu(false);
                          logout();
                          onToggleView('login');
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-[12px] font-semibold text-[#b91c1c] hover:bg-[#fef2f2] flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>{t('logOut')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : currentView === 'login' ? (
              <button
                type="button"
                id="header-goto-reg-btn"
                onClick={() => onToggleView('register')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#006b2c] text-white hover:bg-[#00873a] text-[12px] font-semibold transition-all shadow-2xs cursor-pointer"
              >
                <span>{t('navRegister')}</span>
              </button>
            ) : (
              <button
                type="button"
                id="header-login-btn"
                onClick={() => onToggleView('login')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[#006b2c] hover:bg-[#eff4ff] border border-[#cbd5e1] text-[12px] font-semibold transition-all shadow-2xs cursor-pointer"
              >
                <User className="w-4 h-4 text-[#006b2c]" />
                <span>{t('navSignIn')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Secondary Aisles Navigation Bar */}
        {(currentView === 'storefront' || currentView === 'search' || currentView === 'category') && (
          <div className="flex items-center justify-between border-t border-[#e5eeff] pt-1.5 mt-2">
            <nav className="flex items-center gap-1.5 overflow-x-auto py-1 w-full text-[12px]">
              <button
                type="button"
                onClick={() => onSelectCategory('all')}
                className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap font-medium cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-[#00873a] text-white font-semibold shadow-xs'
                    : 'text-[#3e4a3d] hover:bg-[#dce9ff] hover:text-[#0b1c30]'
                }`}
              >
                {t('allAisles')}
              </button>
              {AISLE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap font-medium cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-[#00873a] text-white font-semibold shadow-xs'
                      : 'text-[#3e4a3d] hover:bg-[#dce9ff] hover:text-[#0b1c30]'
                  }`}
                >
                  {getCategoryName(cat.id, cat.name)}
                </button>
              ))}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

