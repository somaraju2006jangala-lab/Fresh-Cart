import React, { useState } from 'react';
import { Product, InventoryLog, Coupon, CustomerOrder } from '../types';
import { USER_AVATAR_URL } from '../data/products';
import { formatINR } from '../utils/currency';
import { formatLogDateTime, formatOrderDateTime } from '../utils/date';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSelector } from './LanguageSelector';
import { AddProductModal, STANDARD_UNITS } from './AddProductModal';
import { EditProductModal } from './EditProductModal';
import { CouponModal } from './CouponModal';
import {
  Package,
  Thermometer,
  Users,
  Activity,
  ArrowLeft,
  Plus,
  RotateCcw,
  Search,
  CheckCircle,
  AlertTriangle,
  History,
  Radio,
  Edit2,
  Check,
  TrendingUp,
  Trash2,
  X,
  Tag,
  ShoppingBag,
  Copy,
  Calendar,
} from 'lucide-react';

export interface ParsedHistoryPeriod {
  type: 'all' | 'relative';
  value?: number;
  unit?: 'day' | 'week' | 'month' | 'year';
  displayMessage: string;
}

export const parseHistoryPeriod = (input: string): ParsedHistoryPeriod | null => {
  const clean = input.trim().toLowerCase();
  if (!clean) return null;

  if (clean === 'all') {
    return {
      type: 'all',
      displayMessage: 'Showing all order history.',
    };
  }

  const match = clean.match(/^(\d+)\s*(day|days|week|weeks|month|months|year|years)?$/);
  if (!match) return null;

  const count = parseInt(match[1], 10);
  if (isNaN(count) || count <= 0) return null;

  const rawUnit = match[2] || 'week';
  let unit: 'day' | 'week' | 'month' | 'year' = 'week';
  let unitText = '';

  if (rawUnit.startsWith('day')) {
    unit = 'day';
    unitText = count === 1 ? '1 day' : `${count} days`;
  } else if (rawUnit.startsWith('week')) {
    unit = 'week';
    unitText = count === 1 ? '1 week' : `${count} weeks`;
  } else if (rawUnit.startsWith('month')) {
    unit = 'month';
    unitText = count === 1 ? '1 month' : `${count} months`;
  } else if (rawUnit.startsWith('year')) {
    unit = 'year';
    unitText = count === 1 ? '1 year' : `${count} years`;
  }

  return {
    type: 'relative',
    value: count,
    unit,
    displayMessage: `Showing orders from the last ${unitText}.`,
  };
};

export const getCutoffDate = (period: ParsedHistoryPeriod): Date | null => {
  if (period.type === 'all' || !period.value || !period.unit) {
    return null;
  }
  const now = new Date();
  if (period.unit === 'day') {
    return new Date(now.getTime() - period.value * 24 * 60 * 60 * 1000);
  }
  if (period.unit === 'week') {
    return new Date(now.getTime() - period.value * 7 * 24 * 60 * 60 * 1000);
  }
  if (period.unit === 'month') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - period.value);
    return d;
  }
  if (period.unit === 'year') {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - period.value);
    return d;
  }
  return null;
};

