import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { isPhoneRegistered } from '../services/authService';
import {
  validateIndianMobileNumber,
  sendRegistrationOtp,
  verifyRegistrationOtp,
  resendRegistrationOtp,
} from '../services/registrationOtpService';
import { BRAND_LOGO_URL } from '../data/products';
import {
  User,
  Mail,
  Phone,
  Lock,
  MapPin,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Check,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

interface RegisterPageProps {
  onNavigateToLogin: () => void;
  onRegisterSuccess: () => void;
  onNavigateToAdmin?: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({
  onNavigateToLogin,
  onRegisterSuccess,
}) => {
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(''); // 10-digit Indian mobile number
  const [otp, setOtp] = useState(''); // 6-digit OTP
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address, setAddress] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // OTP State
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Messages
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 30-Second Resend Cooldown Countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Simple password strength calculation
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strengthScore = [hasMinLength, hasLetter, hasNumber, hasSpecial].filter(Boolean).length;

  // Handle phone input changes (10 digits only)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(digitsOnly);
    setPhoneError(null);

    // If mobile number is modified after verification, reset verified state
    // Prevents tampering attack where user verifies one number and registers another
    if (isVerified) {
      setIsVerified(false);
      setVerifiedPhone(null);
      setVerificationToken(null);
      setIsOtpSent(false);
      setOtp('');
      setOtpSuccess(null);
    }
  };

  // Send OTP
  const handleSendOtp = async () => {
    setPhoneError(null);
    setOtpError(null);
    setOtpSuccess(null);
    setErrorMessage(null);

    const validation = validateIndianMobileNumber(phone);
    if (!validation.isValid || !validation.normalized) {
      setPhoneError(validation.error || 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    // Duplicate mobile number check before sending OTP
    if (isPhoneRegistered(phone)) {
      setPhoneError('This mobile number is already registered. Please use another number or log in.');
      return;
    }

    setOtpSending(true);
    try {
      const res = await sendRegistrationOtp(validation.normalized);
      if (res.success) {
        setIsOtpSent(true);
        setResendCooldown(res.cooldownSeconds || 30);
        setOtpSuccess(`OTP sent to ${res.maskedPhone || 'your mobile number'}.`);
      } else {
        setPhoneError(res.error || 'OTP could not be sent. Please verify the mobile number or try again later.');
        if (res.cooldownSeconds) {
          setResendCooldown(res.cooldownSeconds);
        }
      }
    } catch {
      setPhoneError('OTP could not be sent. Please verify the mobile number or try again later.');
    } finally {
      setOtpSending(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || otpSending) return;
    setOtpError(null);
    setOtpSuccess(null);
    setErrorMessage(null);

    const validation = validateIndianMobileNumber(phone);
    if (!validation.isValid || !validation.normalized) {
      setPhoneError(validation.error || 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setOtpSending(true);
    try {
      const res = await resendRegistrationOtp(validation.normalized);
      if (res.success) {
        setResendCooldown(res.cooldownSeconds || 30);
        setOtpSuccess(`New OTP sent to ${res.maskedPhone || 'your mobile number'}.`);
        setOtp('');
      } else {
        setOtpError(res.error || 'Failed to resend OTP. Please try again.');
        if (res.cooldownSeconds) {
          setResendCooldown(res.cooldownSeconds);
        }
      }
    } catch {
      setOtpError('Failed to resend OTP. Please check connection.');
    } finally {
      setOtpSending(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async () => {
    setOtpError(null);
    setOtpSuccess(null);
    setErrorMessage(null);

    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setOtpError('Please enter the 6-digit OTP code.');
      return;
    }

    const validation = validateIndianMobileNumber(phone);
    if (!validation.isValid || !validation.normalized) {
      setPhoneError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setOtpVerifying(true);
    try {
      const res = await verifyRegistrationOtp(validation.normalized, cleanOtp);
      if (res.success) {
        setIsVerified(true);
        setVerifiedPhone(validation.normalized);
        setVerificationToken(res.verificationToken || null);
        setOtpSuccess('✓ Mobile number verified');
        setOtpError(null);
      } else {
        setOtpError(res.error || 'Invalid OTP. Please try again.');
      }
    } catch {
      setOtpError('Invalid OTP. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  };

  // Validate form completeness and mobile verification
  const phoneValidation = validateIndianMobileNumber(phone);
  const isPhoneValid = phoneValidation.isValid;
  const isPhoneMatchedAndVerified = isVerified && verifiedPhone === phoneValidation.normalized;
  const isFormValid =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    email.includes('@') &&
    isPhoneValid &&
    isPhoneMatchedAndVerified &&
    address.trim().length > 0 &&
    password.length >= 6 &&
    confirmPassword === password;

  const isRegisterDisabled = !isFormValid || isSubmitting;

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    const validation = validateIndianMobileNumber(phone);
    if (!validation.isValid || !validation.normalized) {
      setPhoneError(validation.error || 'Please enter a valid 10-digit Indian mobile number.');
      setErrorMessage('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (!isVerified || !verifiedPhone || verifiedPhone !== validation.normalized) {
      setErrorMessage('Please verify your mobile number with OTP before completing registration.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify.');
      return;
    }
    if (!address.trim()) {
      setErrorMessage('Please provide your default delivery address for 30-min fulfillment.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await register({
        name: name.trim(),
        email: email.trim(),
        phone: validation.normalized, // E.164: +91XXXXXXXXXX
        password,
        address: address.trim(),
        verificationToken: verificationToken || undefined,
      });

      if (res.success) {
        onRegisterSuccess();
      } else {
        setErrorMessage(res.error || 'Failed to create customer account. Please try again.');
      }
    } catch {
      setErrorMessage('An unexpected error occurred during account creation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-10">
      {/* Top Banner Navigation */}
      <div className="w-full max-w-lg mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onNavigateToLogin}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#565e74] hover:text-[#006b2c] transition-colors group cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to Sign In</span>
        </button>

        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#006b2c] bg-white/35 backdrop-blur-xs px-2.5 py-1 rounded-full border border-white/50">
          New Customer Registration
        </span>
      </div>

      {/* Main Register Card - Crystal Clear Glass */}
      <div className="w-full max-w-lg bg-white/35 backdrop-blur-md rounded-3xl shadow-xl border border-white/55 overflow-hidden">
        {/* Header */}
        <div className="bg-white/20 backdrop-blur-xs p-6 sm:p-7 text-center border-b border-white/50">
          <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-white/40 backdrop-blur-xs shadow-2xs border border-white/60 mb-3">
            <img
              src={BRAND_LOGO_URL}
              alt="FreshCart Logo"
              className="h-8 w-auto object-contain"
            />
          </div>
          <h1 className="text-[22px] sm:text-[26px] font-bold text-[#0b1c30] font-display">
            Create FreshCart Account
          </h1>
          <p className="text-[13px] text-[#565e74] mt-1">
            Unlock fast 30-min neighborhood delivery, order history, and exclusive organic perks
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/35 backdrop-blur-xs text-[#15803d] text-[11px] font-semibold border border-white/60 shadow-2xs">
            <Sparkles className="w-3 h-3 text-[#16a34a]" />
            <span>New Member Bonus: 10% Off Your First Order</span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleRegisterSubmit} className="p-6 sm:p-7 space-y-4">
          {/* Global Form Error Message */}
          {errorMessage && (
            <div
              id="register-error-alert"
              className="p-3.5 rounded-xl bg-[#fef2f2] border border-[#fecaca] text-[#991b1b] text-[13px] flex items-start gap-2.5 animate-in fade-in duration-200"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#dc2626]" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Full Name */}
          <div className="space-y-1">
            <label
              htmlFor="reg-name"
              className="block text-[12px] font-semibold text-[#0b1c30]"
            >
              Customer Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <User className="absolute left-3.5 w-4 h-4 text-[#6e7b6c] pointer-events-none" />
              <input
                id="reg-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jordan Miller"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white/35 backdrop-blur-xs border border-white/55 text-[13px] text-[#0b1c30] placeholder:text-[#565e74]/70 focus:outline-hidden focus:bg-white/60 focus:ring-2 focus:ring-[#006b2c] focus:border-white/80 transition-all"
              />
            </div>
          </div>

          {/* Email / User ID */}
          <div className="space-y-1">
            <label
              htmlFor="reg-email"
              className="block text-[12px] font-semibold text-[#0b1c30]"
            >
              Email / User ID <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <Mail className="absolute left-3.5 w-4 h-4 text-[#6e7b6c] pointer-events-none" />
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white/35 backdrop-blur-xs border border-white/55 text-[13px] text-[#0b1c30] placeholder:text-[#565e74]/70 focus:outline-hidden focus:bg-white/60 focus:ring-2 focus:ring-[#006b2c] focus:border-white/80 transition-all"
              />
            </div>
          </div>

          {/* Mobile Number & OTP Verification Section */}
          <div className="space-y-3 p-3.5 rounded-2xl bg-white/30 backdrop-blur-xs border border-white/50">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="reg-mobile"
                  className="block text-[12px] font-semibold text-[#0b1c30]"
                >
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                {isVerified && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-full border border-emerald-200">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>✓ Mobile number verified</span>
                  </span>
                )}
              </div>

              {/* Mobile Number Input with fixed +91 prefix and Send OTP button */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 flex items-center">
                  <span className="absolute left-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#0b1c30] select-none pointer-events-none pr-2.5 border-r border-[#6e7b6c]/30">
                    <span>🇮🇳</span>
                    <span>+91</span>
                  </span>
                  <input
                    id="reg-mobile"
                    type="tel"
                    required
                    disabled={isVerified}
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    className={`w-full pl-20 pr-3.5 py-2.5 rounded-xl bg-white/40 backdrop-blur-xs border text-[13px] text-[#0b1c30] font-medium tracking-wide placeholder:text-[#565e74]/70 placeholder:font-normal placeholder:tracking-normal focus:outline-hidden focus:bg-white/70 focus:ring-2 focus:ring-[#006b2c] transition-all ${
                      phoneError ? 'border-red-400 bg-red-50/20' : 'border-white/55'
                    } ${isVerified ? 'bg-emerald-50/30 border-emerald-300 cursor-not-allowed text-emerald-900' : ''}`}
                  />
                </div>

                {!isVerified && (
                  <button
                    type="button"
                    id="send-otp-btn"
                    onClick={handleSendOtp}
                    disabled={otpSending || phone.length !== 10}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-[#006b2c] hover:bg-[#00873a] active:scale-[0.99] text-white text-[13px] font-semibold shadow-xs transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {otpSending ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        <span>Sending OTP...</span>
                      </>
                    ) : (
                      <span>Send OTP</span>
                    )}
                  </button>
                )}
              </div>

              {/* Consent Message */}
              {!isVerified && (
                <p className="text-[11px] text-[#565e74] leading-relaxed pt-0.5">
                  By requesting an OTP, you agree to receive a verification message on this mobile number.
                </p>
              )}

              {/* Phone validation / send error */}
              {phoneError && (
                <div
                  id="phone-error-msg"
                  className="text-[12px] font-medium text-red-600 flex items-center gap-1 mt-1 animate-in fade-in duration-150"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                  <span>{phoneError}</span>
                </div>
              )}
            </div>

            {/* OTP Verification Controls (shown after OTP is sent and before verified) */}
            {isOtpSent && !isVerified && (
              <div className="pt-3 border-t border-white/40 space-y-2 animate-in fade-in duration-200">
                <label
                  htmlFor="reg-otp"
                  className="block text-[12px] font-semibold text-[#0b1c30]"
                >
                  OTP <span className="text-red-500">*</span>
                </label>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1 flex items-center">
                    <input
                      id="reg-otp"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setOtpError(null);
                      }}
                      placeholder="Enter 6-digit OTP"
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-white/40 backdrop-blur-xs border text-[14px] font-mono tracking-widest text-[#0b1c30] placeholder:text-[#565e74]/70 placeholder:font-sans placeholder:tracking-normal focus:outline-hidden focus:bg-white/70 focus:ring-2 focus:ring-[#006b2c] transition-all ${
                        otpError ? 'border-red-400 bg-red-50/20' : 'border-white/55'
                      }`}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Verify OTP Button (disabled after verified) */}
                    <button
                      type="button"
                      id="verify-otp-btn"
                      onClick={handleVerifyOtp}
                      disabled={otpVerifying || otp.length !== 6 || isVerified}
                      className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-[#006b2c] hover:bg-[#00873a] text-white text-[13px] font-semibold shadow-xs transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {otpVerifying ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <span>Verify OTP</span>
                      )}
                    </button>

                    {/* Resend OTP Button with 30-Second Cooldown */}
                    <button
                      type="button"
                      id="resend-otp-btn"
                      onClick={handleResendOtp}
                      disabled={resendCooldown > 0 || otpSending || isVerified}
                      className="px-3 py-2.5 rounded-xl bg-white/50 hover:bg-white/80 border border-white/60 text-[#0b1c30] text-[12px] font-semibold transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                    </button>
                  </div>
                </div>

                {/* OTP Error Message */}
                {otpError && (
                  <div
                    id="otp-error-msg"
                    className="text-[12px] font-medium text-red-600 flex items-center gap-1 animate-in fade-in duration-150"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                    <span>{otpError}</span>
                  </div>
                )}

                {/* OTP Sent Success Message */}
                {otpSuccess && !otpError && (
                  <div
                    id="otp-success-msg"
                    className="text-[12px] font-medium text-emerald-700 flex items-center gap-1 animate-in fade-in duration-150"
                  >
                    <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    <span>{otpSuccess}</span>
                  </div>
                )}
              </div>
            )}

            {/* Verified Banner */}
            {isVerified && (
              <div
                id="mobile-verified-banner"
                className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12px] font-semibold flex items-center justify-between animate-in fade-in duration-150"
              >
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>✓ Mobile number verified</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsVerified(false);
                    setVerifiedPhone(null);
                    setVerificationToken(null);
                    setIsOtpSent(false);
                    setOtp('');
                    setOtpSuccess(null);
                  }}
                  className="text-[11px] font-medium text-[#565e74] hover:text-[#0b1c30] underline cursor-pointer"
                >
                  Change number
                </button>
              </div>
            )}
          </div>

          {/* Delivery Address */}
          <div className="space-y-1">
            <label
              htmlFor="reg-address"
              className="block text-[12px] font-semibold text-[#0b1c30]"
            >
              Primary Delivery Address <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <MapPin className="absolute left-3.5 w-4 h-4 text-[#6e7b6c] pointer-events-none" />
              <input
                id="reg-address"
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Apartment, suite, street address..."
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white/35 backdrop-blur-xs border border-white/55 text-[13px] text-[#0b1c30] placeholder:text-[#565e74]/70 focus:outline-hidden focus:bg-white/60 focus:ring-2 focus:ring-[#006b2c] focus:border-white/80 transition-all"
              />
            </div>
          </div>

          {/* Passwords in 2-col grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="reg-password"
                className="block text-[12px] font-semibold text-[#0b1c30]"
              >
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-4 h-4 text-[#6e7b6c] pointer-events-none" />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/35 backdrop-blur-xs border border-white/55 text-[13px] text-[#0b1c30] placeholder:text-[#565e74]/70 focus:outline-hidden focus:bg-white/60 focus:ring-2 focus:ring-[#006b2c] focus:border-white/80 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-[#6e7b6c] hover:text-[#0b1c30] cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="reg-confirm-password"
                className="block text-[12px] font-semibold text-[#0b1c30]"
              >
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 w-4 h-4 text-[#6e7b6c] pointer-events-none" />
                <input
                  id="reg-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/35 backdrop-blur-xs border border-white/55 text-[13px] text-[#0b1c30] placeholder:text-[#565e74]/70 focus:outline-hidden focus:bg-white/60 focus:ring-2 focus:ring-[#006b2c] focus:border-white/80 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 text-[#6e7b6c] hover:text-[#0b1c30] cursor-pointer"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Password Strength Indicator */}
          {password.length > 0 && (
            <div className="space-y-1.5 p-3 rounded-xl bg-white/25 backdrop-blur-xs border border-white/45">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#565e74] font-medium">Password Strength:</span>
                <span
                  className={`font-bold ${
                    strengthScore <= 1
                      ? 'text-red-500'
                      : strengthScore <= 3
                        ? 'text-amber-500'
                        : 'text-emerald-600'
                  }`}
                >
                  {strengthScore <= 1 ? 'Weak' : strengthScore <= 3 ? 'Good' : 'Strong'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5 h-1.5">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`rounded-full transition-all duration-300 ${
                      strengthScore >= step
                        ? strengthScore <= 1
                          ? 'bg-red-400'
                          : strengthScore <= 3
                            ? 'bg-amber-400'
                            : 'bg-emerald-500'
                        : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#565e74] pt-1">
                <span className={hasMinLength ? 'text-emerald-600 font-semibold' : ''}>
                  {hasMinLength ? '✓' : '•'} 8+ characters
                </span>
                <span className={hasLetter ? 'text-emerald-600 font-semibold' : ''}>
                  {hasLetter ? '✓' : '•'} Letters
                </span>
                <span className={hasNumber ? 'text-emerald-600 font-semibold' : ''}>
                  {hasNumber ? '✓' : '•'} Numbers
                </span>
                <span className={hasSpecial ? 'text-emerald-600 font-semibold' : ''}>
                  {hasSpecial ? '✓' : '•'} Symbols
                </span>
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div className="p-3 rounded-xl bg-white/30 backdrop-blur-xs border border-white/50 flex items-start gap-2 text-[11px] text-[#3b4759]">
            <ShieldCheck className="w-4 h-4 text-[#006b2c] shrink-0 mt-0.5" />
            <span>
              <strong>Zero Plain-Text Storage:</strong> FreshCart cryptographically hashes your credentials using Web Crypto SHA-256 + individual salt before saving.
            </span>
          </div>

          {/* Submit Button - Disabled until verified & all fields valid */}
          <button
            type="submit"
            id="register-submit-btn"
            disabled={isRegisterDisabled}
            className="w-full py-3 rounded-xl bg-[#006b2c] hover:bg-[#00873a] hover:-translate-y-0.5 hover:shadow-lg hover:brightness-105 active:translate-y-0 active:scale-[0.99] text-white font-semibold text-[14px] shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-md disabled:hover:brightness-100"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Creating FreshCart Profile...</span>
              </div>
            ) : (
              <>
                <span>Complete Registration &amp; Start Shopping</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Existing account link */}
        <div className="bg-white/20 backdrop-blur-xs px-6 sm:px-7 py-4 border-t border-white/50 text-center">
          <p className="text-[13px] text-[#565e74]">
            Already have an account?{' '}
            <button
              type="button"
              id="goto-login-btn"
              onClick={onNavigateToLogin}
              className="font-bold text-[#006b2c] hover:underline cursor-pointer"
            >
              Sign In to Your Account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
