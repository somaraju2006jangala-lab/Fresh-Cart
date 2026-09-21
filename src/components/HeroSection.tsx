import React, { useState } from 'react';
import { HERO_IMAGE_URL } from '../data/products';
import {
  ShoppingBag,
  Zap,
  Clock,
  Thermometer,
  ArrowRight,
  Sprout,
  X,
  Check,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface HeroSectionProps {
  onSearch: (term: string) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onApplyCoupon: (code: string) => void;
  appliedCoupon: string | null;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onSearch,
  selectedCategory,
  onSelectCategory,
  onApplyCoupon,
  appliedCoupon,
}) => {
  const { t } = useLanguage();
  const [showBanner, setShowBanner] = useState(true);
  const [heroSearch, setHeroSearch] = useState('');
  const [couponCopied, setCouponCopied] = useState(false);

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroSearch.trim()) {
      onSearch(heroSearch.trim());
    }
  };

  const handleCopyCoupon = () => {
    onApplyCoupon('FRESH30');
    setCouponCopied(true);
    setTimeout(() => setCouponCopied(false), 2000);
  };

  const trendingTerms = [
    'Honeycrisp Apples',
    'Artisan Sourdough',
    'Grade-A Whole Milk',
    'Hass Avocados',
  ];

  return (
    <div className="w-full flex flex-col">
      {/* Promo Announcement Banner */}
      {showBanner && (
        <div
          id="promo-ribbon"
          className="w-full bg-[#00873a] text-[#f7fff2] py-2 px-4 sm:px-6 flex items-center justify-between shadow-xs relative"
        >
          <div className="flex items-center gap-2 mx-auto text-[12px] sm:text-[13px] flex-wrap justify-center">
            <ShoppingBag className="w-4 h-4 text-[#7ffc97] shrink-0" />
            <span>
              {t('promoBannerText')}{' '}
              <button
                type="button"
                onClick={handleCopyCoupon}
                className="font-bold underline tracking-wider text-white hover:text-[#7ffc97] transition-colors cursor-pointer inline-flex items-center gap-1"
                title="Click to apply FRESH30 to your cart"
              >
                FRESH30
                {couponCopied || appliedCoupon === 'FRESH30' ? (
                  <span className="text-[10px] bg-[#7ffc97] text-[#002109] px-1.5 py-0.2 rounded-full font-bold ml-1">
                    {t('promoApplied')}
                  </span>
                ) : (
                  <span className="text-[10px] bg-white/20 px-1 py-0.2 rounded-sm ml-0.5">
                    {t('promoClickToApply')}
                  </span>
                )}
              </button>{' '}
              {t('promoDiscountText')}
            </span>
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] bg-[#006b2c] text-white px-2 py-0.5 rounded-full font-semibold ml-1">
              {t('promoMinOrder')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowBanner(false)}
            className="text-white hover:opacity-75 transition-opacity"
            title="Dismiss announcement"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Real-time Inventory Sync Status Ticker */}
      <div className="w-full bg-[#eff4ff]/60 border-b border-[#e5eeff] py-1.5 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-[12px]">
          <div className="flex items-center gap-2 text-[#3e4a3d]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#006b2c] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#006b2c]" />
            </span>
            <span className="font-medium">
              {t('tickerSync')}
            </span>
          </div>
          <div className="flex items-center gap-4 text-[#565e74]">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#006b2c]" />
              {t('tickerAvgDelivery')}
            </span>
            <span className="flex items-center gap-1">
              <Thermometer className="w-3.5 h-3.5 text-[#825100]" />
              {t('tickerColdChain')}
            </span>
          </div>
        </div>
      </div>

      {/* Main Hero Showcase */}
      <section className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Text & Search Block */}
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e5eeff] text-[#131b2e] text-[12px] font-semibold">
              <Sprout className="w-4 h-4 text-[#006b2c]" />
              <span>{t('heroBadge')}</span>
            </div>

            <h1 className="text-[34px] sm:text-[44px] text-[#0b1c30] tracking-tight leading-tight font-extrabold font-display">
              {t('heroHeadingLine1')} {t('heroHeadingLine2')}{' '}
              <span className="text-[#006b2c] italic">{t('heroHeadingMinutes')}</span>
            </h1>

            <p className="text-[15px] sm:text-[16px] text-[#3e4a3d] leading-relaxed max-w-2xl font-body">
              {t('heroSubheading')}
            </p>

            {/* Quick Hero Search Input */}
            <div className="relative w-full max-w-xl pt-1">
              <form onSubmit={handleHeroSubmit} className="relative flex items-center bg-white rounded-xl shadow-md border border-[#e2e8f0]">
                <span className="pl-3.5 text-[#6e7b6c]">
                  <Zap className="w-5 h-5 text-[#006b2c]" />
                </span>
                <input
                  type="text"
                  value={heroSearch}
                  onChange={(e) => setHeroSearch(e.target.value)}
                  placeholder={t('heroSearchPlaceholder')}
                  className="w-full pl-2.5 pr-24 py-3 bg-transparent text-[14px] text-[#0b1c30] placeholder:text-[#6e7b6c] focus:outline-hidden"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-4 rounded-lg bg-[#006b2c] text-white text-[13px] font-semibold hover:bg-[#00873a] transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{t('find')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Trending suggestions */}
              <div className="flex flex-wrap items-center gap-2 pt-2 px-1 text-[#565e74] text-[11px] sm:text-[12px]">
                <span className="text-[#6e7b6c] font-medium">{t('trending')}</span>
                {trendingTerms.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => {
                      setHeroSearch(term);
                      onSearch(term);
                    }}
                    className="hover:text-[#006b2c] transition-colors underline decoration-dotted cursor-pointer"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>

            {/* Aisle Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-3">
              <button
                type="button"
                onClick={() => onSelectCategory('all')}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-[#006b2c] text-white shadow-xs'
                    : 'bg-[#eff4ff] text-[#3e4a3d] hover:bg-[#e5eeff]'
                }`}
              >
                {t('allAisles')}
              </button>
              <button
                type="button"
                onClick={() => onSelectCategory('produce')}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                  selectedCategory === 'produce'
                    ? 'bg-[#006b2c] text-white shadow-xs'
                    : 'bg-[#eff4ff] text-[#3e4a3d] hover:bg-[#e5eeff]'
                }`}
              >
                {t('catProduce')}
              </button>
              <button
                type="button"
                onClick={() => onSelectCategory('dairy')}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                  selectedCategory === 'dairy'
                    ? 'bg-[#006b2c] text-white shadow-xs'
                    : 'bg-[#eff4ff] text-[#3e4a3d] hover:bg-[#e5eeff]'
                }`}
              >
                {t('catDairy')}
              </button>
              <button
                type="button"
                onClick={() => onSelectCategory('bakery')}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                  selectedCategory === 'bakery'
                    ? 'bg-[#006b2c] text-white shadow-xs'
                    : 'bg-[#eff4ff] text-[#3e4a3d] hover:bg-[#e5eeff]'
                }`}
              >
                {t('catBakery')}
              </button>
              <button
                type="button"
                onClick={() => onSelectCategory('beverages')}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                  selectedCategory === 'beverages'
                    ? 'bg-[#006b2c] text-white shadow-xs'
                    : 'bg-[#eff4ff] text-[#3e4a3d] hover:bg-[#e5eeff]'
                }`}
              >
                {t('catBeverages')}
              </button>
              <button
                type="button"
                onClick={() => onSelectCategory('grains')}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                  selectedCategory === 'grains'
                    ? 'bg-[#006b2c] text-white shadow-xs'
                    : 'bg-[#eff4ff] text-[#3e4a3d] hover:bg-[#e5eeff]'
                }`}
              >
                {t('catGrains')}
              </button>
            </div>
          </div>

          {/* Right Hero Image Card with Cold-Chain Speed Hub */}
          <div className="lg:col-span-5 relative">
            <div className="relative rounded-2xl overflow-hidden shadow-xl bg-white border border-[#e2e8f0]/80">
              <img
                src={HERO_IMAGE_URL}
                alt="Farm fresh organic vegetables and milk"
                className="w-full h-80 object-cover"
              />

              {/* Floating Speed Hub Banner */}
              <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md rounded-xl p-3.5 shadow-lg border border-[#e2e8f0]/70 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#eff4ff] flex items-center justify-center text-[#006b2c] shrink-0">
                    <Zap className="w-5 h-5 text-[#006b2c]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#0b1c30]">Cold-Chain Speed Hub</p>
                    <p className="text-[11px] text-[#565e74]">Packed within 7 mins at 4°C</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#7ffc97] text-[#002109] text-[11px] font-bold">
                  Live Status: Fast
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
