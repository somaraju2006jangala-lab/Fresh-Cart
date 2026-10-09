import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { CartItem, CustomerOrder, Coupon, DeliveryChargeRule, UpiPaymentSettings } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../utils/currency';
import { useLanguage } from '../context/LanguageContext';
import { DEFAULT_DELIVERY_RULES, getApplicableDeliveryChargeRule } from '../services/settingsService';
import {
  fetchUpiSettings,
  buildUpiUri,
  initiateUpiPayment,
  isValidUpiId,
  uploadPaymentScreenshot,
} from '../services/paymentService';
import { updateOrderPaymentStatus } from '../services/authService';
import {
  CheckCircle,
  Banknote,
  MapPin,
  Clock,
  ShieldCheck,
  CreditCard,
  ArrowLeft,
  ArrowRight,
  ShoppingBag,
  Truck,
  QrCode,
  Smartphone,
  AlertCircle,
  ExternalLink,
  Upload,
  X,
  Check,
  AlertTriangle,
  Image as ImageIcon,
} from 'lucide-react';
import { Footer } from './Footer';

interface CheckoutPageProps {
  items: CartItem[];
  appliedCoupon: string | null;
  onClearCart: () => void;
  onOrderPlaced?: (items: CartItem[], placedOrder?: CustomerOrder) => void;
  coupons?: Coupon[];
  onApplyCoupon?: (code: string) => void;
  onRemoveCoupon?: () => void;
  deliveryCharges?: number;
  deliveryRules?: DeliveryChargeRule[];
  onBackToCart: () => void;
  onNavigateToDashboard?: () => void;
  onNavigateToStorefront?: () => void;
  onOpenAdmin: () => void;
  onSelectCategory: (category: string) => void;
  onOpenLogin: () => void;
  onOpenDashboard: () => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  items,
  appliedCoupon,
  onClearCart,
  onOrderPlaced,
  coupons = [],
  deliveryCharges = 40,
  deliveryRules,
  onBackToCart,
  onNavigateToDashboard,
  onNavigateToStorefront,
  onOpenAdmin,
  onSelectCategory,
  onOpenLogin,
  onOpenDashboard,
}) => {
  const { currentUser, addOrder } = useAuth();
  const { t } = useLanguage();
  const [step, setStep] = useState<'details' | 'success'>('details');
  const [address, setAddress] = useState(
    currentUser?.address || '742 Evergreen Terrace, Apt 4B'
  );
  const [deliveryNote, setDeliveryNote] = useState('Leave with doorman in thermal tote');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi'>('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showItemsList, setShowItemsList] = useState(false);

  // 1. Stable Order Number & Reference generated once per checkout session
  const [orderNumber] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));
  const formattedOrderId = `#FC-${orderNumber}`;
  const rawOrderId = `FC-${orderNumber}`;

  // Stable transaction reference: FC-<ORDER_ID>-<UNIQUE_REFERENCE>
  const [transactionRef] = useState(() => {
    const uniqueSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `FC-${orderNumber}-${uniqueSuffix}`;
  });

  // 2. UPI Configuration & QR State
  const [upiSettings, setUpiSettings] = useState<UpiPaymentSettings | null>(null);
  const [isLoadingUpiSettings, setIsLoadingUpiSettings] = useState(true);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isQrGenerating, setIsQrGenerating] = useState(false);

  // 3. Mobile & Transaction Attempt State
  const [isInitiatingMobileUpi, setIsInitiatingMobileUpi] = useState(false);
  const [paymentAttemptCreated, setPaymentAttemptCreated] = useState(false);
  const [upiActionTriggered, setUpiActionTriggered] = useState(false);
  const [upiError, setUpiError] = useState<string | null>(null);

  // 4. UPI Payment Screenshot Upload State
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState<boolean>(false);
  const [screenshotUploadStatus, setScreenshotUploadStatus] = useState<
    'idle' | 'selected' | 'uploading' | 'success' | 'error'
  >('idle');
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [screenshotSuccess, setScreenshotSuccess] = useState<string | null>(null);
  const [uploadedScreenshotUrl, setUploadedScreenshotUrl] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const successFileInputRef = React.useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (currentUser?.address) {
      setAddress(currentUser.address);
    }
  }, [currentUser]);

  // Load Admin UPI settings on mount and whenever selecting UPI payment
  useEffect(() => {
    let isCurrent = true;
    setIsLoadingUpiSettings(true);
    fetchUpiSettings()
      .then((settings) => {
        if (isCurrent) {
          setUpiSettings(settings);
        }
      })
      .catch((err) => {
        console.error('[Checkout UPI] Failed to load UPI settings from backend:', err);
        if (isCurrent) {
          setUpiSettings(null);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingUpiSettings(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [paymentMethod]);

  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const activeCoupon = appliedCoupon
    ? coupons.find(
        (c) => c.code.toUpperCase() === appliedCoupon.toUpperCase() && c.isActive
      )
    : null;
  const discountPercent = activeCoupon ? activeCoupon.discountPercentage : 0;
  const discount = Math.round((subtotal * discountPercent) / 100);

  // Delivery Charges calculation based on custom admin-controlled rules
  const effectiveRules =
    deliveryRules && deliveryRules.length > 0 ? deliveryRules : DEFAULT_DELIVERY_RULES;

  const applicableDeliveryRule =
    items.length > 0 && subtotal > 0
      ? getApplicableDeliveryChargeRule(effectiveRules, subtotal)
      : null;

  const deliveryChargesAmount =
    items.length > 0 && subtotal > 0 && applicableDeliveryRule
      ? applicableDeliveryRule.deliveryCharge
      : items.length > 0
      ? deliveryCharges
      : 0;

  // Final total already displayed to the customer at checkout
  const total = Math.max(0, Math.round((subtotal - discount + deliveryChargesAmount) * 100) / 100);

  // Validate Admin UPI configuration with support for dual property names
  const rawUpiId = String(upiSettings?.upiId || upiSettings?.upi_id || '').trim();
  const effectiveMerchantName = String(
    upiSettings?.merchantName || upiSettings?.merchant_name || 'FreshCart Store'
  ).trim();

  const isUpiValid = Boolean(
    upiSettings &&
      upiSettings.enabled !== false &&
      upiSettings.enabled !== (0 as any) &&
      rawUpiId &&
      isValidUpiId(rawUpiId)
  );

  // Generate dynamic, fully URL-encoded UPI URI
  const upiUri = useMemo(() => {
    if (!isUpiValid || !rawUpiId) {
      return '';
    }
    return buildUpiUri({
      upiId: rawUpiId,
      merchantName: effectiveMerchantName,
      amount: total > 0 ? total : undefined,
    });
  }, [isUpiValid, rawUpiId, effectiveMerchantName, total]);

  // Generate Desktop QR Code from the EXACT same UPI URI
  useEffect(() => {
    if (paymentMethod === 'upi') {
      if (upiUri && isUpiValid) {
        setIsQrGenerating(true);
        QRCode.toDataURL(upiUri, {
          width: 240,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#050c18',
            light: '#ffffff',
          },
        })
          .then((url) => {
            setQrCodeDataUrl(url);
            setIsQrGenerating(false);
          })
          .catch((err) => {
            console.error('[UPI] Error generating QR code:', err);
            setQrCodeDataUrl('');
            setIsQrGenerating(false);
          });

        // Automatically register payment attempt in database when customer selects UPI
        if (!paymentAttemptCreated && rawUpiId) {
          initiateUpiPayment({
            orderId: rawOrderId,
            customerId: currentUser?.id || 'guest_user',
            amount: total,
            upiId: rawUpiId,
            merchantName: effectiveMerchantName,
            transactionRef: transactionRef,
          }).then((res) => {
            if (res.success) {
              setPaymentAttemptCreated(true);
            }
          });
        }
      } else {
        setQrCodeDataUrl('');
        setIsQrGenerating(false);
      }
    } else {
      setQrCodeDataUrl('');
    }
  }, [
    paymentMethod,
    upiUri,
    isUpiValid,
    rawOrderId,
    currentUser?.id,
    total,
    rawUpiId,
    effectiveMerchantName,
    transactionRef,
    paymentAttemptCreated,
  ]);

  // Mobile UPI Payment action
  const handleMobilePayViaUpi = async () => {
    if (!isUpiValid || !upiSettings?.upiId || !upiUri) {
      setUpiError('UPI payment is currently unavailable. Please try another payment method.');
      return;
    }

    setUpiError(null);
    setIsInitiatingMobileUpi(true);

    try {
      // 1. Create/store payment attempt in backend BEFORE opening UPI intent
      const res = await initiateUpiPayment({
        orderId: rawOrderId,
        customerId: currentUser?.id || 'guest_user',
        amount: total,
        upiId: upiSettings.upiId,
        merchantName: upiSettings.merchantName || 'FreshCart Store',
        transactionRef: transactionRef,
      });

      if (!res.success) {
        setUpiError(res.error || 'Failed to initialize payment record. Please try again.');
        setIsInitiatingMobileUpi(false);
        return;
      }

      setPaymentAttemptCreated(true);
      setUpiActionTriggered(true);

      // 2. Normal user-triggered navigation to standard upi://pay scheme
      window.location.href = upiUri;
    } catch (err: any) {
      setUpiError('Payment connection error. Please try again or use Cash on Delivery.');
    } finally {
      setIsInitiatingMobileUpi(false);
    }
  };

  // Handlers for payment screenshot proof
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScreenshotError(null);
    setScreenshotSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Format check: JPG, JPEG, PNG
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const validExts = ['.jpg', '.jpeg', '.png'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(file.type.toLowerCase()) && !validExts.includes(ext)) {
      setScreenshotError('Invalid file format. Please select a JPG, JPEG, or PNG image.');
      setScreenshotUploadStatus('error');
      return;
    }

    // 2. Size check: 10 MB limit (10 * 1024 * 1024 bytes)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setScreenshotError('File size exceeds 10 MB limit. Please select a smaller screenshot.');
      setScreenshotUploadStatus('error');
      return;
    }

    setScreenshotFile(file);
    setScreenshotUploadStatus('selected');

    // Generate local preview
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleClearSelectedScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setScreenshotError(null);
    setScreenshotSuccess(null);
    setScreenshotUploadStatus('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (successFileInputRef.current) {
      successFileInputRef.current.value = '';
    }
  };

  const handleUploadScreenshot = async () => {
    if (!screenshotFile) {
      setScreenshotError('Please select a payment screenshot first.');
      return;
    }

    setIsUploadingScreenshot(true);
    setScreenshotUploadStatus('uploading');
    setScreenshotError(null);
    setScreenshotSuccess(null);

    try {
      // Ensure payment attempt and draft order exist in database
      if (rawUpiId) {
        await initiateUpiPayment({
          orderId: rawOrderId,
          customerId: currentUser?.id || 'guest_user',
          amount: total,
          upiId: rawUpiId,
          merchantName: effectiveMerchantName,
          transactionRef: transactionRef,
        });
      }

      const customerPhone = currentUser?.phone?.trim() || '';
      const draftOrder: CustomerOrder = {
        id: formattedOrderId,
        customerId: currentUser?.id || 'guest_user',
        customerName: currentUser?.name || 'Guest Customer',
        customerEmail: currentUser?.email,
        customerPhone: customerPhone || undefined,
        deliveryAddress: address,
        deliveryTimeSlot: 'Express Cold-Chain Delivery, 24–30 Minutes',
        estimatedDeliveryTime: 'Express Cold-Chain Delivery',
        items: [...items],
        subtotal,
        discount,
        total,
        couponCode: appliedCoupon || undefined,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        paymentMethod: 'UPI',
        paymentStatus: 'PENDING_VERIFICATION',
      };

      await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {}),
        },
        body: JSON.stringify(draftOrder),
      }).catch(() => {});

      // Upload screenshot to backend
      const res = await uploadPaymentScreenshot(
        rawOrderId,
        screenshotFile,
        currentUser?.token
      );

      if (res.success && res.screenshotUrl) {
        setUploadedScreenshotUrl(res.screenshotUrl);
        setScreenshotUploadStatus('success');
        setScreenshotSuccess('Payment proof submitted successfully. Please wait for admin verification.');
        updateOrderPaymentStatus(formattedOrderId, 'PENDING_VERIFICATION', {
          screenshotUrl: res.screenshotUrl,
        });
        updateOrderPaymentStatus(rawOrderId, 'PENDING_VERIFICATION', {
          screenshotUrl: res.screenshotUrl,
        });
      } else {
        setScreenshotUploadStatus('error');
        setScreenshotError(res.error || 'Failed to upload screenshot. Please try again.');
        if (res.alreadySubmitted) {
          setUploadedScreenshotUrl(`/api/payments/screenshot/${encodeURIComponent(rawOrderId)}`);
          setScreenshotUploadStatus('success');
          setScreenshotSuccess('Payment proof submitted successfully. Please wait for admin verification.');
        }
      }
    } catch (err: any) {
      setScreenshotUploadStatus('error');
      setScreenshotError(err.message || 'Network error while uploading screenshot. Please try again.');
    } finally {
      setIsUploadingScreenshot(false);
    }
  };

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    if (paymentMethod === 'upi' && !isUpiValid) {
      setUpiError('UPI payment is currently unavailable. Please try another payment method.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(async () => {
      setIsSubmitting(false);

      const customerPhone = currentUser?.phone?.trim() || '';
      const isUpiOrder = paymentMethod === 'upi';
      const orderPaymentMethod = isUpiOrder ? 'UPI' : 'Cash on Delivery';
      // If proof was uploaded successfully, set PENDING_VERIFICATION; else PAYMENT_ATTEMPTED
      const orderPaymentStatus = isUpiOrder
        ? (uploadedScreenshotUrl ? 'PENDING_VERIFICATION' : 'PAYMENT_ATTEMPTED')
        : 'Pending';

      // Save order to customer account history
      const newCustomerOrder: CustomerOrder = {
        id: formattedOrderId,
        customerId: currentUser?.id || 'guest_user',
        customerName: currentUser?.name || 'Guest Customer',
        customerEmail: currentUser?.email,
        customerPhone: customerPhone || undefined,
        deliveryAddress: address,
        deliveryTimeSlot: 'Express Cold-Chain Delivery, 24–30 Minutes',
        estimatedDeliveryTime: 'Express Cold-Chain Delivery',
        items: [...items],
        subtotal,
        discount,
        total,
        couponCode: appliedCoupon || undefined,
        status: isUpiOrder ? 'Pending' : 'CONFIRMED',
        createdAt: new Date().toISOString(),
        paymentMethod: orderPaymentMethod,
        paymentStatus: orderPaymentStatus,
        screenshotUrl: uploadedScreenshotUrl || undefined,
      };
      addOrder(newCustomerOrder);

      // Save to MySQL backend
      fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {}),
        },
        body: JSON.stringify(newCustomerOrder),
      }).catch(() => {});

      onOrderPlaced?.(items, newCustomerOrder);
      setStep('success');
      onClearCart();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 600);
  };

  return (
    <div id="checkout-page-container" className="w-full flex flex-col min-h-screen">
      <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4 sm:space-y-4.5">
        {/* Step: Order Confirmed Screen */}
        {step === 'success' ? (
          <div className="checkout-panel rounded-3xl p-6 sm:p-10 max-w-2xl mx-auto my-6 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle className="w-9 h-9" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-white font-display">
                Order Received!
              </h2>
              <p className="text-sm text-slate-300">
                Your order <span className="font-bold text-white">{formattedOrderId}</span> has been
                registered successfully.
              </p>
            </div>

            {/* Delivery Details Recap */}
            <div className="checkout-subpanel rounded-2xl p-4 text-left text-xs text-slate-300 space-y-2.5">
              <div className="flex items-center gap-2 text-white font-semibold">
                <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Delivery Address</span>
              </div>
              <p className="pl-6 text-slate-400">{address}</p>

              <div className="flex items-center gap-2 text-white font-semibold pt-1">
                <Truck className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Estimated Delivery</span>
              </div>
              <p className="pl-6 text-slate-400">Express Cold-Chain Delivery, 24–30 Minutes</p>

              <div className="flex items-center gap-2 text-white font-semibold pt-1">
                <CreditCard className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Payment Details</span>
              </div>
              {paymentMethod === 'upi' ? (
                <div className="pl-6 space-y-3">
                  {uploadedScreenshotUrl ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <p className="text-amber-400 font-semibold text-xs sm:text-sm">
                          UPI Payment (Status: PENDING_VERIFICATION)
                        </p>
                        <span className="text-[10px] uppercase font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-full">
                          Pending Admin Approval
                        </span>
                      </div>
                      <div className="p-3 bg-emerald-950/50 border border-emerald-500/30 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Payment proof submitted successfully. Please wait for admin verification.</span>
                      </div>
                      <p className="text-slate-400 text-xs">
                        An administrator will verify the transaction before confirming the order as Paid. Delivery OTP will be dispatched upon admin approval.
                      </p>
                      {screenshotPreview && (
                        <div className="flex items-center gap-2.5 p-2 bg-black/40 rounded-lg border border-white/10 mt-2">
                          <img
                            src={screenshotPreview}
                            alt="Uploaded Proof"
                            className="w-12 h-12 object-cover rounded border border-white/20 shrink-0"
                          />
                          <div className="text-[11px] text-slate-300">
                            <p className="font-semibold text-emerald-400">✓ Proof Uploaded (Only One Upload Per Order)</p>
                            <p className="text-slate-400">Ref: {transactionRef}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <p className="text-amber-400 font-semibold text-xs sm:text-sm">
                          UPI Payment (Payment Attempted — Reference: {transactionRef})
                        </p>
                        <span className="text-[10px] uppercase font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-full">
                          Proof Required
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs">
                        Please upload your UPI payment screenshot to initiate admin verification.
                      </p>

                      {/* Embedded upload widget on order received screen */}
                      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-3">
                        <input
                          ref={successFileInputRef}
                          type="file"
                          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                          className="hidden"
                          onChange={handleFileSelect}
                        />

                        {screenshotFile ? (
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2 p-2 bg-black/40 rounded-lg border border-white/10">
                              {screenshotPreview && (
                                <img
                                  src={screenshotPreview}
                                  alt="Selected proof"
                                  className="w-12 h-12 object-cover rounded border border-white/20 shrink-0"
                                />
                              )}
                              <div className="flex-1 min-w-0 text-xs">
                                <p className="font-semibold text-white truncate">{screenshotFile.name}</p>
                                <p className="text-[11px] text-slate-400">
                                  {(screenshotFile.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={handleClearSelectedScreenshot}
                                className="p-1 text-slate-400 hover:text-rose-400"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <button
                              type="button"
                              disabled={isUploadingScreenshot}
                              onClick={handleUploadScreenshot}
                              className="w-full py-2 px-3 rounded-lg checkout-neon-btn text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              {isUploadingScreenshot ? (
                                <>
                                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  <span>Uploading Screenshot...</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>Upload Payment Screenshot</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => successFileInputRef.current?.click()}
                            className="w-full py-2.5 px-3 rounded-lg border border-dashed border-cyan-500/40 hover:border-cyan-400 bg-cyan-950/20 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all"
                          >
                            <Upload className="w-4 h-4 text-cyan-400" />
                            <span>Select & Upload Payment Screenshot</span>
                          </button>
                        )}

                        {screenshotError && (
                          <p className="text-[11px] text-rose-400 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{screenshotError}</span>
                          </p>
                        )}
                        {screenshotSuccess && (
                          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{screenshotSuccess}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="pl-6 text-slate-400">Cash on Delivery (Pending Doorstep Collection)</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigateToDashboard?.()}
                className="flex-1 py-3 px-4 rounded-xl checkout-neon-btn text-white text-sm font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>View Order in Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigateToStorefront?.()}
                className="py-3 px-5 rounded-xl checkout-subpanel hover:bg-slate-800 text-white text-sm font-semibold transition-all cursor-pointer"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        ) : (
          /* Step: Details */
          <>
            {/* 1. CHECKOUT HEADER */}
            <div className="checkout-panel rounded-2xl p-4 sm:p-5 flex items-center gap-4">
              <button
                type="button"
                id="checkout-back-to-cart-btn"
                onClick={onBackToCart}
                className="w-10 h-10 rounded-full bg-[#051c33] border border-cyan-500/30 hover:border-cyan-400/60 hover:bg-[#072440] text-cyan-400 transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-sm active:scale-95"
                title="Return to Cart"
              >
                <ArrowLeft className="w-5 h-5 text-cyan-400" />
              </button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight font-display">
                  Checkout
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Complete your delivery and payment information
                </p>
              </div>
            </div>

            {/* 2. DELIVERY ADDRESS & TIME SLOT */}
            <div className="checkout-panel rounded-2xl p-5 sm:p-6 space-y-3.5">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight font-display">
                  Delivery Address & Time Slot
                </h2>
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-normal">
                    Delivery Address
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter delivery street address"
                    className="checkout-input w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-normal">
                    Delivery Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                    placeholder="e.g. Leave with doorman in thermal tote"
                    className="checkout-input w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none"
                  />
                </div>

                <div className="checkout-subpanel w-full px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm text-slate-300">
                  <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Express Cold-Chain Delivery, 24–30 Minutes</span>
                </div>
              </div>
            </div>

            {/* 3. SELECT PAYMENT METHOD */}
            <div className="checkout-panel rounded-2xl p-5 sm:p-6 space-y-4 sm:space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-400 shrink-0" />
                  <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight font-display">
                    Select Payment Method
                  </h2>
                </div>
                <span className="text-xs sm:text-sm text-cyan-400 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Verified</span>
                </span>
              </div>

              {/* Payment Method Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                {/* Cash on Delivery Option */}
                <div
                  id="checkout-payment-cash-opt"
                  data-testid="checkout-payment-cash-opt"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-4 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between ${
                    paymentMethod === 'cash'
                      ? 'checkout-card-selected'
                      : 'checkout-subpanel hover:border-cyan-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          paymentMethod === 'cash'
                            ? 'bg-[#00d2aa] text-[#030d1a]'
                            : 'border border-slate-600'
                        }`}
                      >
                        {paymentMethod === 'cash' && (
                          <div className="w-2 h-2 rounded-full bg-[#030d1a]" />
                        )}
                      </div>
                      <span className="text-sm sm:text-base font-bold text-white">
                        Cash on Delivery
                      </span>
                    </div>
                    <Banknote className="w-5 h-5 text-cyan-400 shrink-0" />
                  </div>
                  <div className="mt-2.5">
                    <p className="text-xs text-slate-400">Pay cash upon doorstep delivery</p>
                  </div>
                </div>

                {/* Direct UPI Payment Option */}
                <div
                  id="checkout-payment-upi-opt"
                  data-testid="checkout-payment-upi-opt"
                  onClick={() => {
                    setPaymentMethod('upi');
                    setIsLoadingUpiSettings(true);
                    fetchUpiSettings()
                      .then((s) => {
                        setUpiSettings(s);
                      })
                      .catch((err) => {
                        console.error('[Checkout UPI] Fetch error on selection:', err);
                      })
                      .finally(() => {
                        setIsLoadingUpiSettings(false);
                      });
                  }}
                  className={`p-4 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between ${
                    paymentMethod === 'upi'
                      ? 'checkout-card-selected'
                      : 'checkout-subpanel hover:border-cyan-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          paymentMethod === 'upi'
                            ? 'bg-[#00d2aa] text-[#030d1a]'
                            : 'border border-slate-600'
                        }`}
                      >
                        {paymentMethod === 'upi' && (
                          <div className="w-2 h-2 rounded-full bg-[#030d1a]" />
                        )}
                      </div>
                      <span className="text-sm sm:text-base font-bold text-white">
                        Pay via UPI
                      </span>
                    </div>
                    <QrCode className="w-5 h-5 text-cyan-400 shrink-0" />
                  </div>
                  <div className="mt-2.5">
                    <p className="text-xs text-slate-400">
                      Instant direct UPI & Desktop QR Code
                    </p>
                  </div>
                </div>
              </div>

              {/* Cash on Delivery Details */}
              {paymentMethod === 'cash' && (
                <div
                  id="checkout-cash-details-panel"
                  className="checkout-subpanel rounded-xl sm:rounded-2xl p-4 sm:p-5 text-xs text-slate-300 space-y-1 text-center max-w-md"
                >
                  <p className="font-semibold text-white">Doorstep Payment Selected</p>
                  <p className="text-slate-400">
                    Please keep exact cash ready upon delivery handover.
                  </p>
                </div>
              )}

              {/* UPI Details & QR/Mobile Payment Panel */}
              {paymentMethod === 'upi' && (
                <div
                  id="checkout-upi-details-panel"
                  className="checkout-subpanel rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-5 max-w-xl"
                >
                  {/* Validation Error Message */}
                  {!isLoadingUpiSettings && !isUpiValid ? (
                    <div
                      id="checkout-upi-unavailable-msg"
                      className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs sm:text-sm flex items-center gap-2.5"
                    >
                      <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
                      <span>
                        UPI payment is currently unavailable.
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Merchant & Amount Info Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/10 gap-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                            Payee Merchant
                          </p>
                          <p className="text-sm font-bold text-white">
                            {effectiveMerchantName}
                          </p>
                          <p className="text-xs text-slate-400 tabular-nums">
                            {rawUpiId}
                          </p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                            Amount to Pay
                          </p>
                          <p className="text-xl font-extrabold text-[#00e699] tabular-nums font-display">
                            {formatINR(total)}
                          </p>
                        </div>
                      </div>

                      {/* Clean Non-Interactive QR Code */}
                      <div className="flex flex-col items-center justify-center space-y-3 py-2">
                        <div className="p-3 bg-white rounded-2xl shadow-xl border border-white/20">
                          {isQrGenerating || !qrCodeDataUrl ? (
                            <div className="w-48 h-48 flex items-center justify-center bg-slate-100 rounded-xl">
                              <span className="w-6 h-6 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
                            </div>
                          ) : (
                            <img
                              id="checkout-upi-qr-image"
                              data-upi-uri={upiUri}
                              src={qrCodeDataUrl}
                              alt="Scan QR code with UPI app"
                              className="w-48 h-48 rounded-xl object-contain pointer-events-none select-none"
                            />
                          )}
                        </div>

                        <div className="text-center space-y-1">
                          <p className="text-sm font-bold text-white">
                            Scan this QR code with your UPI app
                          </p>
                          <p className="text-xs text-slate-400 max-w-sm">
                            Scan using Google Pay, PhonePe, Paytm, BHIM, or another compatible UPI app.
                          </p>
                        </div>
                      </div>

                      {/* MOBILE VIEW: "Pay via UPI" Button */}
                      <div className="sm:hidden flex flex-col items-center space-y-3">
                        <button
                          type="button"
                          id="checkout-mobile-upi-pay-btn"
                          disabled={isInitiatingMobileUpi || !upiUri}
                          onClick={handleMobilePayViaUpi}
                          className="w-full py-3.5 px-6 rounded-xl checkout-neon-btn text-white text-sm font-bold shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                          {isInitiatingMobileUpi ? (
                            <>
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Opening UPI App...</span>
                            </>
                          ) : (
                            <>
                              <Smartphone className="w-4 h-4" />
                              <span>Pay via UPI ({formatINR(total)})</span>
                              <ExternalLink className="w-3.5 h-3.5 ml-1" />
                            </>
                          )}
                        </button>
                        <p className="text-[11px] text-slate-400 text-center">
                          Tap to open your installed UPI app (Google Pay, PhonePe, Paytm, BHIM).
                        </p>
                      </div>

                      {/* Return State / Informative Notice */}
                      {upiActionTriggered && (
                        <div
                          id="checkout-upi-return-notice"
                          className="p-3.5 bg-sky-950/40 rounded-xl border border-sky-500/30 text-sky-200 text-xs space-y-1 animate-fadeIn"
                        >
                          <p className="font-semibold text-white flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-sky-400" />
                            <span>Payment In Progress</span>
                          </p>
                          <p className="text-slate-300">
                            Complete the payment in your UPI app. Payment confirmation is not available automatically.
                          </p>
                        </div>
                      )}

                      {/* Error Message if payment initiation fails */}
                      {upiError && (
                        <div className="p-3 bg-rose-950/40 text-rose-300 rounded-xl text-xs font-medium border border-rose-500/30">
                          {upiError}
                        </div>
                      )}

                      {/* ----------------- UPLOAD PAYMENT SCREENSHOT SECTION ----------------- */}
                      <div
                        id="checkout-upload-screenshot-section"
                        className="p-4 rounded-2xl bg-[#041426]/90 border border-cyan-500/30 space-y-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/30">
                              <Upload className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                <span>Upload Payment Screenshot</span>
                                <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                                  Proof of Payment
                                </span>
                              </h4>
                              <p className="text-xs text-slate-400">
                                Upload a screenshot of your successful UPI transfer after completing payment.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Hidden native file input */}
                        <input
                          ref={fileInputRef}
                          id="checkout-screenshot-file-input"
                          type="file"
                          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                          className="hidden"
                          onChange={handleFileSelect}
                        />

                        {/* Already Uploaded State */}
                        {uploadedScreenshotUrl ? (
                          <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-emerald-300 font-semibold text-xs">
                                <CheckCircle className="w-4 h-4 text-emerald-400" />
                                <span>Payment Proof Submitted</span>
                              </div>
                              <span className="text-[10px] uppercase font-bold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                Pending Verification
                              </span>
                            </div>

                            <p className="text-xs text-emerald-300/95 font-medium bg-emerald-950/60 border border-emerald-500/30 p-2.5 rounded-lg">
                              Payment proof submitted successfully. Please wait for admin verification.
                            </p>

                            <div className="flex items-center gap-3 bg-black/40 p-2.5 rounded-lg border border-white/10">
                              {screenshotPreview && (
                                <img
                                  src={screenshotPreview}
                                  alt="Payment Screenshot Preview"
                                  className="w-14 h-14 object-cover rounded-md border border-white/20"
                                />
                              )}
                              <div className="flex-1 min-w-0 text-xs">
                                <p className="font-medium text-white truncate">
                                  {screenshotFile ? screenshotFile.name : 'Payment Screenshot Proof'}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {screenshotFile ? `${(screenshotFile.size / (1024 * 1024)).toFixed(2)} MB • ` : ''}
                                  Status: PENDING_VERIFICATION
                                </p>
                                <p className="text-[11px] text-emerald-400 font-medium mt-0.5">
                                  ✓ Upload complete — Only one upload allowed per order
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : screenshotFile ? (
                          /* File Selected, ready to upload */
                          <div className="space-y-3">
                            <div className="p-3 bg-slate-900/90 rounded-xl border border-white/10 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                {screenshotPreview && (
                                  <img
                                    src={screenshotPreview}
                                    alt="Selected preview"
                                    className="w-14 h-14 object-cover rounded-lg border border-white/10 shrink-0"
                                  />
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-white truncate max-w-[200px] sm:max-w-xs">
                                    {screenshotFile.name}
                                  </p>
                                  <p className="text-[11px] text-slate-400">
                                    {(screenshotFile.size / (1024 * 1024)).toFixed(2)} MB • {screenshotFile.type || 'image'}
                                  </p>
                                  <p className="text-[10px] text-amber-400 font-medium">Ready to upload</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={handleClearSelectedScreenshot}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5 transition-all cursor-pointer"
                                title="Remove file"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Upload Button */}
                            <button
                              type="button"
                              id="checkout-upload-screenshot-btn"
                              disabled={isUploadingScreenshot}
                              onClick={handleUploadScreenshot}
                              className="w-full py-2.5 px-4 rounded-xl checkout-neon-btn text-white text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              {isUploadingScreenshot ? (
                                <>
                                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  <span>Uploading Screenshot...</span>
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4" />
                                  <span>Confirm & Upload Screenshot</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          /* Drop zone / File selector trigger */
                          <div
                            id="checkout-screenshot-dropzone"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const files = e.dataTransfer.files;
                              if (files && files.length > 0) {
                                const dummyEvent = {
                                  target: { files: files },
                                } as unknown as React.ChangeEvent<HTMLInputElement>;
                                handleFileSelect(dummyEvent);
                              }
                            }}
                            className="border-2 border-dashed border-cyan-500/30 hover:border-cyan-400/60 rounded-xl p-5 text-center cursor-pointer transition-all bg-cyan-950/20 hover:bg-cyan-950/30 group"
                          >
                            <div className="w-10 h-10 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
                              <Upload className="w-5 h-5 text-cyan-400" />
                            </div>
                            <p className="text-xs font-semibold text-white">
                              Click or drag screenshot here to upload
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Supports JPG, JPEG, PNG (max 10 MB)
                            </p>
                          </div>
                        )}

                        {/* Error Notification */}
                        {screenshotError && (
                          <div
                            id="checkout-screenshot-error"
                            className="p-3 bg-rose-950/50 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2"
                          >
                            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                            <span>{screenshotError}</span>
                          </div>
                        )}

                        {/* Success Notification */}
                        {screenshotSuccess && !screenshotError && (
                          <div
                            id="checkout-screenshot-success"
                            className="p-3 bg-emerald-950/50 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2"
                          >
                            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                            <span>{screenshotSuccess}</span>
                          </div>
                        )}

                        <div className="text-[11px] text-slate-400 flex items-start gap-1.5 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-white/5">
                          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>Note:</strong> Uploading proof sets status to <em>Pending Verification</em>.
                            An admin will inspect the transaction proof before marking the order as Paid and dispatching your OTP.
                          </span>
                        </div>
                      </div>

                      {/* Transaction Reference Footer */}
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Transaction Ref:</span>
                        <span className="font-mono text-slate-300">{transactionRef}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 4. ORDER SUMMARY & PLACE ORDER */}
            <div className="checkout-panel rounded-2xl p-6 sm:p-8">
              <div className="w-full max-w-md mx-auto space-y-5 text-center">
                {/* Centered Heading */}
                <div className="flex items-center justify-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-cyan-400 shrink-0" />
                  <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight font-display">
                    Order Summary
                  </h2>
                </div>

                {/* Optional Cart Items Peek */}
                {items.length > 0 && (
                  <div className="text-xs text-slate-400">
                    <button
                      type="button"
                      onClick={() => setShowItemsList(!showItemsList)}
                      className="hover:text-cyan-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer text-slate-400"
                    >
                      <span>
                        {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} in cart
                      </span>
                      <span className="text-[10px] text-cyan-400 underline">
                        {showItemsList ? 'Hide items' : 'View items'}
                      </span>
                    </button>

                    {showItemsList && (
                      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1 text-left">
                        {items.map((item) => (
                          <div
                            key={item.product.id}
                            className="flex items-center gap-2.5 checkout-subpanel p-2 rounded-lg text-xs"
                          >
                            <img
                              src={item.product.image}
                              alt={item.product.title}
                              className="w-8 h-8 rounded object-cover bg-slate-800 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium truncate">{item.product.title}</p>
                              <span className="text-slate-400">
                                Qty: {item.quantity} × {formatINR(item.product.price)}
                              </span>
                            </div>
                            <span className="font-semibold text-white tabular-nums shrink-0">
                              {formatINR(item.product.price * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Financial Breakdown */}
                <div className="space-y-3 pt-1">
                  {/* Subtotal */}
                  <div className="flex justify-between items-center text-sm text-slate-300">
                    <span>Subtotal</span>
                    <span className="font-semibold text-white tabular-nums">
                      {formatINR(subtotal)}
                    </span>
                  </div>

                  {/* Delivery Charges */}
                  <div className="flex justify-between items-center text-sm text-slate-300">
                    <span>Delivery Charges</span>
                    <span
                      className={`tabular-nums ${
                        deliveryChargesAmount > 0
                          ? 'font-semibold text-white'
                          : 'text-emerald-400 font-semibold'
                      }`}
                    >
                      {items.length === 0
                        ? '₹0'
                        : deliveryChargesAmount > 0
                        ? formatINR(deliveryChargesAmount)
                        : 'FREE'}
                    </span>
                  </div>

                  {/* Coupon Discount (if applicable) */}
                  {discount > 0 && activeCoupon && (
                    <div className="flex justify-between items-center text-sm text-emerald-400 font-medium">
                      <span>Discount ({activeCoupon.discountPercentage}% OFF)</span>
                      <span className="tabular-nums font-semibold">-{formatINR(discount)}</span>
                    </div>
                  )}

                  {/* Final Total */}
                  <div className="flex justify-between items-baseline pt-3 border-t border-[#0c2b4a]">
                    <span className="text-base sm:text-lg font-bold text-white">Final Total</span>
                    <span className="text-2xl sm:text-3xl font-extrabold text-[#00e699] tabular-nums font-display">
                      {formatINR(total)}
                    </span>
                  </div>
                </div>

                {/* Place Order Button */}
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    id="checkout-place-order-btn"
                    disabled={
                      items.length === 0 ||
                      isSubmitting ||
                      (paymentMethod === 'upi' && !isUpiValid)
                    }
                    onClick={handlePlaceOrder}
                    className={`w-full max-w-sm py-3.5 px-6 rounded-xl text-sm sm:text-base font-bold transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                      items.length === 0 ||
                      isSubmitting ||
                      (paymentMethod === 'upi' && !isUpiValid)
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                        : 'checkout-neon-btn text-white active:scale-[0.99]'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Processing Order...</span>
                      </>
                    ) : (
                      <>
                        <span>
                          {paymentMethod === 'upi'
                            ? `Confirm UPI Order (${formatINR(total)}) →`
                            : `Place Order (${formatINR(total)}) →`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <Footer
        onOpenAdmin={onOpenAdmin}
        onSelectCategory={onSelectCategory}
        onOpenLogin={onOpenLogin}
        onOpenDashboard={onOpenDashboard}
      />
    </div>
  );
};
