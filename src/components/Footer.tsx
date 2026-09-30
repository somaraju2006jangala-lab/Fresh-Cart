import React from 'react';
import { Leaf, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface FooterProps {
  onOpenAdmin?: () => void;
  onSelectCategory?: (cat: string) => void;
  onOpenLogin?: () => void;
  onOpenDashboard?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenLogin,
  onOpenDashboard,
}) => {
  const { t } = useLanguage();
  return (
    <footer className="w-full bg-white/60 backdrop-blur-xl mt-10 border-t border-white/70">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
        {/* Customer Care */}
        <div>
          <h4 className="text-[15px] font-bold text-[#0b1c30] mb-3 font-display">
            {t('footerCustomerCare')}
          </h4>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#565e74]">
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

        {/* Bottom copyright line */}
        <div className="mt-8 pt-5 border-t border-[#e2e8f0] flex flex-col sm:flex-row items-center justify-between gap-3 text-[#565e74] text-[12px]">
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
