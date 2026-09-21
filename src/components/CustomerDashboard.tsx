import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { CartItem, Product, CustomerAddress } from '../types';
import { formatINR } from '../utils/currency';
import {
  User,
  Package,
  Clock,
  MapPin,
  ShoppingCart,
  LogOut,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Truck,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  Check,
  Edit3,
  Store,
  ShieldCheck,
  Phone,
  Mail,
  Calendar,
  Zap,
} from 'lucide-react';

interface CustomerDashboardProps {
  cart: CartItem[];
  onOpenCart: () => void;
  onOpenCheckout: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onUpdateQty?: (productId: string, delta: number) => void;
  onRemoveItem?: (productId: string) => void;
  onBackToStorefront: () => void;
  onLogout: () => void;
}

export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({
  cart,
  onOpenCart,
  onOpenCheckout,
  onAddToCart,
  onUpdateQty,
  onRemoveItem,
  onBackToStorefront,
  onLogout,
}) => {
  const { currentUser, orders, updateProfile, addAddress, removeAddress } = useAuth();
  const { t } = useLanguage();

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Pending': return t('statusPending');
      case 'Picking at Pod #104': return t('statusPicking');
      case 'Cold-Chain En Route': return t('statusColdChain');
      case 'Delivered': return t('statusDelivered');
      default: return status;
    }
  };

  const [activeTab, setActiveTab] = useState<'orders' | 'history' | 'profile' | 'addresses' | 'cart'>('orders');

  // Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(currentUser?.name || '');
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone || '');
  const [profileAddress, setProfileAddress] = useState(currentUser?.address || '');
  const [profileSavedToast, setProfileSavedToast] = useState(false);

  // New address form modal/state
  const [showAddAddressModal, setShowAddAddressModal] = useState(false);
  const [newAddrLabel, setNewAddrLabel] = useState('Work');
  const [newAddrStreet, setNewAddrStreet] = useState('');
  const [newAddrCity, setNewAddrCity] = useState('Springfield');
  const [newAddrState, setNewAddrState] = useState('OR');
  const [newAddrZip, setNewAddrZip] = useState('97477');
  const [newAddrDefault, setNewAddrDefault] = useState(false);

  // Reorder toast feedback
  const [reorderToast, setReorderToast] = useState<string | null>(null);

  if (!currentUser) {
    return null;
  }

  const activeOrders = orders.filter((o) => o.status !== 'Delivered');
  const pastOrders = orders.filter((o) => o.status === 'Delivered');

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      name: profileName,
      phone: profilePhone,
      address: profileAddress,
    });
    setIsEditingProfile(false);
    setProfileSavedToast(true);
    setTimeout(() => setProfileSavedToast(false), 3000);
  };

  const handleCreateAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddrStreet.trim()) return;

    addAddress({
      label: newAddrLabel,
      street: newAddrStreet,
      city: newAddrCity,
      state: newAddrState,
      zip: newAddrZip,
      isDefault: newAddrDefault,
    });

    setNewAddrStreet('');
    setShowAddAddressModal(false);
  };

  const handleReorderItems = (orderItems: CartItem[], orderId: string) => {
    orderItems.forEach((it) => {
      onAddToCart(it.product, it.quantity);
    });
    setReorderToast(t('reorderToastMsg', { count: orderItems.length, id: orderId }));
    setTimeout(() => setReorderToast(null), 3500);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Toast Notification */}
      {reorderToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#006b2c] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-[13px] font-semibold animate-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 className="w-4 h-4 text-[#7ffc97]" />
          <span>{reorderToast}</span>
        </div>
      )}

      {profileSavedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0b1c30] text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-[13px] font-semibold animate-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 className="w-4 h-4 text-[#7ffc97]" />
          <span>{t('profileSavedMsg')}</span>
        </div>
      )}

      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#e2e8f0]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToStorefront}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#cbd5e1] text-[#0b1c30] hover:bg-[#f1f5f9] text-[12px] font-semibold transition-colors cursor-pointer"
          >
            <Store className="w-4 h-4 text-[#006b2c]" />
            <span>{t('backToStorefrontBtn')}</span>
          </button>
          <span className="text-[12px] text-[#565e74]">/</span>
          <span className="text-[13px] font-semibold text-[#006b2c]">
            {t('customerAccountDashboard')}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            id="dashboard-logout-btn"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[#fecaca] bg-white text-[#b91c1c] hover:bg-[#fef2f2] text-[12px] font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t('logOut')}</span>
          </button>
        </div>
      </div>

      {/* Welcome Banner Card */}
      <div className="mt-6 rounded-2xl bg-linear-to-r from-[#006b2c] via-[#007832] to-[#044c21] p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        {/* Subtle decorative circles */}
        <div className="absolute right-0 top-0 w-80 h-80 bg-white/5 rounded-full blur-2xl pointer-events-none transform translate-x-20 -translate-y-20" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img
              src={
                currentUser.avatarUrl ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.name)}&backgroundColor=006b2c`
              }
              alt={currentUser.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-4 ring-white/20 bg-white/10"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider bg-[#7ffc97] text-[#002109] px-2.5 py-0.5 rounded-full">
                  {currentUser.loyaltyTier || t('verifiedCustomer')}
                </span>
                <span className="text-white/70 text-[12px] hidden sm:inline">
                  {t('memberSince', { date: new Date(currentUser.createdAt).toLocaleDateString() })}
                </span>
              </div>
              <h1
                id="customer-dashboard-greeting"
                className="text-[24px] sm:text-[30px] font-extrabold font-display tracking-tight text-white mt-1"
              >
                {t('welcomeBack', { name: currentUser.name })}
              </h1>
              <p className="text-white/80 text-[13px] flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-[#7ffc97]" />
                  {currentUser.email}
                </span>
                {currentUser.phone && (
                  <span className="hidden sm:flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-[#7ffc97]" />
                    {currentUser.phone}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-3 sm:gap-4 bg-black/15 backdrop-blur-md p-3 rounded-xl border border-white/10">
            <div className="text-center px-2 sm:px-3">
              <div className="text-[20px] font-bold font-display text-white">
                {activeOrders.length}
              </div>
              <div className="text-[11px] text-white/75">{t('activeDeliveriesCount')}</div>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center px-2 sm:px-3">
              <div className="text-[20px] font-bold font-display text-white">
                {orders.length}
              </div>
              <div className="text-[11px] text-white/75">{t('totalOrdersCount')}</div>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center px-2 sm:px-3">
              <div className="text-[20px] font-bold font-display text-[#7ffc97]">
                {cartItemCount}
              </div>
              <div className="text-[11px] text-white/75">{t('cartItemsCount')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Tabs & Content Area */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Navigation Sidebar */}
        <aside className="lg:col-span-1 space-y-1.5">
          <div className="bg-white rounded-2xl border border-[#e2e8f0] p-2.5 shadow-xs">
            <button
              type="button"
              id="tab-btn-orders"
              onClick={() => setActiveTab('orders')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
                activeTab === 'orders'
                  ? 'bg-[#eff4ff] text-[#006b2c] font-bold shadow-2xs'
                  : 'text-[#565e74] hover:bg-[#f8fafc] hover:text-[#0b1c30]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4" />
                <span>{t('tabMyOrders')}</span>
              </div>
              {activeOrders.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#006b2c] text-white text-[11px] font-bold">
                  {activeOrders.length}
                </span>
              )}
            </button>

            <button
              type="button"
              id="tab-btn-history"
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-[#eff4ff] text-[#006b2c] font-bold shadow-2xs'
                  : 'text-[#565e74] hover:bg-[#f8fafc] hover:text-[#0b1c30]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4" />
                <span>{t('tabOrderHistory')}</span>
              </div>
              <span className="text-[11px] text-[#565e74] font-medium">
                {pastOrders.length}
              </span>
            </button>

            <button
              type="button"
              id="tab-btn-cart"
              onClick={() => setActiveTab('cart')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
                activeTab === 'cart'
                  ? 'bg-[#eff4ff] text-[#006b2c] font-bold shadow-2xs'
                  : 'text-[#565e74] hover:bg-[#f8fafc] hover:text-[#0b1c30]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShoppingCart className="w-4 h-4" />
                <span>{t('tabCartOverview')}</span>
              </div>
              {cartItemCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#7ffc97] text-[#002109] text-[11px] font-bold">
                  {cartItemCount}
                </span>
              )}
            </button>

            <button
              type="button"
              id="tab-btn-profile"
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-[#eff4ff] text-[#006b2c] font-bold shadow-2xs'
                  : 'text-[#565e74] hover:bg-[#f8fafc] hover:text-[#0b1c30]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <User className="w-4 h-4" />
                <span>{t('tabProfileSettings')}</span>
              </div>
            </button>

            <button
              type="button"
              id="tab-btn-addresses"
              onClick={() => setActiveTab('addresses')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer ${
                activeTab === 'addresses'
                  ? 'bg-[#eff4ff] text-[#006b2c] font-bold shadow-2xs'
                  : 'text-[#565e74] hover:bg-[#f8fafc] hover:text-[#0b1c30]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4" />
                <span>{t('tabSavedAddresses')}</span>
              </div>
              <span className="text-[11px] text-[#565e74] font-medium">
                {(currentUser.savedAddresses || []).length}
              </span>
            </button>
          </div>

          {/* Quick Support Card */}
          <div className="bg-[#eff4ff]/70 rounded-2xl border border-[#d3e4fe] p-4 text-[12px] space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#006b2c]">
              <ShieldCheck className="w-4 h-4" />
              <span>Cold-Chain Guarantee</span>
            </div>
            <p className="text-[#565e74] leading-relaxed">
              All harvest orders are monitored at under 4°C with insulated eco-coolers. Need help with an order?
            </p>
            <span className="inline-block text-[#006b2c] font-semibold hover:underline cursor-pointer">
              Contact 24/7 Store Support →
            </span>
          </div>
        </aside>

        {/* Main Content Pane */}
        <main className="lg:col-span-3 space-y-6">
          {/* TAB: MY ORDERS (ACTIVE ORDERS) */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[20px] font-bold text-[#0b1c30] font-display">
                    Active Delivery Tracking
                  </h2>
                  <p className="text-[13px] text-[#565e74]">
                    Live cold-chain fulfillment status for your neighborhood orders
                  </p>
                </div>
              </div>

              {activeOrders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-[#e2e8f0] p-10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#eff4ff] text-[#006b2c] flex items-center justify-center mx-auto">
                    <Package className="w-6 h-6" />
                  </div>
                  <h3 className="text-[16px] font-bold text-[#0b1c30]">
                    {t('noActiveOrders')}
                  </h3>
                  <button
                    type="button"
                    onClick={onBackToStorefront}
                    className="mt-2 px-4 py-2 bg-[#006b2c] text-white text-[13px] font-semibold rounded-xl hover:bg-[#00873a] transition-colors cursor-pointer"
                  >
                    {t('backToStorefrontBtn')}
                  </button>
                </div>
              ) : (
                activeOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-[#e2e8f0] p-5 sm:p-6 shadow-xs space-y-5"
                  >
                    {/* Order Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#e5eeff]">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[16px] font-bold text-[#0b1c30] font-display">
                            Order #{order.id}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-[#dcfce7] text-[#15803d] text-[11px] font-bold animate-pulse">
                            ● {getStatusLabel(order.status)}
                          </span>
                        </div>
                        <div className="text-[12px] text-[#565e74] mt-0.5 flex items-center gap-3">
                          <span>Placed: {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span>•</span>
                          <span>{order.items.length} items</span>
                          <span>•</span>
                          <span className="font-semibold text-[#006b2c]">{formatINR(order.total)}</span>
                        </div>
                      </div>

                      <div className="bg-[#eff4ff] px-3.5 py-1.5 rounded-xl border border-[#d3e4fe] flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#006b2c]" />
                        <span className="text-[12px] font-semibold text-[#006b2c]">
                          {order.estimatedDeliveryTime || 'Arrival in ~20 minutes'}
                        </span>
                      </div>
                    </div>

                    {/* Multi-step Live Tracking Progress Bar */}
                    <div className="bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0] space-y-4">
                      <div className="flex items-center justify-between text-[12px] font-semibold text-[#0b1c30]">
                        <span>Fulfillment Timeline</span>
                        <span className="text-[#006b2c] text-[11px]">Cold Pod Hub #104</span>
                      </div>

                      {/* Step Progress Line */}
                      <div className="relative flex items-center justify-between">
                        <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-[#e2e8f0] -z-0">
                          <div className="h-full bg-[#006b2c] w-1/2 transition-all duration-500" />
                        </div>

                        {/* Step 1 */}
                        <div className="relative z-10 flex flex-col items-center bg-white px-1">
                          <div className="w-7 h-7 rounded-full bg-[#006b2c] text-white flex items-center justify-center text-[11px] font-bold shadow-xs">
                            ✓
                          </div>
                          <span className="text-[11px] font-semibold text-[#0b1c30] mt-1">Confirmed</span>
                        </div>

                        {/* Step 2 */}
                        <div className="relative z-10 flex flex-col items-center bg-white px-1">
                          <div className="w-7 h-7 rounded-full bg-[#006b2c] text-white flex items-center justify-center text-[11px] font-bold shadow-xs ring-4 ring-[#dcfce7]">
                            2
                          </div>
                          <span className="text-[11px] font-bold text-[#006b2c] mt-1">Picking at Pod</span>
                        </div>

                        {/* Step 3 */}
                        <div className="relative z-10 flex flex-col items-center bg-white px-1">
                          <div className="w-7 h-7 rounded-full bg-[#e2e8f0] text-[#565e74] flex items-center justify-center text-[11px] font-bold">
                            3
                          </div>
                          <span className="text-[11px] text-[#565e74] mt-1">En Route (3.8°C)</span>
                        </div>

                        {/* Step 4 */}
                        <div className="relative z-10 flex flex-col items-center bg-white px-1">
                          <div className="w-7 h-7 rounded-full bg-[#e2e8f0] text-[#565e74] flex items-center justify-center text-[11px] font-bold">
                            4
                          </div>
                          <span className="text-[11px] text-[#565e74] mt-1">At Doorstep</span>
                        </div>
                      </div>
                    </div>

                    {/* Delivery Destination & Items summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
                      <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-1">
                        <div className="font-semibold text-[#0b1c30] flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#006b2c]" />
                          Destination Address
                        </div>
                        <p className="text-[#565e74]">{order.deliveryAddress}</p>
                      </div>

                      <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-1">
                        <div className="font-semibold text-[#0b1c30] flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-[#006b2c]" />
                          Payment &amp; Dispatch
                        </div>
                        <p className="text-[#565e74]">
                          {order.paymentMethod || 'Express Checkout'} · Direct EV Runner
                        </p>
                      </div>
                    </div>

                    {/* Order Item Pills */}
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-[#565e74] uppercase tracking-wider">
                        Packed Goods
                      </span>
                      <div className="divide-y divide-[#f1f5f9]">
                        {order.items.map((it) => (
                          <div
                            key={it.product.id}
                            className="py-2 flex items-center justify-between text-[13px]"
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={it.product.image}
                                alt={it.product.title}
                                className="w-10 h-10 rounded-lg object-cover bg-slate-50 border border-[#e2e8f0]"
                              />
                              <div>
                                <div className="font-semibold text-[#0b1c30]">{it.product.title}</div>
                                <div className="text-[11px] text-[#565e74]">
                                  Qty: {it.quantity} {it.quantity === 1 ? 'pack' : 'packs'} ({it.product.unit}) · {formatINR(it.product.price)} / {it.product.unit}
                                </div>
                              </div>
                            </div>
                            <span className="font-semibold text-[#0b1c30]">
                              {formatINR(it.product.price * it.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: ORDER HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-[20px] font-bold text-[#0b1c30] font-display">
                  Order History
                </h2>
                <p className="text-[13px] text-[#565e74]">
                  Past delivered groceries and seasonal harvests with 1-click reorder
                </p>
              </div>

              {pastOrders.length === 0 ? (
                <div className="bg-white rounded-2xl border border-[#e2e8f0] p-10 text-center text-[#565e74]">
                  {t('noPastOrders')}
                </div>
              ) : (
                pastOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-[#e2e8f0] p-5 sm:p-6 shadow-xs space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#e5eeff]">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[16px] font-bold text-[#0b1c30] font-display">
                            Order #{order.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#475569] text-[11px] font-bold">
                            ✓ {getStatusLabel(order.status)}
                          </span>
                        </div>
                        <div className="text-[12px] text-[#565e74] mt-0.5">
                          Delivered on {new Date(order.createdAt).toLocaleDateString()} · {order.deliveryTimeSlot}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[15px] font-bold text-[#006b2c] font-display">
                            {formatINR(order.total)}
                          </div>
                          <div className="text-[11px] text-[#565e74]">
                            {order.items.length} items
                          </div>
                        </div>

                        {/* 1-Click Reorder Button */}
                        <button
                          type="button"
                          onClick={() => handleReorderItems(order.items, order.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#eff4ff] hover:bg-[#dce9ff] text-[#006b2c] text-[12px] font-bold transition-all border border-[#d3e4fe] cursor-pointer"
                          title="Add all items from this order into your current cart"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-[#006b2c]" />
                          <span>{t('reorderItems')}</span>
                        </button>
                      </div>
                    </div>

                    {/* Items Accordion / Summary */}
                    <div className="divide-y divide-[#f1f5f9]">
                      {order.items.map((it) => (
                        <div
                          key={it.product.id}
                          className="py-2 flex items-center justify-between text-[12px]"
                        >
                          <div className="flex items-center gap-2.5">
                            <img
                              src={it.product.image}
                              alt={it.product.title}
                              className="w-8 h-8 rounded-lg object-cover bg-slate-50 border border-[#e2e8f0]"
                            />
                            <span className="font-medium text-[#0b1c30]">
                              {it.quantity}x {it.product.title}
                            </span>
                          </div>
                          <span className="font-semibold text-[#0b1c30]">
                            {formatINR(it.product.price * it.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: CART OVERVIEW */}
          {activeTab === 'cart' && (
            <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#e5eeff]">
                <div>
                  <h2 className="text-[20px] font-bold text-[#0b1c30] font-display">
                    Active Shopping Cart
                  </h2>
                  <p className="text-[13px] text-[#565e74]">
                    Review items queued for your next 30-minute delivery
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenCart}
                  className="px-3 py-1.5 bg-[#eff4ff] text-[#006b2c] rounded-xl text-[12px] font-semibold border border-[#d3e4fe] hover:bg-[#dce9ff] cursor-pointer"
                >
                  Open Full Cart Drawer →
                </button>
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <ShoppingCart className="w-12 h-12 text-[#94a3b8] mx-auto" />
                  <h3 className="text-[16px] font-bold text-[#0b1c30]">{t('emptyCartTitle')}</h3>
                  <p className="text-[13px] text-[#565e74]">
                    {t('emptyCartDesc')}
                  </p>
                  <button
                    type="button"
                    onClick={onBackToStorefront}
                    className="mt-2 px-4 py-2 bg-[#006b2c] text-white text-[13px] font-semibold rounded-xl hover:bg-[#00873a] transition-colors cursor-pointer"
                  >
                    {t('startShopping')}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="divide-y divide-[#e2e8f0]">
                    {cart.map((item) => (
                      <div
                        key={item.product.id}
                        className="py-3 flex items-center justify-between text-[13px]"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={item.product.image}
                            alt={item.product.title}
                            className="w-12 h-12 rounded-xl object-cover border border-[#e2e8f0]"
                          />
                          <div>
                            <div className="font-bold text-[#0b1c30]">{item.product.title}</div>
                            <div className="text-[11px] text-[#565e74]">
                              {formatINR(item.product.price)} / {item.product.unit}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {onUpdateQty && (
                            <div className="flex items-center bg-[#eff4ff] rounded-lg border border-[#e2e8f0]">
                              <button
                                type="button"
                                title="Decrease quantity (removes at 0)"
                                onClick={() => onUpdateQty(item.product.id, -1)}
                                className="w-6 h-6 flex items-center justify-center text-[#0b1c30] hover:bg-[#e5eeff] rounded-l-lg transition-colors cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-6 text-center text-[11px] font-semibold tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                title="Increase quantity"
                                disabled={item.quantity >= item.product.stock}
                                onClick={() => onUpdateQty(item.product.id, 1)}
                                className="w-6 h-6 flex items-center justify-center text-[#0b1c30] hover:bg-[#e5eeff] rounded-r-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          <div className="text-right min-w-[70px]">
                            <div className="font-bold text-[#0b1c30] font-display">
                              {formatINR(item.product.price * item.quantity)}
                            </div>
                            <div className="text-[11px] text-[#565e74]">
                              Qty: {item.quantity} {item.quantity === 1 ? 'pack' : 'packs'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary & Checkout CTA */}
                  <div className="pt-4 border-t border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-[12px] text-[#565e74]">Subtotal ({cartItemCount} items)</span>
                      <div className="text-[22px] font-extrabold text-[#006b2c] font-display">
                        {formatINR(cartTotal)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onOpenCheckout}
                      className="px-6 py-3 rounded-xl bg-[#006b2c] text-white font-bold text-[14px] hover:bg-[#00873a] transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Proceed to Express Checkout</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: PROFILE INFORMATION */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#e5eeff]">
                <div>
                  <h2 className="text-[20px] font-bold text-[#0b1c30] font-display">
                    Profile Information
                  </h2>
                  <p className="text-[13px] text-[#565e74]">
                    Manage your personal details, contact information, and account preferences
                  </p>
                </div>
                {!isEditingProfile && (
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#cbd5e1] text-[#0b1c30] hover:bg-[#f8fafc] text-[12px] font-semibold transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#006b2c]" />
                    <span>{t('editProfile')}</span>
                  </button>
                )}
              </div>

              {isEditingProfile ? (
                <form onSubmit={handleSaveProfile} className="space-y-4 max-w-lg">
                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-[#0b1c30]">Full Name</label>
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#cbd5e1] text-[13px] bg-[#f8f9ff] focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#006b2c]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-[#0b1c30]">Email / User ID</label>
                    <input
                      type="email"
                      disabled
                      value={currentUser.email}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#e2e8f0] text-[13px] bg-[#f1f5f9] text-[#64748b] cursor-not-allowed"
                    />
                    <span className="text-[10px] text-[#94a3b8]">Email cannot be changed directly</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-[#0b1c30]">Phone Number</label>
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#cbd5e1] text-[13px] bg-[#f8f9ff] focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#006b2c]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[12px] font-semibold text-[#0b1c30]">Primary Street Address</label>
                    <input
                      type="text"
                      value={profileAddress}
                      onChange={(e) => setProfileAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#cbd5e1] text-[13px] bg-[#f8f9ff] focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#006b2c]"
                    />
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-[#006b2c] hover:bg-[#00873a] text-white text-[13px] font-semibold transition-colors cursor-pointer"
                    >
                      {t('saveChanges')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="px-4 py-2.5 rounded-xl text-[#565e74] hover:bg-[#f1f5f9] text-[13px] font-medium transition-colors cursor-pointer"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-1">
                    <span className="text-[11px] font-bold text-[#565e74] uppercase tracking-wider">
                      Customer Name
                    </span>
                    <div className="text-[15px] font-bold text-[#0b1c30]">{currentUser.name}</div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-1">
                    <span className="text-[11px] font-bold text-[#565e74] uppercase tracking-wider">
                      Email Address
                    </span>
                    <div className="text-[15px] font-bold text-[#0b1c30]">{currentUser.email}</div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-1">
                    <span className="text-[11px] font-bold text-[#565e74] uppercase tracking-wider">
                      Phone Number
                    </span>
                    <div className="text-[15px] font-bold text-[#0b1c30]">
                      {currentUser.phone || 'No phone provided'}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0] space-y-1">
                    <span className="text-[11px] font-bold text-[#565e74] uppercase tracking-wider">
                      Default Delivery Location
                    </span>
                    <div className="text-[14px] font-bold text-[#0b1c30]">
                      {currentUser.address || 'Standard Address on File'}
                    </div>
                  </div>
                </div>
              )}

              {/* Password & Security Panel */}
              <div className="pt-6 border-t border-[#e2e8f0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-[14px] font-bold text-[#0b1c30]">Password &amp; Security</h4>
                  <p className="text-[12px] text-[#565e74]">
                    Password cryptographically salted &amp; hashed via Web Crypto SHA-256
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#006b2c] bg-[#eff4ff] px-3 py-1.5 rounded-xl border border-[#d3e4fe]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Secure Hashing Active</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SAVED ADDRESSES */}
          {activeTab === 'addresses' && (
            <div className="bg-white rounded-2xl border border-[#e2e8f0] p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#e5eeff]">
                <div>
                  <h2 className="text-[20px] font-bold text-[#0b1c30] font-display">
                    {t('savedAddressesHeading')}
                  </h2>
                  <p className="text-[13px] text-[#565e74]">
                    Fast 30-min destination addresses for homes, apartments, and offices
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddAddressModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#006b2c] hover:bg-[#00873a] text-white text-[12px] font-semibold transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('addNewAddress')}</span>
                </button>
              </div>

              {/* Addresses List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(currentUser.savedAddresses || []).map((addr) => (
                  <div
                    key={addr.id}
                    className={`p-4 rounded-xl border transition-all ${
                      addr.isDefault
                        ? 'border-[#006b2c] bg-[#eff4ff]/40 ring-1 ring-[#006b2c]/30'
                        : 'border-[#e2e8f0] bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#006b2c]" />
                        <span className="text-[13px] font-bold text-[#0b1c30]">
                          {addr.label}
                        </span>
                        {addr.isDefault && (
                          <span className="px-2 py-0.5 rounded-full bg-[#006b2c] text-white text-[10px] font-bold">
                            {t('defaultAddressBadge')}
                          </span>
                        )}
                      </div>
                      {(currentUser.savedAddresses || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeAddress(addr.id)}
                          className="text-[#94a3b8] hover:text-[#dc2626] transition-colors p-1 cursor-pointer"
                          title="Remove address"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 text-[13px] text-[#565e74] leading-relaxed">
                      <div>{addr.street}</div>
                      <div>{addr.city}, {addr.state} {addr.zip}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Address Modal */}
              {showAddAddressModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/50 backdrop-blur-xs">
                  <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-[#e2e8f0] space-y-4">
                    <h3 className="text-[18px] font-bold text-[#0b1c30] font-display">
                      Add New Delivery Address
                    </h3>
                    <form onSubmit={handleCreateAddress} className="space-y-3">
                      <div>
                        <label className="text-[12px] font-semibold text-[#0b1c30]">Label</label>
                        <input
                          type="text"
                          required
                          value={newAddrLabel}
                          onChange={(e) => setNewAddrLabel(e.target.value)}
                          placeholder="e.g. Vacation Home, Studio"
                          className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-[#0b1c30]">Street Address</label>
                        <input
                          type="text"
                          required
                          value={newAddrStreet}
                          onChange={(e) => setNewAddrStreet(e.target.value)}
                          placeholder="123 Main St, Apt 2"
                          className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[12px] font-semibold text-[#0b1c30]">City</label>
                          <input
                            type="text"
                            required
                            value={newAddrCity}
                            onChange={(e) => setNewAddrCity(e.target.value)}
                            className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] font-semibold text-[#0b1c30]">State</label>
                          <input
                            type="text"
                            required
                            value={newAddrState}
                            onChange={(e) => setNewAddrState(e.target.value)}
                            className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] font-semibold text-[#0b1c30]">ZIP Code</label>
                          <input
                            type="text"
                            required
                            value={newAddrZip}
                            onChange={(e) => setNewAddrZip(e.target.value)}
                            className="w-full px-3 py-2 text-[13px] border border-[#cbd5e1] rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="pt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddAddressModal(false)}
                          className="px-4 py-2 text-[13px] font-medium text-[#565e74] hover:bg-[#f1f5f9] rounded-lg cursor-pointer"
                        >
                          {t('cancel')}
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-lg bg-[#006b2c] hover:bg-[#00873a] text-white text-[13px] font-semibold cursor-pointer"
                        >
                          {t('saveAddressBtn')}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
