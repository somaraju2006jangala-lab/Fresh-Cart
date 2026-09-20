import React, { useState } from 'react';
import { Product, InventoryLog } from '../types';
import { USER_AVATAR_URL } from '../data/products';
import { formatINR } from '../utils/currency';
import { AddProductModal, STANDARD_UNITS } from './AddProductModal';
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
} from 'lucide-react';

interface AdminPortalProps {
  products: Product[];
  inventoryLogs: InventoryLog[];
  onBackToStorefront: () => void;
  onUpdateProductStock: (productId: string, newStock: number, reason: string) => void;
  onUpdateProductPrice: (productId: string, newPrice: number) => void;
  onUpdateProductUnit: (productId: string, newUnit: string) => void;
  onAddProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onSimulateCdcPulse: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  products,
  inventoryLogs,
  onBackToStorefront,
  onUpdateProductStock,
  onUpdateProductPrice,
  onUpdateProductUnit,
  onAddProduct,
  onDeleteProduct,
  onSimulateCdcPulse,
}) => {
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStockStatus, setFilterStockStatus] = useState('all');
  const [adminSearch, setAdminSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'inventory' | 'logs' | 'coldchain'>('inventory');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<number>(0);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<Product | null>(null);
  const [pulseToast, setPulseToast] = useState<string | null>(null);

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
              <span>Back to Storefront</span>
            </button>
            <div className="h-4 w-px bg-[#475569] hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
              <span className="text-[13px] font-bold tracking-tight">
                Store #104 Central Fulfillment Operations
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTriggerPulse}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-semibold shadow-xs transition-colors cursor-pointer"
              title="Simulate incoming order sale and live stock countdown"
            >
              <Radio className="w-3.5 h-3.5 text-[#7ffc97] animate-pulse" />
              <span>Simulate MongoDB CDC Pulse</span>
            </button>

            <div className="flex items-center gap-2 pl-2">
              <img
                src={USER_AVATAR_URL}
                alt="Sarah L."
                className="w-8 h-8 rounded-full object-cover border border-[#475569]"
              />
              <div className="hidden sm:block text-left">
                <p className="text-[12px] font-semibold leading-tight">Sarah L.</p>
                <p className="text-[10px] text-[#94a3b8] leading-tight">Ops Manager</p>
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
                Total SKUs Monitored
              </span>
              <span className="text-[28px] font-extrabold text-[#0f172a] font-display tabular-nums">
                {totalSkus}
              </span>
              <div className="text-[11px] text-[#16a34a] flex items-center gap-1 font-semibold mt-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>100% Active MongoDB sync</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#eff4ff] text-[#006b2c] flex items-center justify-center">
              <Package className="w-6 h-6 text-[#006b2c]" />
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12px] text-[#64748b] font-medium block">
                Cold-Chain Pod Temp
              </span>
              <span className="text-[28px] font-extrabold text-[#0f172a] font-display tabular-nums">
                3.8°C
              </span>
              <div className="text-[11px] text-[#16a34a] font-semibold mt-1 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#16a34a]" />
                <span>Optimal (Tolerance 2-5°C)</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#fef3c7] text-[#825100] flex items-center justify-center">
              <Thermometer className="w-6 h-6 text-[#825100]" />
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12px] text-[#64748b] font-medium block">
                Stock Warnings
              </span>
              <span className="text-[28px] font-extrabold text-[#b45309] font-display tabular-nums">
                {lowStockCount + outOfStockCount}
              </span>
              <div className="text-[11px] text-[#64748b] font-medium mt-1">
                {lowStockCount} Low · {outOfStockCount} Out of Stock
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#fee2e2] text-[#ef4444] flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-[#ef4444]" />
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[12px] text-[#64748b] font-medium block">
                Active Pickers &amp; Runners
              </span>
              <span className="text-[28px] font-extrabold text-[#0f172a] font-display tabular-nums">
                12
              </span>
              <div className="text-[11px] text-[#16a34a] font-semibold mt-1">
                Avg pack time: 5.4 mins
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
            <span>Live Inventory Management ({products.length})</span>
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
            <span>CDC Audit &amp; Dispatch Logs</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('coldchain')}
            className={`pb-3 text-[13px] font-semibold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'coldchain'
                ? 'border-[#006b2c] text-[#006b2c]'
                : 'border-transparent text-[#64748b] hover:text-[#0b1c30]'
            }`}
          >
            <Thermometer className="w-4 h-4" />
            <span>Cold-Chain Telemetry</span>
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
                  placeholder="Filter SKU, item, or farm supplier..."
                  className="w-full pl-9 pr-3 py-1.5 text-[13px] border border-[#cbd5e1] rounded-lg bg-[#f8fafc] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-1.5 text-[12px] border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden"
                >
                  <option value="all">All Aisles</option>
                  <option value="produce">Produce &amp; Fruit</option>
                  <option value="dairy">Dairy &amp; Eggs</option>
                  <option value="bakery">Bakery</option>
                  <option value="beverages">Beverages</option>
                  <option value="snacks">Snacks</option>
                  <option value="grains">Rice &amp; Grains</option>
                </select>

                <select
                  value={filterStockStatus}
                  onChange={(e) => setFilterStockStatus(e.target.value)}
                  className="px-3 py-1.5 text-[12px] border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] focus:outline-hidden"
                >
                  <option value="all">All Stock Statuses</option>
                  <option value="healthy">In Stock (&gt; 5)</option>
                  <option value="low">Low Stock (1-5)</option>
                  <option value="out">Out of Stock (0)</option>
                </select>

                <button
                  type="button"
                  id="admin-add-product-btn"
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Product</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="bg-[#f8fafc] text-[#64748b] border-b border-[#e2e8f0] text-[11px] font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Item &amp; Supplier</th>
                    <th className="py-3 px-4">SKU / Batch</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Price (₹)</th>
                    <th className="py-3 px-4">Unit</th>
                    <th className="py-3 px-4">Quantity</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
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

                        <td className="py-3 px-4 font-mono text-[12px] text-[#475569]">
                          <div>{p.sku}</div>
                          <div className="text-[10px] text-[#94a3b8]">
                            {p.batchNumber || 'LOT-2026-GEN'}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md bg-[#f1f5f9] text-[#475569] text-[11px] font-medium border border-[#e2e8f0]">
                            {p.categoryLabel}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          {editingPriceId === p.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[#64748b]">₹</span>
                              <input
                                type="number"
                                step="1"
                                min="1"
                                value={tempPrice}
                                onChange={(e) => setTempPrice(parseFloat(e.target.value) || 0)}
                                className="w-16 px-1.5 py-0.5 border border-[#cbd5e1] rounded text-[12px]"
                              />
                              <button
                                type="button"
                                onClick={() => handleSavePrice(p.id)}
                                className="p-1 bg-[#006b2c] text-white rounded hover:bg-[#00873a] cursor-pointer"
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

                        {/* Unit Column with direct editing */}
                        <td className="py-3 px-4">
                          <select
                            value={p.unit}
                            onChange={(e) => {
                              onUpdateProductUnit(p.id, e.target.value);
                              setPulseToast(`Updated unit for "${p.title}" to "${e.target.value}"`);
                              setTimeout(() => setPulseToast(null), 2500);
                            }}
                            className="px-2 py-1 text-[12px] font-bold border border-[#cbd5e1] rounded-lg bg-white text-[#0b1c30] hover:border-[#006b2c] focus:outline-hidden focus:ring-2 focus:ring-[#006b2c] cursor-pointer"
                            title="Edit product unit"
                          >
                            {!STANDARD_UNITS.includes(p.unit as any) && (
                              <option value={p.unit}>{p.unit}</option>
                            )}
                            {STANDARD_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
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
                              Out of Stock
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#b45309] text-[11px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#15803d] text-[11px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a]" />
                              Healthy
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            title={`Delete ${p.title} from store`}
                            onClick={() => setDeleteConfirmProduct(p)}
                            className="px-2.5 py-1 rounded-lg bg-[#fee2e2] hover:bg-[#fecaca] text-[#b91c1c] text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[#ef4444]" />
                            <span>Delete</span>
                          </button>
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
            <div className="flex items-center justify-between pb-3 border-b border-[#e2e8f0]">
              <div>
                <h3 className="text-[16px] font-bold text-[#0f172a] font-display">
                  Live Change Data Capture (CDC) Ledger
                </h3>
                <p className="text-[12px] text-[#64748b]">
                  Real-time synchronization events between Store #104 mini-fulfillment pod and customer mobile clients.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#dcfce7] text-[#15803d] text-[11px] font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16a34a] animate-ping" />
                Cluster Healthy
              </span>
            </div>

            <div className="space-y-2">
              {inventoryLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] flex items-center justify-between text-[12px]"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                        log.changeType === 'RESTOCK'
                          ? 'bg-[#dcfce7] text-[#15803d]'
                          : log.changeType === 'SALE'
                          ? 'bg-[#e0e7ff] text-[#4338ca]'
                          : 'bg-[#fef3c7] text-[#b45309]'
                      }`}
                    >
                      {log.changeType}
                    </span>
                    <div>
                      <span className="font-semibold text-[#0f172a]">
                        {log.productTitle} ({log.sku})
                      </span>
                      <span className="text-[#64748b] block text-[11px]">
                        {log.notes} · Operator: {log.operator}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-bold tabular-nums block ${
                        log.quantityChange > 0 ? 'text-[#16a34a]' : 'text-[#ef4444]'
                      }`}
                    >
                      {log.quantityChange > 0 ? `+${log.quantityChange}` : log.quantityChange}
                    </span>
                    <span className="text-[10px] text-[#94a3b8]">{log.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Cold-Chain Telemetry */}
        {activeTab === 'coldchain' && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-xs p-5 space-y-4">
            <h3 className="text-[16px] font-bold text-[#0f172a] font-display">
              Continuous Cold-Chain Refrigeration Telemetry
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#eff4ff] border border-[#d3e4fe]">
                <span className="text-[12px] text-[#006b2c] font-semibold block">
                  Pod #104 Dairy &amp; Produce Vault
                </span>
                <span className="text-[26px] font-bold text-[#0f172a] font-display">
                  3.8°C
                </span>
                <p className="text-[11px] text-[#565e74] mt-1">
                  Target: 2.0°C – 4.0°C. Verified at 11:52 AM via IoT thermocouple #TC-992.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#eff4ff] border border-[#d3e4fe]">
                <span className="text-[12px] text-[#006b2c] font-semibold block">
                  Bakery Ambient Chute
                </span>
                <span className="text-[26px] font-bold text-[#0f172a] font-display">
                  21.2°C
                </span>
                <p className="text-[11px] text-[#565e74] mt-1">
                  Target: 19.0°C – 23.0°C. Humidity 44%. Sourdough crust preservation mode active.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#eff4ff] border border-[#d3e4fe]">
                <span className="text-[12px] text-[#006b2c] font-semibold block">
                  Electric Runner Thermal Totes
                </span>
                <span className="text-[26px] font-bold text-[#0f172a] font-display">
                  4.1°C
                </span>
                <p className="text-[11px] text-[#565e74] mt-1">
                  12/12 active thermal totes within safe limits with reusable dry ice phase-change blocks.
                </p>
              </div>
            </div>
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
                  Remove Product
                </h3>
                <p className="text-[12px] text-[#565e74]">
                  This product will be removed from storefront and cart.
                </p>
              </div>
            </div>

            <p className="text-[13px] text-[#3e4a3d] leading-relaxed">
              Are you sure you want to remove <span className="font-bold text-[#0b1c30]">{deleteConfirmProduct.title}</span> from FreshCart? It will no longer appear on the customer storefront.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setDeleteConfirmProduct(null)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] cursor-pointer"
              >
                Cancel
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
                Yes, Delete Product
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
