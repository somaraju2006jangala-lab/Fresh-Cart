import React from 'react';
import { Timer, CheckCircle, Database } from 'lucide-react';

export const TrustBanner: React.FC = () => {
  return (
    <section className="w-full bg-[#eff4ff] py-10 px-4 sm:px-6 lg:px-8 my-8 border-y border-[#e2e8f0]/60">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-white text-[#006b2c] shadow-xs shrink-0 border border-[#e2e8f0]">
            <Timer className="w-7 h-7 text-[#006b2c]" />
          </div>
          <div>
            <h4 className="text-[16px] font-semibold text-[#0b1c30] font-display">
              Under 30-Minute Speed
            </h4>
            <p className="text-[13px] text-[#3e4a3d] mt-1 leading-relaxed font-body">
              Dedicated electric runners pick straight from the neighborhood mini-fulfillment pods within 7 minutes of ordering.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-white text-[#006b2c] shadow-xs shrink-0 border border-[#e2e8f0]">
            <CheckCircle className="w-7 h-7 text-[#006b2c]" />
          </div>
          <div>
            <h4 className="text-[16px] font-semibold text-[#0b1c30] font-display">
              100% Crispness Guarantee
            </h4>
            <p className="text-[13px] text-[#3e4a3d] mt-1 leading-relaxed font-body">
              If any berry or vegetable fails your freshness test, tap the 1-click refund button for an instant in-app wallet credit.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-white text-[#006b2c] shadow-xs shrink-0 border border-[#e2e8f0]">
            <Database className="w-7 h-7 text-[#006b2c]" />
          </div>
          <div>
            <h4 className="text-[16px] font-semibold text-[#0b1c30] font-display">
              Store #104 Live Cluster
            </h4>
            <p className="text-[13px] text-[#3e4a3d] mt-1 leading-relaxed font-body">
              Connected with live MongoDB CDC feeds. Never experience checkout cancellations due to phantom stock.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
