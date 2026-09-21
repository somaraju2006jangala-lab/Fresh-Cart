import React from 'react';
import { Timer, CheckCircle, Database } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export const TrustBanner: React.FC = () => {
  const { t } = useLanguage();
  return (
    <section className="w-full bg-[#eff4ff] py-10 px-4 sm:px-6 lg:px-8 my-8 border-y border-[#e2e8f0]/60">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-white text-[#006b2c] shadow-xs shrink-0 border border-[#e2e8f0]">
            <Timer className="w-7 h-7 text-[#006b2c]" />
          </div>
          <div>
            <h4 className="text-[16px] font-semibold text-[#0b1c30] font-display">
              {t('speedTitle')}
            </h4>
            <p className="text-[13px] text-[#3e4a3d] mt-1 leading-relaxed font-body">
              {t('speedDesc')}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-white text-[#006b2c] shadow-xs shrink-0 border border-[#e2e8f0]">
            <CheckCircle className="w-7 h-7 text-[#006b2c]" />
          </div>
          <div>
            <h4 className="text-[16px] font-semibold text-[#0b1c30] font-display">
              {t('guaranteeTitle')}
            </h4>
            <p className="text-[13px] text-[#3e4a3d] mt-1 leading-relaxed font-body">
              {t('guaranteeDesc')}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-white text-[#006b2c] shadow-xs shrink-0 border border-[#e2e8f0]">
            <Database className="w-7 h-7 text-[#006b2c]" />
          </div>
          <div>
            <h4 className="text-[16px] font-semibold text-[#0b1c30] font-display">
              {t('clusterTitle')}
            </h4>
            <p className="text-[13px] text-[#3e4a3d] mt-1 leading-relaxed font-body">
              {t('clusterDesc')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
