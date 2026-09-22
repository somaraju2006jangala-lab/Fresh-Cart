import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { STANDARD_UNITS } from './AddProductModal';
import { X, Check, Upload, Image as ImageIcon, Plus, Minus, Edit3 } from 'lucide-react';

interface EditProductModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onSaveProduct: (updatedProduct: Product) => void;
  allCategories?: string[];
}

const DEFAULT_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80';

const STANDARD_CATEGORY_OPTIONS = [
  { id: 'produce', label: 'Fruits & Vegetables' },
  { id: 'dairy', label: 'Dairy & Eggs' },
  { id: 'bakery', label: 'Bakery' },
  { id: 'beverages', label: 'Beverages' },
  { id: 'snacks', label: 'Snacks' },
  { id: 'grains', label: 'Rice & Grains' },
];

export const EditProductModal: React.FC<EditProductModalProps> = ({
  isOpen,
  product,
  onClose,
  onSaveProduct,
  allCategories = [],
}) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [supplier, setSupplier] = useState('');
  const [price, setPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [unit, setUnit] = useState<string>('1 kg');
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [customUnit, setCustomUnit] = useState('');
  const [category, setCategory] = useState<string>('produce');
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [image, setImage] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  // Populate form fields when product changes
  useEffect(() => {
    if (product) {
      setTitle(product.title || '');
      setSupplier(product.supplier || 'Local Farm Direct');
      setPrice(product.price ? product.price.toString() : '0');
      setQuantity(Math.max(0, product.stock || 0));

      const isStandardUnit = STANDARD_UNITS.includes(product.unit as any);
      if (isStandardUnit) {
        setUnit(product.unit);
        setIsCustomUnit(false);
        setCustomUnit('');
      } else {
        setUnit('custom');
        setIsCustomUnit(true);
        setCustomUnit(product.unit || '');
      }

      const isStandardCat = STANDARD_CATEGORY_OPTIONS.some((c) => c.id === product.category);
      if (isStandardCat) {
        setCategory(product.category);
        setIsNewCategory(false);
        setNewCategoryName('');
      } else {
        setCategory('__new__');
        setIsNewCategory(true);
        setNewCategoryName(product.categoryLabel || product.category || '');
      }

      setImage(product.image || '');
      setImagePreview(product.image || '');
      setDescription(product.description || '');
      setError('');
    }
  }, [product]);

  if (!isOpen || !product) return null;

  // Handle local image file upload and convert to base64 for instant preview & persistence
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WebP, etc.).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image file must be under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setImage(result);
        setImagePreview(result);
      }
    };
    reader.onerror = () => {
      setError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleQuantityDelta = (delta: number) => {
    setQuantity((prev) => Math.max(0, prev + delta));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Please enter a product name.');
      return;
    }

    const trimmedSupplier = supplier.trim();
    if (!trimmedSupplier) {
      setError('Please enter a supplier name.');
      return;
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      setError('Please enter a valid price in Indian Rupees (₹) greater than 0.');
      return;
    }

    if (isNaN(quantity) || quantity < 0) {
      setError('Product quantity cannot be negative.');
      return;
    }

    const selectedUnit = isCustomUnit ? customUnit.trim() : unit;
    if (!selectedUnit) {
      setError('Please specify a valid product unit or pack size.');
      return;
    }

    let finalCategory = category;
    let finalCategoryLabel = '';

    if (isNewCategory) {
      const trimmedNewCat = newCategoryName.trim();
      if (!trimmedNewCat) {
        setError('Please enter a new category name.');
        return;
      }
      finalCategory = trimmedNewCat.toLowerCase().replace(/\s+/g, '-');
      finalCategoryLabel = trimmedNewCat;
    } else {
      const standardMatch = STANDARD_CATEGORY_OPTIONS.find((c) => c.id === category);
      if (standardMatch) {
        finalCategoryLabel = standardMatch.label;
      } else {
        finalCategoryLabel = category;
      }
    }

    const finalImage = (image || imagePreview || product.image || DEFAULT_FALLBACK_IMAGE).trim();

    const updatedProduct: Product = {
      ...product,
      title: trimmedTitle,
      supplier: trimmedSupplier,
      price: numericPrice,
      stock: quantity,
      unit: selectedUnit,
      category: finalCategory,
      categoryLabel: finalCategoryLabel,
      image: finalImage,
      description: description.trim() || product.description || '',
    };

    onSaveProduct(updatedProduct);
    onClose();
  };

  // Combine standard and any custom categories present in catalog
  const dynamicCategories = Array.from(
    new Set([
      ...STANDARD_CATEGORY_OPTIONS.map((c) => c.id),
      ...allCategories.filter((c) => c && c !== '__new__'),
    ])
  );

  return (
    <div
      id="edit-product-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/50 backdrop-blur-xs animate-in fade-in"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-[#e2e8f0] flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#006b2c] text-white flex items-center justify-center shadow-xs">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="edit-product-modal-title" className="text-[17px] font-bold text-[#0b1c30] font-display">
                {t('editProductTitle')}
              </h2>
              <p className="text-[11px] text-[#565e74]">
                {t('editProductSubtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            id="close-edit-modal-btn"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-[#565e74] hover:bg-[#e2e8f0] hover:text-[#0b1c30] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div
              id="edit-product-error-alert"
              className="p-2.5 rounded-lg bg-[#fee2e2] text-[#b91c1c] text-[12px] font-semibold border border-[#fecaca]"
            >
              {error}
            </div>
          )}

          {/* 1. Item / Product Name */}
          <div className="space-y-1">
            <label htmlFor="edit-product-name" className="text-[12px] font-semibold text-[#0b1c30]">
              {t('productNameLabel')}
            </label>
            <input
              id="edit-product-name"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Basmati Rice"
              className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
            />
          </div>

          {/* 2. Supplier */}
          <div className="space-y-1">
            <label htmlFor="edit-product-supplier" className="text-[12px] font-semibold text-[#0b1c30]">
              {t('supplierLabel')}
            </label>
            <input
              id="edit-product-supplier"
              type="text"
              required
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder={t('supplierPlaceholder')}
              className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
            />
          </div>

          {/* 3. Category (Existing or New) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="edit-product-category" className="text-[12px] font-semibold text-[#0b1c30]">
                {t('categoryLabel')}
              </label>
              <button
                type="button"
                id="toggle-new-category-btn"
                onClick={() => {
                  setIsNewCategory(!isNewCategory);
                  if (!isNewCategory) {
                    setCategory('__new__');
                  } else {
                    setCategory('produce');
                  }
                }}
                className="text-[11px] font-semibold text-[#006b2c] hover:underline cursor-pointer"
              >
                {isNewCategory ? '← Select Existing Category' : t('enterNewCategory')}
              </button>
            </div>

            {!isNewCategory ? (
              <select
                id="edit-product-category"
                value={category}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setIsNewCategory(true);
                  } else {
                    setCategory(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c] cursor-pointer"
              >
                {dynamicCategories.map((catId) => {
                  const std = STANDARD_CATEGORY_OPTIONS.find((s) => s.id === catId);
                  const label = std
                    ? catId === 'produce'
                      ? t('catProduce')
                      : catId === 'dairy'
                      ? t('catDairy')
                      : catId === 'bakery'
                      ? t('catBakery')
                      : catId === 'beverages'
                      ? t('catBeverages')
                      : catId === 'snacks'
                      ? t('catSnacks')
                      : t('catGrains')
                    : catId;
                  return (
                    <option key={catId} value={catId}>
                      {label}
                    </option>
                  );
                })}
                <option value="__new__">{t('enterNewCategory')}</option>
              </select>
            ) : (
              <input
                id="edit-product-new-category-input"
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={t('newCategoryPlaceholder')}
                className="w-full px-3 py-2 text-[13px] border border-[#006b2c] rounded-lg bg-[#f8fff9] text-[#0b1c30] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                autoFocus
              />
            )}
          </div>

          {/* 4. Product Image Upload & Preview */}
          <div className="space-y-2 border border-[#e2e8f0] rounded-xl p-3.5 bg-[#f8fafc]">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-semibold text-[#0b1c30] flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-[#006b2c]" />
                <span>{t('imagePreview')}</span>
              </label>
              <span className="text-[11px] text-[#565e74]">
                {t('imageUploadHint')}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Image Preview Thumbnail */}
              <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#cbd5e1] bg-white shadow-2xs shrink-0 flex items-center justify-center">
                <img
                  id="edit-product-image-preview"
                  src={imagePreview || image || DEFAULT_FALLBACK_IMAGE}
                  alt="Product preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = DEFAULT_FALLBACK_IMAGE;
                  }}
                />
              </div>

              {/* Upload Button and URL Fallback */}
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    id="edit-product-file-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    id="trigger-image-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] text-[#006b2c] text-[12px] font-semibold border border-[#cbdcfc] flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t('uploadNewImage')}</span>
                  </button>
                  <span className="text-[11px] text-[#64748b]">PNG, JPG, WebP</span>
                </div>

                <input
                  id="edit-product-image-url"
                  type="url"
                  value={image.startsWith('data:') ? '' : image}
                  onChange={(e) => {
                    setImage(e.target.value);
                    setImagePreview(e.target.value);
                  }}
                  placeholder="Or paste remote image URL (https://...)"
                  className="w-full px-2.5 py-1 text-[11px] border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden focus:ring-1 focus:ring-[#006b2c]"
                />
              </div>
            </div>
          </div>

          {/* 5. Quantity & 7. Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 5. Quantity (Increase, Decrease, Direct Edit) */}
            <div className="space-y-1">
              <label htmlFor="edit-product-stock-qty" className="text-[12px] font-semibold text-[#0b1c30]">
                {t('stockQuantityLabel')}
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="edit-qty-decrement-btn"
                  title="Decrease quantity by 1"
                  disabled={quantity <= 0}
                  onClick={() => handleQuantityDelta(-1)}
                  className="w-8 h-8 rounded-lg bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0b1c30] flex items-center justify-center font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  id="edit-product-stock-qty"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setQuantity(isNaN(val) ? 0 : Math.max(0, val));
                  }}
                  className="flex-1 px-2 py-1.5 text-[13px] font-bold text-center tabular-nums border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                />
                <button
                  type="button"
                  id="edit-qty-increment-btn"
                  title="Increase quantity by 1"
                  onClick={() => handleQuantityDelta(1)}
                  className="w-8 h-8 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] text-[#006b2c] flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 7. Price in Indian Rupees (₹) */}
            <div className="space-y-1">
              <label htmlFor="edit-product-price" className="text-[12px] font-semibold text-[#0b1c30]">
                {t('priceLabel')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-[14px] font-bold text-[#64748b]">
                  ₹
                </span>
                <input
                  id="edit-product-price"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 120"
                  className="w-full pl-7 pr-3 py-1.5 text-[13px] font-bold tabular-nums border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                />
              </div>
            </div>
          </div>

          {/* 6. Unit / Pack Size */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="edit-product-unit" className="text-[12px] font-semibold text-[#0b1c30]">
                {t('unitPackSizeLabel')}
              </label>
              <button
                type="button"
                id="toggle-custom-unit-btn"
                onClick={() => setIsCustomUnit(!isCustomUnit)}
                className="text-[11px] font-semibold text-[#006b2c] hover:underline cursor-pointer"
              >
                {isCustomUnit ? t('switchToStandardUnits') : t('enterCustomUnitBtn')}
              </button>
            </div>

            {!isCustomUnit ? (
              <select
                id="edit-product-unit"
                value={unit}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setIsCustomUnit(true);
                  } else {
                    setUnit(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c] cursor-pointer font-semibold"
              >
                {STANDARD_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
                <option value="custom">{t('enterCustomUnitBtn')}</option>
              </select>
            ) : (
              <input
                id="edit-product-custom-unit"
                type="text"
                required
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="e.g. 1 kg, 500 g, 250 g, 100 g, 1 litre, 500 ml, 1 piece, packet, box"
                className="w-full px-3 py-2 text-[13px] border border-[#006b2c] rounded-lg bg-[#f8fff9] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                autoFocus
              />
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label htmlFor="edit-product-description" className="text-[12px] font-semibold text-[#0b1c30]">
              {t('productDescriptionLabel')}
            </label>
            <textarea
              id="edit-product-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('productDescriptionPlaceholder')}
              className="w-full px-3 py-1.5 text-[12px] border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-[#e2e8f0] flex items-center justify-end gap-2">
            <button
              type="button"
              id="cancel-edit-btn"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0b1c30] transition-colors cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              id="save-edit-product-btn"
              className="px-5 py-2 rounded-lg bg-[#006b2c] hover:bg-[#00873a] text-white text-[13px] font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{t('saveChanges')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
