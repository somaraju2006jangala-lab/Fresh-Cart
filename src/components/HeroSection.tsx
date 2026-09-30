import React, { useState } from 'react';
import {
  Zap,
  ArrowRight,
  Sprout,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface HeroSectionProps {
  onSearch: (term: string) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  onApplyCoupon?: (code: string) => void;
  appliedCoupon?: string | null;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onSearch,
  selectedCategory,
  onSelectCategory,
}) => {
  const { t } = useLanguage();
  const [heroSearch, setHeroSearch] = useState('');

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroSearch.trim()) {
      onSearch(heroSearch.trim());
    }
  };

  const trendingTerms = [
    'Honeycrisp Apples',
    'Artisan Sourdough',
    'Grade-A Whole Milk',
    'Hass Avocados',
  ];

  return (
    <div className="w-full flex flex-col">
      {/* Main Hero Showcase */}
      <section className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        <div className="w-full max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/35 backdrop-blur-xs text-[#131b2e] text-[12px] font-semibold border border-white/50 shadow-2xs">
            <Sprout className="w-4 h-4 text-[#006b2c]" />
            <span>{t('heroBadge')}</span>
          </div>

          <h1 className="text-[34px] sm:text-[44px] md:text-[48px] text-[#0b1c30] tracking-tight leading-tight font-extrabold font-display max-w-3xl">
            {t('heroHeadingLine1')} {t('heroHeadingLine2')}{' '}
            <span className="text-[#006b2c] italic">{t('heroHeadingMinutes')}</span>
          </h1>

          <p className="text-[15px] sm:text-[16px] text-[#3e4a3d] leading-relaxed max-w-2xl font-body">
            {t('heroSubheading')}
          </p>

          {/* Quick Hero Search Input - Crystal Glass */}
          <div className="relative w-full max-w-2xl pt-1">
            <form onSubmit={handleHeroSubmit} className="relative flex items-center bg-white/35 backdrop-blur-md rounded-2xl shadow-xs border border-white/50 hover:border-white/80 focus-within:bg-white/55 transition-all">
              <span className="pl-3.5 text-[#6e7b6c]">
                <Zap className="w-5 h-5 text-[#006b2c]" />
              </span>
              <input
                id="hero-search-input"
                type="text"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                placeholder={t('heroSearchPlaceholder')}
                className="w-full pl-2.5 pr-24 py-3 bg-transparent text-[14px] text-[#0b1c30] placeholder:text-[#565e74]/70 focus:outline-hidden"
              />
              <button
                type="submit"
                id="hero-search-find-btn"
                className="absolute right-1.5 top-1.5 bottom-1.5 px-4 rounded-xl bg-[#006b2c] text-white text-[13px] font-semibold hover:bg-[#00873a] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:brightness-105 active:translate-y-0 active:scale-98 shadow-xs flex items-center gap-1.5 cursor-pointer"
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

          {/* Aisle Filter Buttons - Crystal Glass */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            <button
              type="button"
              id="hero-category-all"
              onClick={() => onSelectCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-[#006b2c] text-white shadow-xs'
                  : 'bg-white/30 backdrop-blur-xs text-[#3e4a3d] hover:bg-white/55 border border-white/50 shadow-2xs'
              }`}
            >
              {t('allAisles')}
            </button>
            <button
              type="button"
              id="hero-category-produce"
              onClick={() => onSelectCategory('produce')}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${
                selectedCategory === 'produce'
                  ? 'bg-[#006b2c] text-white shadow-xs'
                  : 'bg-white/30 backdrop-blur-xs text-[#3e4a3d] hover:bg-white/55 border border-white/50 shadow-2xs'
              }`}
            >
              {t('catProduce')}
            </button>
            <button
              type="button"
              id="hero-category-dairy"
              onClick={() => onSelectCategory('dairy')}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${
                selectedCategory === 'dairy'
                  ? 'bg-[#006b2c] text-white shadow-xs'
                  : 'bg-white/30 backdrop-blur-xs text-[#3e4a3d] hover:bg-white/55 border border-white/50 shadow-2xs'
              }`}
            >
              {t('catDairy')}
            </button>
            <button
              type="button"
              id="hero-category-bakery"
              onClick={() => onSelectCategory('bakery')}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${
                selectedCategory === 'bakery'
                  ? 'bg-[#006b2c] text-white shadow-xs'
                  : 'bg-white/30 backdrop-blur-xs text-[#3e4a3d] hover:bg-white/55 border border-white/50 shadow-2xs'
              }`}
            >
              {t('catBakery')}
            </button>
            <button
              type="button"
              id="hero-category-beverages"
              onClick={() => onSelectCategory('beverages')}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${
                selectedCategory === 'beverages'
                  ? 'bg-[#006b2c] text-white shadow-xs'
                  : 'bg-white/30 backdrop-blur-xs text-[#3e4a3d] hover:bg-white/55 border border-white/50 shadow-2xs'
              }`}
            >
              {t('catBeverages')}
            </button>
            <button
              type="button"
              id="hero-category-grains"
              onClick={() => onSelectCategory('grains')}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200 hover:-translate-y-0.5 cursor-pointer ${
                selectedCategory === 'grains'
                  ? 'bg-[#006b2c] text-white shadow-xs'
                  : 'bg-white/30 backdrop-blur-xs text-[#3e4a3d] hover:bg-white/55 border border-white/50 shadow-2xs'
              }`}
            >
              {t('catGrains')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
