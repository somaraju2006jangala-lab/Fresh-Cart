import React from 'react';
import { AISLE_CATEGORIES } from '../data/products';
import {
  Apple,
  Milk,
  Croissant,
  Coffee,
  Cookie,
  Wheat,
  ChevronRight,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface CategoryGridProps {
  selectedCategory: string;
  onSelectCategory: (catId: string) => void;
}

export const CategoryGrid: React.FC<CategoryGridProps> = ({
  selectedCategory,
  onSelectCategory,
}) => {
  const { t } = useLanguage();

  const getCategoryName = (id: string, fallback: string) => {
    switch (id) {
      case 'produce': return t('catProduce');
      case 'dairy': return t('catDairy');
      case 'bakery': return t('catBakery');
      case 'beverages': return t('catBeverages');
      case 'snacks': return t('catSnacks');
      case 'grains': return t('catGrains');
      default: return fallback;
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
        return <Apple className="w-6 h-6 text-[#006b2c]" />;
    }
  };

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div className="flex items-end justify-between mb-5">
        <div>
          <span className="text-[11px] text-[#006b2c] tracking-widest uppercase font-bold">
            {t('curatedCatalog')}
          </span>
          <h2 className="text-[26px] sm:text-[30px] text-[#0b1c30] font-bold font-display">
            {t('shopByCategory')}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onSelectCategory('all')}
          className="text-[13px] text-[#006b2c] hover:underline font-semibold flex items-center gap-1 group cursor-pointer"
        >
          <span>{t('viewAllAisles')}</span>
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {AISLE_CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              id={`category-card-${cat.id}`}
              type="button"
              onClick={() => onSelectCategory(isSelected ? 'all' : cat.id)}
              className={`p-4 rounded-2xl transition-all text-center flex flex-col items-center justify-center gap-2 border cursor-pointer ${
                isSelected
                  ? 'bg-[#eff4ff] border-[#006b2c] shadow-md ring-2 ring-[#006b2c]/20'
                  : 'bg-white hover:bg-[#eff4ff]/50 border-[#e2e8f0] shadow-xs hover:shadow-md'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform hover:scale-105 ${
                  isSelected ? 'bg-white shadow-xs' : 'bg-[#eff4ff]'
                }`}
              >
                {getCategoryIcon(cat.id)}
              </div>
              <div className="text-center">
                <h3 className="text-[14px] font-semibold text-[#0b1c30] leading-tight">
                  {getCategoryName(cat.id, cat.name)}
                </h3>
                <span className="text-[11px] text-[#565e74] mt-0.5 block">
                  {t('itemsCount', { count: cat.count })}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
