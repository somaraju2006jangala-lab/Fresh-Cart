import React from 'react';
import { Timer } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export const TrustBanner: React.FC = () => {
  const { t } = useLanguage();
  return (
    <section className="w-full bg-white/50 backdrop-blur-md py-10 px-4 sm:px-6 lg:px-8 my-8 border-y border-white/70">
      <div className="max-w-2xl mx-auto flex items-start justify-center gap-4">
        <div className="p-3 rounded-2xl bg-white/90 backdrop-blur-md text-[#006b2c] shadow-sm shrink-0 border border-white/80">
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
    </section>
  );
};
