import React, { useState } from 'react';
import { Product } from '../types';
import { X, Plus, Image as ImageIcon, Sparkles } from 'lucide-react';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProduct: (product: Product) => void;
}

const CATEGORY_OPTIONS: { id: Product['category']; label: string; aisle: string }[] = [
  { id: 'produce', label: 'Fruits & Vegetables', aisle: 'Fruits & Veggies' },
  { id: 'dairy', label: 'Dairy & Eggs', aisle: 'Dairy & Eggs' },
  { id: 'bakery', label: 'Bakery', aisle: 'Bakery & Bread' },
  { id: 'beverages', label: 'Beverages', aisle: 'Beverages' },
  { id: 'snacks', label: 'Snacks', aisle: 'Snacks' },
  { id: 'grains', label: 'Rice & Grains', aisle: 'Rice & Grains' },
];

export const STANDARD_UNITS = [
  'kg',
  'g',
  'litre',
  'ml',
  'piece',
  'packet',
  'dozen',
  'box',
] as const;

const PRESET_IMAGES = [
  {
    name: 'Rice / Grains',
    url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
    category: 'grains' as const,
    unit: 'kg',
  },
  {
    name: 'Milk / Dairy',
    url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80',
    category: 'dairy' as const,
    unit: 'litre',
  },
  {
    name: 'Eggs',
    url: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=600&q=80',
    category: 'dairy' as const,
    unit: 'dozen',
  },
  {
    name: 'Bread',
    url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
    category: 'bakery' as const,
    unit: 'packet',
  },
  {
    name: 'Apples / Fruits',
    url: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80',
    category: 'produce' as const,
    unit: 'kg',
  },
  {
    name: 'Vegetables',
    url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
    category: 'produce' as const,
    unit: 'kg',
  },
  {
    name: 'Beverage / Juice',
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
    category: 'beverages' as const,
    unit: 'ml',
  },
  {
    name: 'Snacks / Box',
    url: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=600&q=80',
    category: 'snacks' as const,
    unit: 'box',
  },
];

const DEFAULT_FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80';

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  onAddProduct,
}) => {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState<string>('99');
  const [quantity, setQuantity] = useState<string>('25');
  const [unit, setUnit] = useState<string>('kg');
  const [category, setCategory] = useState<Product['category']>('produce');
  const [image, setImage] = useState(PRESET_IMAGES[0].url);
  const [description, setDescription] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleApplyPreset = (preset: typeof PRESET_IMAGES[0]) => {
    setImage(preset.url);
    setCategory(preset.category);
    setUnit(preset.unit);
    setIsCustomUnit(false);
    if (!description) {
      setDescription(`Farm fresh ${preset.name.toLowerCase()} sourced daily from local organic producers.`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please enter a product name.');
      return;
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      setError('Please enter a valid price greater than ₹0.');
      return;
    }

    const numericQty = parseInt(quantity, 10);
    if (isNaN(numericQty) || numericQty < 0) {
      setError('Quantity cannot be negative.');
      return;
    }

    const selectedUnit = isCustomUnit ? customUnit.trim() : unit;
    if (!selectedUnit) {
      setError('Please specify a product unit.');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a brief description of the product.');
      return;
    }

    const categoryObj = CATEGORY_OPTIONS.find((c) => c.id === category);

    const newProduct: Product = {
      id: `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: title.trim(),
      supplier: 'Local Farm Direct',
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      price: numericPrice,
      unit: selectedUnit,
      stock: Math.max(0, numericQty),
      badge: 'Fresh Harvest',
      image: image.trim() || DEFAULT_FALLBACK_IMAGE,
      category,
      categoryLabel: categoryObj?.aisle || 'Fresh Produce',
      description: description.trim(),
      isOrganic: true,
      isQuickPrep: true,
      farmOrigin: 'Central Valley Organic Hub',
      harvestDate: 'Fresh Morning Stock',
      tempRequirement: 'Ambient / Cold-Chain Controlled',
      batchNumber: `LOT-2026-${Date.now().toString().slice(-4)}`,
      expiryDate: 'Fresh Daily Stock',
    };

    onAddProduct(newProduct);
    onClose();

    // Reset form
    setTitle('');
    setPrice('99');
    setQuantity('25');
    setUnit('kg');
    setDescription('');
    setIsCustomUnit(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-[#e2e8f0] flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#006b2c] text-white flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-[#0b1c30] font-display">
                Add New Product
              </h2>
              <p className="text-[11px] text-[#565e74]">
                New products will automatically appear on the customer storefront.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-[#565e74] hover:bg-[#e2e8f0] hover:text-[#0b1c30] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-[#fee2e2] text-[#b91c1c] text-[12px] font-semibold border border-[#fecaca]">
              {error}
            </div>
          )}

          {/* Product Name */}
          <div className="space-y-1">
            <label className="text-[12px] font-semibold text-[#0b1c30]">
              Product Name *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Organic Basmati Rice, Fresh Farm Milk, Brown Eggs"
              className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
            />
          </div>

          {/* Category & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-[#0b1c30]">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Product['category'])}
                className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c] cursor-pointer"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-[#0b1c30]">
                Unit of Sale *
              </label>
              {!isCustomUnit ? (
                <div className="flex gap-1.5">
                  <select
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
                    <option value="custom">+ Other (Custom Unit)</option>
                  </select>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    placeholder="e.g. bunch, tray, pack"
                    className="flex-1 px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                  />
                  <button
                    type="button"
                    onClick={() => setIsCustomUnit(false)}
                    className="px-2.5 py-1 text-[11px] text-[#565e74] hover:text-[#0b1c30] underline cursor-pointer"
                  >
                    Standard
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Price & Quantity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-[#0b1c30]">
                Price in Indian Rupees (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-[14px] font-bold text-[#64748b]">
                  ₹
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 80"
                  className="w-full pl-7 pr-3 py-2 text-[13px] font-bold tabular-nums border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-[#0b1c30]">
                Initial Available Quantity *
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 50"
                className="w-full px-3 py-2 text-[13px] font-bold tabular-nums border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
              />
            </div>
          </div>

          {/* Image & Quick Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[12px] font-semibold text-[#0b1c30] flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-[#006b2c]" />
                Product Image URL *
              </label>
              <span className="text-[11px] text-[#64748b] flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#006b2c]" />
                Quick presets below
              </span>
            </div>

            <div className="flex gap-2 items-center">
              <input
                type="url"
                required
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="flex-1 px-3 py-2 text-[12px] border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
              />
              <img
                src={image || DEFAULT_FALLBACK_IMAGE}
                alt="Preview"
                className="w-10 h-10 rounded-lg object-cover border border-[#cbd5e1] bg-[#f8fafc] shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = DEFAULT_FALLBACK_IMAGE;
                }}
              />
            </div>

            {/* Quick 1-Click Preset Images */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESET_IMAGES.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                    image === preset.url
                      ? 'bg-[#eff4ff] border-[#006b2c] text-[#006b2c] font-semibold'
                      : 'bg-[#f8fafc] border-[#e2e8f0] text-[#64748b] hover:border-[#cbd5e1]'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[12px] font-semibold text-[#0b1c30]">
              Product Description *
            </label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Fresh farm harvested daily, pesticide free, packaged cleanly in recyclable container."
              className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-[#e2e8f0] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0b1c30] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#006b2c] hover:bg-[#00873a] text-white text-[13px] font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Storefront</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
