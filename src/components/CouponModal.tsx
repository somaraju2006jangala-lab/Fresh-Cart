import React, { useState, useEffect } from 'react';
import { Coupon } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { X, Check, Tag, Percent } from 'lucide-react';

interface CouponModalProps {
  isOpen: boolean;
  coupon: Coupon | null;
  onClose: () => void;
  onSave: (couponData: {
    code: string;
    discountPercentage: number;
    isActive: boolean;
    description?: string;
  }) => void;
  existingCodes?: string[];
}

const PRESET_DISCOUNTS = [3, 5, 10, 15, 20];

export const CouponModal: React.FC<CouponModalProps> = ({
  isOpen,
  coupon,
  onClose,
  onSave,
  existingCodes = [],
}) => {
  const { t } = useLanguage();
  const [code, setCode] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState<number>(10);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (coupon) {
      setCode(coupon.code);
      setDiscountPercentage(coupon.discountPercentage);
      setIsActive(coupon.isActive);
      setDescription(coupon.description || '');
      setError('');
    } else {
      setCode('');
      setDiscountPercentage(10);
      setIsActive(true);
      setDescription('');
      setError('');
    }
  }, [coupon, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedCode = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!trimmedCode) {
      setError('Please enter a valid coupon code (e.g. SAVE10).');
      return;
    }

    // Check for duplicate code if creating or changing code
    const isDuplicate = existingCodes.some(
      (c) => c.toUpperCase() === trimmedCode && (!coupon || coupon.code.toUpperCase() !== trimmedCode)
    );
    if (isDuplicate) {
      setError(`Coupon code "${trimmedCode}" already exists. Please choose a distinct code.`);
      return;
    }

    if (isNaN(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
      setError('Discount percentage must be between 1% and 100%.');
      return;
    }

    onSave({
      code: trimmedCode,
      discountPercentage,
      isActive,
      description: description.trim(),
    });
    onClose();
  };

  return (
    <div
      id="coupon-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/50 backdrop-blur-xs animate-in fade-in"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#e2e8f0] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#006b2c] text-white flex items-center justify-center shadow-xs">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h2 id="coupon-modal-title" className="text-[17px] font-bold text-[#0b1c30] font-display">
                {coupon ? t('editCouponTitle') : t('createCouponTitle')}
              </h2>
              <p className="text-[11px] text-[#565e74]">
                {coupon ? 'Modify discount code & percentage' : 'Add new promotional discount code'}
              </p>
            </div>
          </div>
          <button
            type="button"
            id="close-coupon-modal-btn"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-[#565e74] hover:bg-[#e2e8f0] hover:text-[#0b1c30] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div
              id="coupon-error-alert"
              className="p-2.5 rounded-lg bg-[#fee2e2] text-[#b91c1c] text-[12px] font-semibold border border-[#fecaca]"
            >
              {error}
            </div>
          )}

          {/* Coupon Code */}
          <div className="space-y-1">
            <label htmlFor="coupon-code-input" className="text-[12px] font-semibold text-[#0b1c30]">
              {t('couponCodeLabel')} *
            </label>
            <input
              id="coupon-code-input"
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t('couponCodePlaceholder')}
              className="w-full px-3 py-2 text-[13px] font-mono font-bold tracking-wider uppercase border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
            />
          </div>

          {/* Discount Percentage */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="coupon-discount-input" className="text-[12px] font-semibold text-[#0b1c30]">
                {t('discountPercentageLabel')} *
              </label>
              <span className="text-[11px] font-bold text-[#006b2c]">{discountPercentage}% OFF</span>
            </div>

            <div className="relative flex items-center">
              <input
                id="coupon-discount-input"
                type="number"
                min="1"
                max="100"
                step="1"
                required
                value={discountPercentage}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setDiscountPercentage(isNaN(val) ? 0 : Math.min(100, Math.max(0, val)));
                }}
                className="w-full pl-3 pr-8 py-2 text-[13px] font-bold border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
              />
              <Percent className="absolute right-3 w-4 h-4 text-[#64748b] pointer-events-none" />
            </div>

            {/* Quick Preset Buttons */}
            <div className="pt-1">
              <span className="text-[11px] text-[#565e74] font-medium block mb-1">
                {t('presetDiscountLabel')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_DISCOUNTS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setDiscountPercentage(pct)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all cursor-pointer ${
                      discountPercentage === pct
                        ? 'bg-[#006b2c] text-white border-[#006b2c] shadow-2xs'
                        : 'bg-[#f8fafc] text-[#475569] border-[#cbd5e1] hover:bg-[#eff4ff] hover:border-[#006b2c] hover:text-[#006b2c]'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Status Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc]">
            <div>
              <span className="text-[12px] font-semibold text-[#0b1c30] block">
                {t('couponStatusLabel')}
              </span>
              <span className="text-[11px] text-[#565e74]">
                {isActive ? 'Available for customer orders' : 'Currently disabled / unavailable'}
              </span>
            </div>

            <button
              type="button"
              id="coupon-status-toggle-btn"
              onClick={() => setIsActive(!isActive)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                isActive
                  ? 'bg-[#dcfce7] text-[#15803d] border-[#86efac]'
                  : 'bg-[#f1f5f9] text-[#64748b] border-[#cbd5e1]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#16a34a]' : 'bg-[#94a3b8]'}`}
              />
              <span>{isActive ? t('couponActive') : t('couponDisabled')}</span>
            </button>
          </div>

          {/* Description (Optional) */}
          <div className="space-y-1">
            <label htmlFor="coupon-description-input" className="text-[12px] font-semibold text-[#0b1c30]">
              {t('couponDescriptionLabel')}
            </label>
            <input
              id="coupon-description-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('couponDescriptionPlaceholder')}
              className="w-full px-3 py-1.5 text-[12px] border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-[#e2e8f0] flex items-center justify-end gap-2">
            <button
              type="button"
              id="cancel-coupon-btn"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0b1c30] transition-colors cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              id="save-coupon-btn"
              className="px-5 py-2 rounded-lg bg-[#006b2c] hover:bg-[#00873a] text-white text-[13px] font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{coupon ? t('updateCoupon') : t('saveCoupon')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
