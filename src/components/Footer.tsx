import React from 'react';
import { BRAND_LOGO_URL } from '../data/products';
import { Lock, Leaf, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface FooterProps {
  onOpenAdmin: () => void;
  onSelectCategory: (cat: string) => void;
  onOpenLogin?: () => void;
  onOpenDashboard?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenAdmin,
  onSelectCategory,
  onOpenLogin,
  onOpenDashboard,
}) => {
  const { t } = useLanguage();
  return (
    <footer className="w-full bg-[#eff4ff] mt-10 border-t border-[#e2e8f0]">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Col 1: Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <img
                src={BRAND_LOGO_URL}
                alt="FreshCart Brand Logo"
                className="h-7 w-auto object-contain"
              />
              <span className="text-[18px] font-bold text-[#006b2c] font-display">
                FreshCart
              </span>
            </div>
            <p className="text-[13px] text-[#565e74] leading-relaxed">
              {t('footerAbout')}
            </p>
          </div>

          {/* Col 2: Shop Categories */}
          <div>
            <h4 className="text-[15px] font-bold text-[#0b1c30] mb-3 font-display">
              {t('footerShopCategories')}
            </h4>
            <ul className="space-y-2 text-[13px] text-[#565e74]">
              <li>
                <button
                  type="button"
                  onClick={() => onSelectCategory('produce')}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left"
                >
                  {t('footerVegFruits')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectCategory('dairy')}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left"
                >
                  {t('footerDairyEggs')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectCategory('bakery')}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left"
                >
                  {t('footerBakeryBread')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectCategory('grains')}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left"
                >
                  {t('footerGrainsPulses')}
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Customer Care */}
          <div>
            <h4 className="text-[15px] font-bold text-[#0b1c30] mb-3 font-display">
              {t('footerCustomerCare')}
            </h4>
            <ul className="space-y-2 text-[13px] text-[#565e74]">
              <li>
                <button
                  type="button"
                  onClick={onOpenDashboard || onOpenLogin}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left font-medium"
                >
                  {t('footerAccountDashboard')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenDashboard || onOpenLogin}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left font-medium"
                >
                  {t('footerTrackOrders')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left"
                >
                  {t('footerSignInRegister')}
                </button>
              </li>
              <li>
                <span className="hover:text-[#006b2c] transition-colors cursor-pointer">
                  {t('footerFreshnessPolicy')}
                </span>
              </li>
              <li>
                <span className="hover:text-[#006b2c] transition-colors cursor-pointer">
                  {t('footerReturnsCredits')}
                </span>
              </li>
            </ul>
          </div>

          {/* Col 4: Store Operations */}
          <div>
            <h4 className="text-[15px] font-bold text-[#0b1c30] mb-3 font-display">
              {t('footerStoreOperations')}
            </h4>
            <p className="text-[13px] text-[#565e74] mb-3 leading-relaxed">
              {t('footerOperationsDesc')}
            </p>
            <button
              type="button"
              onClick={onOpenAdmin}
              data-path="dashboard-overview"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#dce9ff] text-[#0b1c30] hover:bg-[#cbdbf5] transition-colors text-[12px] font-semibold cursor-pointer border border-[#cbd5e1]/50"
            >
              <Lock className="w-4 h-4 text-[#006b2c]" />
              <span>{t('footerAccessAdmin')}</span>
            </button>
          </div>
        </div>

        {/* Bottom copyright line */}
        <div className="mt-10 pt-5 border-t border-[#e2e8f0] flex flex-col sm:flex-row items-center justify-between gap-3 text-[#565e74] text-[12px]">
          <div>
            {t('footerCopyright')}
          </div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-[#006b2c] font-medium">
              <Leaf className="w-3.5 h-3.5 text-[#006b2c]" />
              {t('footerRecyclable')}
            </span>
            <span className="flex items-center gap-1.5 text-[#565e74] font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-[#006b2c]" />
              {t('footerCertified')}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
