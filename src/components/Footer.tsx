import React from 'react';
import { BRAND_LOGO_URL } from '../data/products';
import { Lock, Leaf, ShieldCheck } from 'lucide-react';

interface FooterProps {
  onOpenAdmin: () => void;
  onSelectCategory: (cat: string) => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenAdmin,
  onSelectCategory,
}) => {
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
              Sustainably harvested local produce, farm-fresh dairy, and artisanal staples delivered to your kitchen within 30 minutes.
            </p>
          </div>

          {/* Col 2: Shop Categories */}
          <div>
            <h4 className="text-[15px] font-bold text-[#0b1c30] mb-3 font-display">
              Shop Categories
            </h4>
            <ul className="space-y-2 text-[13px] text-[#565e74]">
              <li>
                <button
                  type="button"
                  onClick={() => onSelectCategory('produce')}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left"
                >
                  Farm Vegetables &amp; Fresh Fruits
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectCategory('dairy')}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left"
                >
                  Organic Dairy &amp; Pasture-Raised Eggs
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectCategory('bakery')}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left"
                >
                  Artisanal Bakery &amp; Country Loaves
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectCategory('grains')}
                  className="hover:text-[#006b2c] transition-colors cursor-pointer text-left"
                >
                  Heritage Grains &amp; Pulses
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Customer Care */}
          <div>
            <h4 className="text-[15px] font-bold text-[#0b1c30] mb-3 font-display">
              Customer Care
            </h4>
            <ul className="space-y-2 text-[13px] text-[#565e74]">
              <li>
                <span className="hover:text-[#006b2c] transition-colors cursor-pointer">
                  Track Live Delivery
                </span>
              </li>
              <li>
                <span className="hover:text-[#006b2c] transition-colors cursor-pointer">
                  Freshness Guarantee Policy
                </span>
              </li>
              <li>
                <span className="hover:text-[#006b2c] transition-colors cursor-pointer">
                  Returns &amp; Store Credits
                </span>
              </li>
              <li>
                <span className="hover:text-[#006b2c] transition-colors cursor-pointer">
                  Contact Store Specialist
                </span>
              </li>
            </ul>
          </div>

          {/* Col 4: Store Operations */}
          <div>
            <h4 className="text-[15px] font-bold text-[#0b1c30] mb-3 font-display">
              Store Operations
            </h4>
            <p className="text-[13px] text-[#565e74] mb-3 leading-relaxed">
              Authorized store personnel and inventory associates can manage real-time batches via the backend panel.
            </p>
            <button
              type="button"
              onClick={onOpenAdmin}
              data-path="dashboard-overview"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#dce9ff] text-[#0b1c30] hover:bg-[#cbdbf5] transition-colors text-[12px] font-semibold cursor-pointer border border-[#cbd5e1]/50"
            >
              <Lock className="w-4 h-4 text-[#006b2c]" />
              <span>Access Admin Operations</span>
            </button>
          </div>
        </div>

        {/* Bottom copyright line */}
        <div className="mt-10 pt-5 border-t border-[#e2e8f0] flex flex-col sm:flex-row items-center justify-between gap-3 text-[#565e74] text-[12px]">
          <div>
            © 2025 FreshCart Inc. All local harvest and fulfillment rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-[#006b2c] font-medium">
              <Leaf className="w-3.5 h-3.5 text-[#006b2c]" />
              100% Recyclable Packaging
            </span>
            <span className="flex items-center gap-1.5 text-[#565e74] font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-[#006b2c]" />
              ISO 22000 Certified Cold-Chain
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