export const parseOrderDate = (createdAt?: string | Date | number): Date | null => {
  if (!createdAt) return null;
  if (createdAt instanceof Date) return isNaN(createdAt.getTime()) ? null : createdAt;
  if (typeof createdAt === 'number') {
    const d = new Date(createdAt);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = String(createdAt).trim();
  const direct = new Date(str);
  if (!isNaN(direct.getTime())) return direct;

  const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
      if (timeMatch[3]) seconds = parseInt(timeMatch[3], 10);
      const ampm = timeMatch[4]?.toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
    }
    const d = new Date(year, month, day, hours, minutes, seconds);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

interface AdminPortalProps {
  products: Product[];
  inventoryLogs: InventoryLog[];
  coupons: Coupon[];
  customerOrders?: CustomerOrder[];
  onBackToStorefront: () => void;
  onUpdateProductStock: (productId: string, newStock: number, reason: string) => void;
  onUpdateProductPrice: (productId: string, newPrice: number) => void;
  onUpdateProductUnit: (productId: string, newUnit: string) => void;
  onAddProduct: (product: Product) => void;
  onEditProduct?: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onSimulateCdcPulse: () => void;
  onCreateCoupon: (couponData: Omit<Coupon, 'id'>) => void;
  onUpdateCoupon: (coupon: Coupon) => void;
  onDeleteCoupon: (couponId: string) => void;
  onToggleCoupon: (couponId: string) => void;
  onDeleteInventoryLog?: (logId: string) => void;
  onClearInventoryLogs?: () => void;
  onUpdateOrderStatus?: (orderId: string, status: string) => void;
  onDeleteCustomerOrder?: (orderId: string) => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  products,
  inventoryLogs,
  coupons,
  customerOrders = [],
  onBackToStorefront,
  onUpdateProductStock,
  onUpdateProductPrice,
  onUpdateProductUnit,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onSimulateCdcPulse,
  onCreateCoupon,
  onUpdateCoupon,
  onDeleteCoupon,
  onToggleCoupon,
  onDeleteInventoryLog,
  onClearInventoryLogs,
  onUpdateOrderStatus,
  onDeleteCustomerOrder,
}) => {
  const { t } = useLanguage();
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStockStatus, setFilterStockStatus] = useState('all');
  const [adminSearch, setAdminSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'inventory' | 'logs' | 'coupons' | 'orders'>('inventory');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [historySearchInput, setHistorySearchInput] = useState<string>('');
  const [activeHistoryPeriod, setActiveHistoryPeriod] = useState<ParsedHistoryPeriod | null>(null);
  const [historySearchError, setHistorySearchError] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<number>(0);
  const [editingCustomUnitId, setEditingCustomUnitId] = useState<string | null>(null);
  const [customUnitInput, setCustomUnitInput] = useState<string>('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deleteConfirmCoupon, setDeleteConfirmCoupon] = useState<Coupon | null>(null);
  const [deleteConfirmLog, setDeleteConfirmLog] = useState<InventoryLog | null>(null);
  const [showClearLogsConfirm, setShowClearLogsConfirm] = useState(false);
  const [pulseToast, setPulseToast] = useState<string | null>(null);

  const customCategories = Array.from(
    new Set(products.map((p) => p.category))
  ).filter((c) => !['produce', 'dairy', 'bakery', 'beverages', 'snacks', 'grains'].includes(c));

  const allCatalogCategories = Array.from(new Set(products.map((p) => p.category)));

  const totalSkus = products.length;
  const lowStockCount = products.filter((p) => p.stock > 0 && p.stock <= 5).length;
  const outOfStockCount = products.filter((p) => p.stock === 0).length;

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(adminSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(adminSearch.toLowerCase()) ||
      p.supplier.toLowerCase().includes(adminSearch.toLowerCase());

    const matchesCategory =
      filterCategory === 'all' || p.category === filterCategory;

    const matchesStock =
      filterStockStatus === 'all' ||
      (filterStockStatus === 'low' && p.stock > 0 && p.stock <= 5) ||
      (filterStockStatus === 'out' && p.stock === 0) ||
      (filterStockStatus === 'healthy' && p.stock > 5);

    return matchesSearch && matchesCategory && matchesStock;
  });

  const formatOrderProductItem = (item: { product: Product; quantity: number }) => {
    const qty = item.quantity;
    const unit = item.product.unit || 'unit';
    let unitFormatted = '';

    if (qty === 1) {
      unitFormatted = unit;
    } else if (/^1\s+[a-zA-Z]+$/i.test(unit)) {
      // e.g. "1 kg" -> "2 kg", "1 dozen" -> "2 dozen"
      const unitName = unit.replace(/^1\s+/i, '');
      unitFormatted = `${qty} ${unitName}`;
    } else {
      // e.g. "500 ml" -> "2 × 500 ml", "piece" -> "2 × piece"
      unitFormatted = `${qty} × ${unit}`;
    }

    const linePrice = formatINR(item.product.price * qty);
    return {
      title: item.product.title,
      qtyAndUnit: unitFormatted,
      linePrice,
      lineText: `${item.product.title} — ${unitFormatted} — ${linePrice}`,
    };
  };

  const handleCustomHistorySearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = historySearchInput.trim();
    if (!trimmed) {
      setHistorySearchError("Please enter a period, e.g. '1 week', '3 months', '6 months', '1 year', or 'all'.");
      return;
    }
    const parsed = parseHistoryPeriod(trimmed);
    if (!parsed) {
      setHistorySearchError("Invalid period. Please enter e.g. '1 week', '2 weeks', '3 months', '6 months', '1 year', or 'all'.");
      return;
    }
    setHistorySearchError(null);
    setActiveHistoryPeriod(parsed);
  };

  const handleClearHistorySearch = () => {
    setHistorySearchInput('');
    setActiveHistoryPeriod(null);
    setHistorySearchError(null);
  };

  const periodDisplayMessage = activeHistoryPeriod ? activeHistoryPeriod.displayMessage : null;

  const filteredOrders = customerOrders
    .filter((order) => {
      const q = orderSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        order.id.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        (order.customerId && order.customerId.toLowerCase().includes(q)) ||
        (order.customerEmail && order.customerEmail.toLowerCase().includes(q)) ||
        order.items.some((it) => it.product.title.toLowerCase().includes(q));

      const matchesStatus =
        orderStatusFilter === 'all' ||
        order.status.toLowerCase() === orderStatusFilter.toLowerCase();

      if (activeHistoryPeriod) {
        const cutoff = getCutoffDate(activeHistoryPeriod);
        if (cutoff) {
          const orderDate = parseOrderDate(order.createdAt);
          if (!orderDate) return false;
          if (orderDate.getTime() < cutoff.getTime()) {
            return false;
          }
        }
      }

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const timeA = parseOrderDate(a.createdAt)?.getTime() || 0;
      const timeB = parseOrderDate(b.createdAt)?.getTime() || 0;
      return timeB - timeA;
    });

  const handleStartEditPrice = (product: Product) => {
    setEditingPriceId(product.id);
    setTempPrice(product.price);
  };

  const handleSavePrice = (productId: string) => {
    if (tempPrice > 0) {
      onUpdateProductPrice(productId, tempPrice);
    }
    setEditingPriceId(null);
  };

  const handleSaveCustomUnit = (productId: string) => {
    const trimmed = customUnitInput.trim();
    if (trimmed) {
      onUpdateProductUnit(productId, trimmed);
      const prod = products.find((p) => p.id === productId);
      setPulseToast(`Updated unit for "${prod?.title || 'product'}" to "${trimmed}"`);
      setTimeout(() => setPulseToast(null), 2500);
    }
    setEditingCustomUnitId(null);
  };

  const handleTriggerPulse = () => {
    onSimulateCdcPulse();
    setPulseToast('MongoDB CDC Pulse Broadcast: Store #104 stock synchronized in 18ms');
    setTimeout(() => setPulseToast(null), 3500);
  };

  return (
    <div className="w-full min-h-screen bg-[#f8fafc] text-[#0b1c30] pb-16">
      {/* Top Admin Action Bar */}
      <div className="bg-[#1e293b] text-white py-3 px-4 sm:px-6 shadow-md border-b border-[#334155]">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToStorefront}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#334155] hover:bg-[#475569] text-[12px] font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('backToStorefrontBtn')}</span>
            </button>
            <div className="h-4 w-px bg-[#475569] hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
              <span className="text-[13px] font-bold tracking-tight">
                {t('adminStoreTitle')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Language Selector in Admin Portal */}
            <LanguageSelector variant="dark" idPrefix="admin-lang" />

            <button
              type="button"
              onClick={handleTriggerPulse}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-semibold shadow-xs transition-colors cursor-pointer"
              title="Simulate incoming order sale and live stock countdown"
            >
              <Radio className="w-3.5 h-3.5 text-[#7ffc97] animate-pulse" />
              <span>{t('simulateCdcPulse')}</span>
            </button>

            <div className="flex items-center gap-2 pl-2">
              <img
                src={USER_AVATAR_URL}
                alt="Sarah L."
                className="w-8 h-8 rounded-full object-cover border border-[#475569]"
              />
              <div className="hidden sm:block text-left">
                <p className="text-[12px] font-semibold leading-tight">Sarah L.</p>
                <p className="text-[10px] text-[#94a3b8] leading-tight">{t('opsManager')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {pulseToast && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3">
          <div className="bg-[#dcfce7] border border-[#86efac] text-[#15803d] px-4 py-2 rounded-xl text-[12px] font-semibold flex items-center justify-between shadow-xs animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#16a34a]" />
              <span>{pulseToast}</span>
            </div>
            <button onClick={() => setPulseToast(null)} className="text-[#16a34a]">
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12px] text-[#64748b] font-medium block">
                {t('totalSkusMonitored')}
              </span>
              <span className="text-[28px] font-extrabold text-[#0f172a] font-display tabular-nums">
                {totalSkus}
              </span>
              <div className="text-[11px] text-[#16a34a] flex items-center gap-1 font-semibold mt-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{t('activeMongodbSync')}</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#eff4ff] text-[#006b2c] flex items-center justify-center">
              <Package className="w-6 h-6 text-[#006b2c]" />
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12px] text-[#64748b] font-medium block">
                {t('coldChainPodTemp')}
              </span>
              <span className="text-[28px] font-extrabold text-[#0f172a] font-display tabular-nums">
                3.8°C
              </span>
              <div className="text-[11px] text-[#16a34a] font-semibold mt-1 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                <span>{t('optimalTempRange')}</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#fef3c7] text-[#825100] flex items-center justify-center">
              <Thermometer className="w-6 h-6 text-[#825100]" />
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12px] text-[#64748b] font-medium block">
                {t('stockWarnings')}
              </span>
              <span className="text-[28px] font-extrabold text-[#b45309] font-display tabular-nums">
                {lowStockCount + outOfStockCount}
              </span>
              <div className="text-[11px] text-[#64748b] font-medium mt-1">
                {t('stockWarningDetail', { low: lowStockCount, out: outOfStockCount })}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#fee2e2] text-[#ef4444] flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-[#ef4444]" />
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12px] text-[#64748b] font-medium block">
                {t('activePickersRunners')}
              </span>
              <span className="text-[28px] font-extrabold text-[#0f172a] font-display tabular-nums">
                12
              </span>
              <div className="text-[11px] text-[#16a34a] font-semibold mt-1">
                {t('avgPackTime')}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#eff4ff] text-[#006b2c] flex items-center justify-center">
              <Users className="w-6 h-6 text-[#006b2c]" />
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-[#e2e8f0] gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`pb-3 text-[13px] font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'inventory'
                ? 'border-[#006b2c] text-[#006b2c]'
                : 'border-transparent text-[#64748b] hover:text-[#0b1c30]'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>{t('tabLiveInventory', { count: products.length })}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`pb-3 text-[13px] font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'logs'
                ? 'border-[#006b2c] text-[#006b2c]'
                : 'border-transparent text-[#64748b] hover:text-[#0b1c30]'
            }`}
          >
            <History className="w-4 h-4" />
            <span>{t('tabCdcLogs')}</span>
          </button>
          <button
            type="button"
            id="admin-tab-coupons"
            onClick={() => setActiveTab('coupons')}
            className={`pb-3 text-[13px] font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'coupons'
                ? 'border-[#006b2c] text-[#006b2c]'
                : 'border-transparent text-[#64748b] hover:text-[#0b1c30]'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>{t('tabCoupons', { count: coupons.length })}</span>
          </button>
          <button
            type="button"
            id="admin-tab-orders"
            onClick={() => setActiveTab('orders')}
            className={`pb-3 text-[13px] font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'orders'
                ? 'border-[#006b2c] text-[#006b2c]'
                : 'border-transparent text-[#64748b] hover:text-[#0b1c30]'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>{t('tabCustomerOrders', { count: customerOrders.length }) || `Customer Orders (${customerOrders.length})`}</span>
          </button>
        </div>

        {/* Tab 1: Inventory Table */}
        {activeTab === 'inventory' && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-xs overflow-hidden space-y-4 p-4 sm:p-5">
            {/* Table Filters & Actions */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#94a3b8]" />
                <input
                  type="text"
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  placeholder={t('filterSkuPlaceholder')}
                  className="w-full pl-9 pr-3 py-1.5 text-[13px] border border-[#cbd5e1] rounded-lg bg-[#f8fafc] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-1.5 text-[12px] border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden"
                >
                  <option value="all">{t('allAisles')}</option>
                  <option value="produce">{t('catProduce')}</option>
                  <option value="dairy">{t('catDairy')}</option>
                  <option value="bakery">{t('catBakery')}</option>
                  <option value="beverages">{t('catBeverages')}</option>
                  <option value="snacks">{t('catSnacks')}</option>
                  <option value="grains">{t('catGrains')}</option>
                  {customCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  value={filterStockStatus}
                  onChange={(e) => setFilterStockStatus(e.target.value)}
                  className="px-3 py-1.5 text-[12px] border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden"
                >
                  <option value="all">{t('allStockStatuses')}</option>
                  <option value="healthy">{t('inStockOption')}</option>
                  <option value="low">{t('lowStockOption')}</option>
                  <option value="out">{t('outOfStockOption')}</option>
                </select>

                <button
                  type="button"
                  id="admin-add-product-btn"
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('addNewProductBtn')}</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="bg-[#f8fafc] text-[#64748b] border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">{t('tableHeaderItem')}</th>
                    <th className="py-3 px-4">{t('tableHeaderSku')}</th>
                    <th className="py-3 px-4">{t('tableHeaderCategory')}</th>
                    <th className="py-3 px-4">{t('tableHeaderPrice')}</th>
                    <th className="py-3 px-4">{t('tableHeaderUnit')}</th>
                    <th className="py-3 px-4">{t('tableHeaderQuantity')}</th>
                    <th className="py-3 px-4">{t('tableHeaderStatus')}</th>
                    <th className="py-3 px-4 text-right">{t('tableHeaderActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {filteredProducts.map((p) => {
                    const isLow = p.stock > 0 && p.stock <= 5;
                    const isOut = p.stock === 0;

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-[#f8fafc]/80 transition-colors group"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={p.image}
                              alt={p.title}
                              className="w-10 h-10 rounded-lg object-cover bg-[#f1f5f9] shrink-0 border border-[#e2e8f0]"
                            />
                            <div>
                              <span className="font-semibold text-[#0f172a] block">
                                {p.title}
                              </span>
                              <span className="text-[11px] text-[#64748b]">
                                {p.supplier}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono text-[12px] font-semibold text-[#475569] bg-[#f1f5f9] px-2 py-0.5 rounded">
                            {p.sku}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="capitalize text-[12px] font-medium text-[#475569]">
                            {p.category}
                          </span>
                        </td>

                        {/* Price Column with inline edit */}
                        <td className="py-3 px-4">
                          {editingPriceId === p.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[12px] font-bold text-[#64748b]">₹</span>
                              <input
                                type="number"
                                min="1"
                                value={tempPrice}
                                onChange={(e) => setTempPrice(Math.max(1, parseInt(e.target.value, 10) || 0))}
                                className="w-16 px-1.5 py-0.5 text-[12px] font-bold border border-[#006b2c] rounded bg-white text-[#0b1c30] focus:outline-hidden"
                                autoFocus
                              />
                              <button
                                type="button"
                                title="Save price"
                                onClick={() => handleSavePrice(p.id)}
                                className="p-1 rounded bg-[#006b2c] text-white hover:bg-[#00873a] cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEditPrice(p)}
                              className="flex items-center gap-1 font-semibold text-[#0f172a] hover:text-[#006b2c] tabular-nums font-display group/edit cursor-pointer"
                              title="Click to edit price"
                            >
                              <span>{formatINR(p.price)}</span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover/edit:opacity-100 text-[#94a3b8]" />
                            </button>
                          )}
                        </td>

                        {/* Unit Column with direct editing & custom unit support */}
                        <td className="py-3 px-4">
                          {editingCustomUnitId === p.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={customUnitInput}
                                onChange={(e) => setCustomUnitInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveCustomUnit(p.id);
                                  if (e.key === 'Escape') setEditingCustomUnitId(null);
                                }}
                                placeholder="e.g. 500 g"
                                className="w-24 px-2 py-1 text-[12px] font-bold border border-[#006b2c] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                                autoFocus
                              />
                              <button
                                type="button"
                                title="Save unit"
                                onClick={() => handleSaveCustomUnit(p.id)}
                                className="w-6 h-6 rounded-md bg-[#006b2c] text-white flex items-center justify-center hover:bg-[#00873a] cursor-pointer shrink-0"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Cancel"
                                onClick={() => setEditingCustomUnitId(null)}
                                className="w-6 h-6 rounded-md bg-[#f1f5f9] text-[#64748b] flex items-center justify-center hover:bg-[#e2e8f0] cursor-pointer shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <select
                                value={p.unit}
                                onChange={(e) => {
                                  if (e.target.value === '__custom__') {
                                    setEditingCustomUnitId(p.id);
                                    setCustomUnitInput(p.unit);
                                  } else {
                                    onUpdateProductUnit(p.id, e.target.value);
                                    setPulseToast(`Updated unit for "${p.title}" to "${e.target.value}"`);
                                    setTimeout(() => setPulseToast(null), 2500);
                                  }
                                }}
                                className="px-2 py-1 text-[12px] font-bold border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] hover:border-[#006b2c] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c] cursor-pointer"
                                title="Edit product unit / pack size"
                              >
                                {!STANDARD_UNITS.includes(p.unit as any) && (
                                  <option value={p.unit}>{p.unit} (Custom)</option>
                                )}
                                {STANDARD_UNITS.map((u) => (
                                  <option key={u} value={u}>
                                    {u}
                                  </option>
                                ))}
                                <option value="__custom__">{t('customUnitOption')}</option>
                              </select>
                              <button
                                type="button"
                                title="Enter custom unit"
                                onClick={() => {
                                  setEditingCustomUnitId(p.id);
                                  setCustomUnitInput(p.unit);
                                }}
                                className="w-6 h-6 rounded-md hover:bg-[#f1f5f9] text-[#94a3b8] hover:text-[#006b2c] flex items-center justify-center cursor-pointer transition-colors shrink-0"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              title="Decrease quantity by 1"
                              disabled={p.stock <= 0}
                              onClick={() => onUpdateProductStock(p.id, Math.max(0, p.stock - 1), 'Admin Stock Decrement')}
                              className="w-7 h-7 rounded-lg bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#0b1c30] flex items-center justify-center font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={p.stock}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                const newStock = isNaN(val) ? 0 : Math.max(0, val);
                                onUpdateProductStock(p.id, newStock, 'Admin Quantity Direct Edit');
                              }}
                              className="w-16 px-2 py-1 border border-[#cbd5e1] rounded-lg text-center font-bold tabular-nums text-[13px] bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                              title="Directly edit quantity (must never go below 0)"
                            />
                            <button
                              type="button"
                              title="Increase quantity by 1"
                              onClick={() => onUpdateProductStock(p.id, p.stock + 1, 'Admin Stock Increment')}
                              className="w-7 h-7 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] text-[#006b2c] flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {isOut ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fee2e2] text-[#b91c1c] text-[11px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
                              {t('outOfStockStatus')}
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#b45309] text-[11px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                              {t('lowStockStatus')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#15803d] text-[11px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
                              {t('healthyStatus')}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              id={`edit-product-btn-${p.id}`}
                              title={`Edit ${p.title}`}
                              onClick={() => setEditingProduct(p)}
                              className="px-2.5 py-1 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] text-[#006b2c] text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer border border-[#cbdcfc]"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-[#006b2c]" />
                              <span>{t('editProductBtn')}</span>
                            </button>
                            <button
                              type="button"
                              title={`Delete ${p.title} from store`}
                              onClick={() => setDeleteConfirmProduct(p)}
                              className="px-2.5 py-1 rounded-lg bg-[#fee2e2] hover:bg-[#fecaca] text-[#b91c1c] text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-[#ef4444]" />
                              <span>{t('deleteBtn')}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Logs */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#e2e8f0]">
              <div>
                <h3 className="text-[16px] font-bold text-[#0f172a] font-display">
                  {t('cdcLedgerHeading')}
                </h3>
                <p className="text-[12px] text-[#64748b]">
                  {t('cdcLedgerSubheading')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {inventoryLogs.length > 0 && (
                  <button
                    type="button"
                    id="clear-logs-btn"
                    onClick={() => setShowClearLogsConfirm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ef4444]/30 text-[#b91c1c] hover:bg-[#fee2e2]/60 text-[12px] font-semibold transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#ef4444]" />
                    <span>Clear Logs</span>
                  </button>
                )}
                <span className="px-2.5 py-1 rounded-full bg-[#dcfce7] text-[#15803d] text-[11px] font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-ping" />
                  {t('clusterHealthy')}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {inventoryLogs.length === 0 ? (
                <div className="p-8 text-center text-[#64748b] text-[13px] bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
                  No CDC log records found.
                </div>
              ) : (
                inventoryLogs.map((log) => {
                  const logDt = formatLogDateTime(log);
                  return (
                    <div
                      key={log.id}
                      id={`cdc-log-${log.id}`}
                      className="p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-between text-[12px] gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 ${
                            log.changeType === 'RESTOCK'
                              ? 'bg-[#dcfce7] text-[#15803d]'
                              : log.changeType === 'SALE'
                              ? 'bg-[#e0e7ff] text-[#4338ca]'
                              : 'bg-[#fef3c7] text-[#b45309]'
                          }`}
                        >
                          {log.changeType}
                        </span>
                        <div className="min-w-0">
                          <span className="font-semibold text-[#0f172a] truncate block">
                            {log.productTitle} ({log.sku})
                          </span>
                          <span className="text-[#64748b] block text-[11px] truncate">
                            {log.notes} · Operator: {log.operator}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span
                            className={`font-bold tabular-nums block ${
                              log.quantityChange > 0 ? 'text-[#16a34a]' : 'text-[#ef4444]'
                            }`}
                          >
                            {log.quantityChange > 0 ? `+${log.quantityChange}` : log.quantityChange}
                          </span>
                          <div className="text-[10px] text-[#64748b] leading-tight font-medium mt-0.5 whitespace-nowrap">
                            <span className="block">DATE :{logDt.date}</span>
                            <span className="block">TIME:{logDt.time}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          id={`delete-log-btn-${log.id}`}
                          title="Delete log record"
                          onClick={() => setDeleteConfirmLog(log)}
                          className="p-1.5 rounded-lg text-[#94a3b8] hover:text-[#ef4444] hover:bg-[#fee2e2]/60 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}


        {/* Tab 4: Coupons Management */}
        {activeTab === 'coupons' && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-xs p-4 sm:p-5 space-y-4">
            {/* Top action bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#e2e8f0]">
              <div>
                <h3 className="text-[17px] font-bold text-[#0f172a] font-display flex items-center gap-2">
                  <Tag className="w-5 h-5 text-[#006b2c]" />
                  <span>{t('couponsManagementTitle')}</span>
                </h3>
                <p className="text-[12px] text-[#565e74] mt-0.5">
                  {t('couponsManagementSubtitle')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#565e74] hidden md:inline">
                  {t('activeCouponsCount', {
                    active: coupons.filter((c) => c.isActive).length,
                    total: coupons.length,
                  })}
                </span>
                <button
                  type="button"
                  id="admin-create-coupon-btn"
                  onClick={() => {
                    setEditingCoupon(null);
                    setIsCouponModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('createCouponBtn')}</span>
                </button>
              </div>
            </div>

            {/* Coupons Table */}
            {coupons.length === 0 ? (
              <div className="text-center py-12 text-[#565e74]">
                <Tag className="w-10 h-10 mx-auto text-[#cbd5e1] mb-2" />
                <p className="text-[13px] font-medium">{t('noCouponsAvailable')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="bg-[#f8fafc] text-[#64748b] border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">{t('couponCodeLabel')}</th>
                      <th className="py-3 px-4">Min Order Amount</th>
                      <th className="py-3 px-4">{t('discountPercentageLabel')}</th>
                      <th className="py-3 px-4">{t('couponDescriptionLabel')} & Validity</th>
                      <th className="py-3 px-4">{t('couponStatusLabel')}</th>
                      <th className="py-3 px-4 text-right">{t('tableHeaderActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {coupons.map((coupon) => (
                      <tr
                        key={coupon.id}
                        id={`coupon-row-${coupon.id}`}
                        className="hover:bg-[#f8fafc]/80 transition-colors"
                      >
                        {/* Coupon Code */}
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-[13px] text-[#006b2c] bg-[#eff4ff] border border-[#d3e4fe] px-2.5 py-1 rounded-lg">
                            {coupon.code}
                          </span>
                        </td>

                        {/* Minimum Order Amount */}
                        <td className="py-3 px-4">
                          <span className="font-bold text-[13px] text-[#0b1c30] tabular-nums">
                            {formatINR(coupon.minOrderAmount || 0)}
                          </span>
                        </td>

                        {/* Discount Percentage */}
                        <td className="py-3 px-4">
                          <span className="font-extrabold text-[14px] text-[#0f172a] font-display tabular-nums">
                            {coupon.discountPercentage}% OFF
                          </span>
                        </td>

                        {/* Description & Validity */}
                        <td className="py-3 px-4 text-[12px] text-[#565e74]">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-[#0b1c30]">{coupon.description || '—'}</span>
                            {(coupon.startDate || coupon.expiryDate) && (
                              <span className="text-[10.5px] text-[#64748b]">
                                Validity: {coupon.startDate || 'Immediate'} to {coupon.expiryDate || 'No expiry'}
                              </span>
                            )}
                            {coupon.maxUses && (
                              <span className="text-[10.5px] text-[#006b2c] font-medium">
                                Max uses: {coupon.maxUses}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status Badge & Quick Toggle */}
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            id={`toggle-coupon-${coupon.id}`}
                            title={coupon.isActive ? 'Click to disable coupon' : 'Click to enable coupon'}
                            onClick={() => {
                              onToggleCoupon(coupon.id);
                              setPulseToast(
                                `${coupon.code} is now ${coupon.isActive ? 'Disabled' : 'Active'}`
                              );
                              setTimeout(() => setPulseToast(null), 2500);
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer border ${
                              coupon.isActive
                                ? 'bg-[#dcfce7] text-[#15803d] border-[#86efac] hover:bg-[#bbf7d0]'
                                : 'bg-[#f1f5f9] text-[#64748b] border-[#cbd5e1] hover:bg-[#e2e8f0]'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                coupon.isActive ? 'bg-[#16a34a]' : 'bg-[#94a3b8]'
                              }`}
                            />
                            <span>{coupon.isActive ? t('couponActive') : t('couponDisabled')}</span>
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              id={`edit-coupon-btn-${coupon.id}`}
                              title={`Edit coupon ${coupon.code}`}
                              onClick={() => {
                                setEditingCoupon(coupon);
                                setIsCouponModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#eff4ff] hover:bg-[#dce9ff] text-[#006b2c] text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer border border-[#cbdcfc]"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-[#006b2c]" />
                              <span>{t('editCouponBtn')}</span>
                            </button>

                            <button
                              type="button"
                              id={`delete-coupon-btn-${coupon.id}`}
                              title={`Delete coupon ${coupon.code}`}
                              onClick={() => setDeleteConfirmCoupon(coupon)}
                              className="px-2.5 py-1 rounded-lg bg-[#fee2e2] hover:bg-[#fecaca] text-[#b91c1c] text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-[#ef4444]" />
                              <span>{t('deleteBtn')}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Customer Orders */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-xs overflow-hidden space-y-5 p-4 sm:p-6">
            {/* Header / Subheader */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#e2e8f0]">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#dcfce7] text-[#006b2c] flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4 text-[#006b2c]" />
                  </div>
                  <h3 className="text-[18px] font-bold text-[#0b1c30] font-display">
                    {t('customerOrdersHeading')}
                  </h3>
                </div>
                <p className="text-[12px] text-[#64748b] mt-1">
                  {t('customerOrdersSubheading')}
                </p>
              </div>

              {/* Status counter badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-[#f1f5f9] text-[#475569] text-[12px] font-bold">
                  Total: {customerOrders.length}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#dcfce7] text-[#15803d] text-[12px] font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                  Ordered: {customerOrders.filter((o) => o.status === 'Ordered').length}
                </span>
              </div>
            </div>

            {/* Filter and Search Bar: Single Horizontal Row */}
            <div className="space-y-2">
              <div className="overflow-x-auto py-0.5">
                <div
                  className="grid items-center gap-4 w-full min-w-[840px]"
                  style={{ gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)' }}
                >
                  {/* 1. Main Search Orders input on the LEFT */}
                  <div className="justify-self-start w-full max-w-[280px]">
                    <div className="relative w-full">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                      <input
                        type="text"
                        id="admin-order-search"
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        placeholder={t('filterOrdersPlaceholder')}
                        className="w-full h-8 pl-8 pr-7 py-1 border border-[#cbd5e1] rounded-md text-[12px] bg-white text-[#0b1c30] placeholder:text-[#94a3b8] focus:outline-hidden focus:ring-1.5 focus:ring-[#006b2c]/30 focus:border-[#006b2c]"
                      />
                      {orderSearch && (
                        <button
                          type="button"
                          onClick={() => setOrderSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#0b1c30]"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 2. All Order Statuses dropdown horizontally CENTERED in available area */}
                  <div className="justify-self-center">
                    <select
                      id="admin-order-status-filter"
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value)}
                      className="w-[170px] h-8 px-2.5 py-1 border border-[#cbd5e1] rounded-md text-[12px] bg-white text-[#334155] focus:outline-hidden focus:ring-1.5 focus:ring-[#006b2c]/30 focus:border-[#006b2c] cursor-pointer"
                    >
                      <option value="all">{t('allOrderStatuses')}</option>
                      <option value="Ordered">Ordered</option>
                      <option value="Picking at Pod #104">Picking at Pod #104</option>
                      <option value="Cold-Chain En Route">Cold-Chain En Route</option>
                      <option value="Delivered">Delivered</option>
                    </select>
                  </div>

                  {/* 3. Order History on the RIGHT side */}
                  <div className="justify-self-end">
                    <form
                      onSubmit={handleCustomHistorySearch}
                      className="flex items-center gap-2 shrink-0"
                    >
                      <label
                        htmlFor="admin-order-custom-history-input"
                        className="text-[12px] font-bold text-[#334155] flex items-center gap-1 shrink-0 whitespace-nowrap"
                      >
                        <Calendar className="w-3.5 h-3.5 text-[#006b2c]" />
                        <span>Order History:</span>
                      </label>

                      <div className="relative w-[130px]">
                        <input
                          type="text"
                          id="admin-order-custom-history-input"
                          value={historySearchInput}
                          onChange={(e) => {
                            setHistorySearchInput(e.target.value);
                            if (historySearchError) setHistorySearchError(null);
                          }}
                          placeholder="Enter period"
                          aria-label="Enter period"
                          className={`w-full h-8 pl-2.5 pr-7 py-1 border rounded-md text-[12px] bg-white text-[#0b1c30] placeholder:text-[#94a3b8] focus:outline-hidden focus:ring-1.5 ${
                            historySearchError
                              ? 'border-[#ef4444] focus:ring-[#ef4444]/30 focus:border-[#ef4444]'
                              : 'border-[#cbd5e1] focus:ring-[#006b2c]/30 focus:border-[#006b2c]'
                          }`}
                        />
                        <button
                          type="submit"
                          id="admin-order-custom-history-search-btn"
                          title="Search"
                          aria-label="Search order history"
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-[#006b2c] hover:text-[#005221] hover:bg-[#006b2c]/10 rounded transition-colors cursor-pointer flex items-center justify-center"
                        >
                          <Search className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {activeHistoryPeriod && (
                        <button
                          type="button"
                          id="admin-order-custom-history-clear-btn"
                          onClick={handleClearHistorySearch}
                          title="Clear period filter"
                          className="h-8 px-2.5 py-1 rounded-md bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-[#64748b] hover:text-[#0b1c30] text-[12px] font-medium transition-colors cursor-pointer shrink-0"
                        >
                          Reset
                        </button>
                      )}
                    </form>
                  </div>
                </div>
              </div>

              {/* Validation Error Message */}
              {historySearchError && (
                <div className="text-[11px] text-[#dc2626] font-medium flex items-center gap-1 justify-end pl-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>{historySearchError}</span>
                </div>
              )}

              {/* Selected Period Display Badge */}
              {periodDisplayMessage && (
                <div
                  id="order-period-display"
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#e8f5e9] border border-[#a7f3d0] text-[11px] text-[#065f46] font-medium self-end ml-auto max-w-fit"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                    <span className="font-semibold">{periodDisplayMessage}</span>
                  </div>
                  <span className="text-[11px] text-[#047857] font-bold ml-2">
                    {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'} found
                  </span>
                </div>
              )}
            </div>

            {/* Orders List / Cards */}
            {filteredOrders.length === 0 ? (
              <div className="py-16 text-center text-[#94a3b8]">
                <ShoppingBag className="w-12 h-12 mx-auto mb-2 opacity-30 text-[#006b2c]" />
                <p className="text-[14px] font-semibold text-[#475569]">
                  {activeHistoryPeriod ? 'No orders found for this period.' : t('noOrdersFound')}
                </p>
                <p className="text-[12px] text-[#94a3b8] mt-1">
                  {activeHistoryPeriod
                    ? 'No orders found for this period.'
                    : 'Orders placed by customers from the Customer Portal will appear here automatically.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => {
                  const formattedDateTime = formatOrderDateTime(order.createdAt);
                  const displayOrderId = order.id.startsWith('#') ? order.id : `#${order.id}`;

                  // Build plain text format matching user's requested specification:
                  const textLines: string[] = [
                    `Order ID: ${displayOrderId}`,
                    `Customer: ${order.customerName}`,
                    `User ID: ${order.customerId || 'N/A'}`,
                  ];
                  if (order.customerEmail) {
                    textLines.push(`Customer Email: ${order.customerEmail}`);
                  }
                  textLines.push(`Date & Time: ${formattedDateTime}`);
                  textLines.push('');
                  textLines.push('Products:');
                  order.items.forEach((item) => {
                    const formattedItem = formatOrderProductItem(item);
                    textLines.push(`- ${formattedItem.lineText}`);
                  });
                  textLines.push('');
                  textLines.push(`Total: ${formatINR(order.total)}`);
                  textLines.push(`Status: ${order.status}`);

                  const fullOrderText = textLines.join('\n');

                  return (
                    <div
                      key={order.id}
                      className="border border-[#e2e8f0] rounded-xl p-4 sm:p-5 bg-gradient-to-br from-white to-[#f8fafc] hover:shadow-md transition-shadow duration-150 space-y-4"
                    >
                      {/* Top Action Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#e2e8f0]">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              order.status === 'Ordered'
                                ? 'bg-[#dcfce7] text-[#15803d] border-[#86efac]'
                                : order.status === 'Delivered'
                                ? 'bg-[#eff4ff] text-[#1d4ed8] border-[#bfdbfe]'
                                : 'bg-[#fef3c7] text-[#825100] border-[#fde68a]'
                            }`}
                          >
                            ● {order.status}
                          </span>
                        </div>

                        {/* Actions: Copy Record, Change Status, Delete Order */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            title="Copy order record text"
                            onClick={() => {
                              navigator.clipboard?.writeText(fullOrderText);
                              setCopiedOrderId(order.id);
                              setTimeout(() => setCopiedOrderId(null), 2000);
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold text-[#475569] hover:text-[#0b1c30] bg-white border border-[#cbd5e1] rounded-lg hover:bg-[#f8fafc] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            {copiedOrderId === order.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#16a34a]" />
                                <span className="text-[#16a34a]">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Record</span>
                              </>
                            )}
                          </button>

                          {/* Status changer */}
                          {onUpdateOrderStatus && (
                            <select
                              value={order.status}
                              onChange={(e) => onUpdateOrderStatus(order.id, e.target.value)}
                              className="px-2.5 py-1 text-[11px] font-bold border border-[#cbd5e1] rounded-lg bg-white text-[#0f172a] focus:outline-hidden focus:ring-1 focus:ring-[#006b2c] cursor-pointer"
                            >
                              <option value="Ordered">Status: Ordered</option>
                              <option value="Picking at Pod #104">Status: Picking</option>
                              <option value="Cold-Chain En Route">Status: In Transit</option>
                              <option value="Delivered">Status: Delivered</option>
                            </select>
                          )}
                        </div>
                      </div>

                      {/* Structured Order Record Box matching user's exact specification */}
                      <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 sm:p-5 font-mono text-[13px] text-[#0f172a] space-y-2 shadow-2xs">
                        <div>
                          <span className="font-semibold text-[#64748b]">Order ID: </span>
                          <span className="font-bold text-[#006b2c]">{displayOrderId}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[#64748b]">Customer: </span>
                          <span className="font-bold text-[#0b1c30]">{order.customerName}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[#64748b]">User ID: </span>
                          <span className="font-semibold text-[#0b1c30]">{order.customerId || 'N/A'}</span>
                        </div>
                        {order.customerEmail && (
                          <div>
                            <span className="font-semibold text-[#64748b]">Email: </span>
                            <span className="text-[#334155]">{order.customerEmail}</span>
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-[#64748b]">Date & Time: </span>
                          <span className="font-medium text-[#0b1c30]">{formattedDateTime}</span>
                        </div>
                        <div className="pt-2">
                          <span className="font-semibold text-[#64748b] block mb-1">Products:</span>
                          <ul className="space-y-1 pl-2">
                            {order.items.map((item, idx) => {
                              const formattedItem = formatOrderProductItem(item);
                              return (
                                <li key={idx} className="text-[#0b1c30] font-medium">
                                  - {formattedItem.title} — {formattedItem.qtyAndUnit} — {formattedItem.linePrice}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                        <div className="pt-2 border-t border-[#e2e8f0]">
                          <span className="font-semibold text-[#64748b]">Total: </span>
                          <span className="font-bold text-[#006b2c]">{formatINR(order.total)}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[#64748b]">Status: </span>
                          <span className="font-bold text-[#006b2c]">{order.status}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add New Product Modal */}
      <AddProductModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddProduct={(newProd) => {
          onAddProduct(newProd);
          setPulseToast(`Added "${newProd.title}" (₹${newProd.price} / ${newProd.unit}) to store`);
          setTimeout(() => setPulseToast(null), 3500);
        }}
      />

      {/* Delete Product Confirmation Dialog */}
      {deleteConfirmProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#e2e8f0] p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#b91c1c]">
              <div className="w-10 h-10 rounded-full bg-[#fee2e2] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-[#ef4444]" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-[#0b1c30] font-display">
                  {t('removeProductTitle')}
                </h3>
                <p className="text-[12px] text-[#565e74]">
                  {t('removeProductSubtitle')}
                </p>
              </div>
            </div>

            <p className="text-[13px] text-[#3e4a3d] leading-relaxed">
              {t('removeProductConfirm', { title: deleteConfirmProduct.title })}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setDeleteConfirmProduct(null)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProduct(deleteConfirmProduct.id);
                  setPulseToast(`Removed "${deleteConfirmProduct.title}" from store`);
                  setDeleteConfirmProduct(null);
                  setTimeout(() => setPulseToast(null), 3000);
                }}
                className="px-4 py-2 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-white text-[13px] font-bold shadow-xs transition-colors cursor-pointer"
              >
                {t('yesDeleteProduct')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      <EditProductModal
        isOpen={!!editingProduct}
        product={editingProduct}
        allCategories={allCatalogCategories}
        onClose={() => setEditingProduct(null)}
        onSaveProduct={(updatedProd) => {
          if (onEditProduct) {
            onEditProduct(updatedProd);
          }
          setPulseToast(`Saved changes for "${updatedProd.title}" (₹${updatedProd.price} / ${updatedProd.unit})`);
          setTimeout(() => setPulseToast(null), 3500);
        }}
      />
      {/* Delete Coupon Confirmation Dialog */}
      {deleteConfirmCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#e2e8f0] p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#b91c1c]">
              <div className="w-10 h-10 rounded-full bg-[#fee2e2] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-[#ef4444]" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-[#0b1c30] font-display">
                  Delete Coupon
                </h3>
                <p className="text-[12px] text-[#565e74]">
                  This coupon will no longer be usable by customers.
                </p>
              </div>
            </div>

            <p className="text-[13px] text-[#3e4a3d] leading-relaxed">
              {t('deleteCouponConfirm', { code: deleteConfirmCoupon.code })}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setDeleteConfirmCoupon(null)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                id="confirm-delete-coupon-btn"
                onClick={() => {
                  onDeleteCoupon(deleteConfirmCoupon.id);
                  setPulseToast(`Deleted coupon "${deleteConfirmCoupon.code}"`);
                  setDeleteConfirmCoupon(null);
                  setTimeout(() => setPulseToast(null), 3000);
                }}
                className="px-4 py-2 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-white text-[13px] font-bold shadow-xs transition-colors cursor-pointer"
              >
                {t('deleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Log Confirmation Dialog */}
      {deleteConfirmLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#e2e8f0] p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#b91c1c]">
              <div className="w-10 h-10 rounded-full bg-[#fee2e2] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-[#ef4444]" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-[#0b1c30] font-display">
                  Delete Audit Log
                </h3>
                <p className="text-[12px] text-[#565e74]">
                  This will remove this log record from the audit trail.
                </p>
              </div>
            </div>

            <p className="text-[13px] text-[#3e4a3d] leading-relaxed">
              Are you sure you want to delete the log record for <span className="font-semibold text-[#0b1c30]">{deleteConfirmLog.productTitle}</span> ({deleteConfirmLog.changeType})? The actual product and stock will remain unchanged.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setDeleteConfirmLog(null)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                id="confirm-delete-log-btn"
                onClick={() => {
                  if (onDeleteInventoryLog) {
                    onDeleteInventoryLog(deleteConfirmLog.id);
                  }
                  setPulseToast(`Deleted audit log record for "${deleteConfirmLog.productTitle}"`);
                  setDeleteConfirmLog(null);
                  setTimeout(() => setPulseToast(null), 3000);
                }}
                className="px-4 py-2 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-white text-[13px] font-bold shadow-xs transition-colors cursor-pointer"
              >
                {t('deleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Logs Confirmation Dialog */}
      {showClearLogsConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#e2e8f0] p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#b91c1c]">
              <div className="w-10 h-10 rounded-full bg-[#fee2e2] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-[#ef4444]" />
              </div>
              <div>
                <h3 className="text-[17px] font-bold text-[#0b1c30] font-display">
                  Clear All Audit Logs
                </h3>
                <p className="text-[12px] text-[#565e74]">
                  This will remove all CDC audit & dispatch log history.
                </p>
              </div>
            </div>

            <p className="text-[13px] text-[#3e4a3d] leading-relaxed">
              Are you sure you want to clear all {inventoryLogs.length} audit log entries? This will only remove the log history; all products and quantities will remain unchanged.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setShowClearLogsConfirm(false)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                id="confirm-clear-logs-btn"
                onClick={() => {
                  if (onClearInventoryLogs) {
                    onClearInventoryLogs();
                  }
                  setPulseToast('Cleared all CDC audit & dispatch log records');
                  setShowClearLogsConfirm(false);
                  setTimeout(() => setPulseToast(null), 3000);
                }}
                className="px-4 py-2 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-white text-[13px] font-bold shadow-xs transition-colors cursor-pointer"
              >
                Clear All Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coupon Create / Edit Modal */}
      <CouponModal
        isOpen={isCouponModalOpen}
        coupon={editingCoupon}
        existingCodes={coupons.map((c) => c.code)}
        onClose={() => {
          setIsCouponModalOpen(false);
          setEditingCoupon(null);
        }}
        onSave={(data) => {
          if (editingCoupon) {
            onUpdateCoupon({
              ...editingCoupon,
              ...data,
            });
            setPulseToast(`Updated coupon "${data.code}" (${data.discountPercentage}% OFF)`);
          } else {
            onCreateCoupon(data);
            setPulseToast(`Created coupon "${data.code}" (${data.discountPercentage}% OFF)`);
          }
          setIsCouponModalOpen(false);
          setEditingCoupon(null);
          setTimeout(() => setPulseToast(null), 3500);
        }}
      />

    </div>
  );
};
