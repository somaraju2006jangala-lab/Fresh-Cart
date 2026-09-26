import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { BRAND_LOGO_URL } from '../data/products';
import { DEMO_CUSTOMER_EMAIL, DEMO_CUSTOMER_PASSWORD } from '../services/authService';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  KeyRound,
  X,
} from 'lucide-react';

interface LoginPageProps {
  onNavigateToRegister: () => void;
  onLoginSuccess: () => void;
  onNavigateToAdmin?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onNavigateToRegister,
  onLoginSuccess,
  onNavigateToAdmin,
}) => {
  const { login, requestReset } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotStatus, setForgotStatus] = useState<{ success: boolean; message: string } | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!identifier.trim()) {
      setErrorMessage('Please enter your email or User ID.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(identifier, password);
      if (result.success) {
        onLoginSuccess();
      } else {
        setErrorMessage(result.error || 'Invalid credentials. Please try again.');
      }
    } catch (err) {
      setErrorMessage('An unexpected error occurred during login. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFillDemo = () => {
    setIdentifier(DEMO_CUSTOMER_EMAIL);
    setPassword(DEMO_CUSTOMER_PASSWORD);
    setErrorMessage(null);
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotLoading(true);
    setForgotStatus(null);
    try {
      const res = await requestReset(forgotEmail);
      setForgotStatus(res);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-12">
      {/* Top Banner Navigation */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#006b2c] bg-white/35 backdrop-blur-xs px-3 py-1 rounded-full border border-white/50">
          <ShieldCheck className="w-3.5 h-3.5 text-[#006b2c]" />
          <span>Customer Access Portal</span>
        </div>

        {onNavigateToAdmin && (
          <button
            type="button"
            onClick={onNavigateToAdmin}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#565e74] hover:text-[#006b2c] transition-colors cursor-pointer"
          >
            <span>Ops &amp; Admin Portal →</span>
          </button>
        )}
      </div>

      {/* Main Login Card - Crystal Clear Glass */}
      <div className="w-full max-w-md bg-white/35 backdrop-blur-md rounded-3xl shadow-xl border border-white/55 overflow-hidden">
        {/* Brand Banner Top */}
        <div className="bg-white/20 backdrop-blur-xs p-6 sm:p-8 text-center border-b border-white/50">
          <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-white/40 backdrop-blur-xs shadow-2xs border border-white/60 mb-4">
            <img
              src={BRAND_LOGO_URL}
              alt="FreshCart Logo"
              className="h-9 w-auto object-contain"
            />
          </div>
          <h1 className="text-[24px] sm:text-[28px] font-bold text-[#0b1c30] font-display">
            Welcome to FreshCart
          </h1>
          <p className="text-[13px] text-[#565e74] mt-1.5">
            Log in to manage orders, live deliveries, and saved fresh grocery carts
          </p>

          {/* 1-Click Demo Login Pill */}
          <div className="mt-4 pt-3 border-t border-dashed border-white/40">
            <button
              type="button"
              onClick={handleFillDemo}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/35 hover:bg-white/60 text-[#006b2c] text-[12px] font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs border border-white/55 shadow-2xs cursor-pointer"
              title="Auto-fill pre-seeded customer credentials"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#006b2c]" />
              <span>Click to auto-fill Demo Customer Account</span>
            </button>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="p-6 sm:p-8 space-y-5">
          {/* Error Message Alert */}
          {errorMessage && (
            <div
              id="login-error-alert"
              className="p-3.5 rounded-xl bg-[#fef2f2] border border-[#fecaca] text-[#991b1b] text-[13px] flex items-start gap-2.5 animate-in fade-in duration-200"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#dc2626]" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* User ID / Email */}
          <div className="space-y-1.5">
            <label
              htmlFor="customer-email"
              className="block text-[12px] font-semibold text-[#0b1c30]"
            >
              User ID / Email Address
            </label>
            <div className="relative flex items-center">
              <Mail className="absolute left-3.5 w-4 h-4 text-[#6e7b6c] pointer-events-none" />
              <input
                id="customer-email"
                type="text"
                required
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="customer@freshcart.com"
                autoComplete="email"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white/35 backdrop-blur-xs border border-white/55 text-[13px] text-[#0b1c30] placeholder:text-[#565e74]/70 focus:outline-hidden focus:bg-white/60 focus:ring-2 focus:ring-[#006b2c] focus:border-white/80 transition-all shadow-2xs"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="customer-password"
                className="block text-[12px] font-semibold text-[#0b1c30]"
              >
                Password
              </label>
              <button
                type="button"
                id="forgot-password-link"
                onClick={() => {
                  setForgotEmail(identifier || DEMO_CUSTOMER_EMAIL);
                  setForgotStatus(null);
                  setShowForgotModal(true);
                }}
                className="text-[12px] font-semibold text-[#006b2c] hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 w-4 h-4 text-[#6e7b6c] pointer-events-none" />
              <input
                id="customer-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-white/35 backdrop-blur-xs border border-white/55 text-[13px] text-[#0b1c30] placeholder:text-[#565e74]/70 focus:outline-hidden focus:bg-white/60 focus:ring-2 focus:ring-[#006b2c] focus:border-white/80 transition-all font-body shadow-2xs"
              />
              <button
                type="button"
                id="toggle-password-visibility"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 p-1 text-[#6e7b6c] hover:text-[#0b1c30] transition-colors cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="customer-login-btn"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-[#006b2c] hover:bg-[#00873a] hover:-translate-y-0.5 hover:shadow-lg hover:brightness-105 active:translate-y-0 active:scale-[0.99] text-white font-semibold text-[14px] shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Authenticating Customer...</span>
              </div>
            ) : (
              <>
                <span>Log In &amp; Continue to Store</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Security Assurance Tag */}
          <div className="flex items-center justify-center gap-2 text-[11px] text-[#565e74] pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#006b2c]" />
            <span>Encrypted Session · SHA-256 Hashed Security</span>
          </div>
        </form>

        {/* Register Account Footer */}
        <div className="bg-white/20 backdrop-blur-xs px-6 sm:px-8 py-4 border-t border-white/50 text-center">
          <p className="text-[13px] text-[#565e74]">
            New to FreshCart?{' '}
            <button
              type="button"
              id="goto-register-btn"
              onClick={onNavigateToRegister}
              className="font-bold text-[#006b2c] hover:underline cursor-pointer"
            >
              Create Account / Register
            </button>
          </p>
        </div>
      </div>

      {/* Forgot Password Modal - Crystal Glass */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white/45 backdrop-blur-xl rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-white/60">
            <div className="p-5 border-b border-white/50 flex items-center justify-between bg-white/30 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#006b2c] text-white flex items-center justify-center shadow-2xs">
                  <KeyRound className="w-4 h-4 text-[#7ffc97]" />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[#0b1c30] font-display">
                    Reset Password
                  </h3>
                  <p className="text-[11px] text-[#565e74]">
                    Verify email to receive your password reset token
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="w-8 h-8 rounded-lg text-[#565e74] hover:bg-white/60 hover:text-[#0b1c30] flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="p-6 space-y-4">
              {forgotStatus && (
                <div
                  className={`p-3 rounded-xl text-[12px] flex items-start gap-2 ${
                    forgotStatus.success
                      ? 'bg-[#dcfce7] border border-[#bbf7d0] text-[#166534]'
                      : 'bg-[#fef2f2] border border-[#fecaca] text-[#991b1b]'
                  }`}
                >
                  {forgotStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#16a34a]" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#dc2626]" />
                  )}
                  <span>{forgotStatus.message}</span>
                </div>
              )}

              <p className="text-[13px] text-[#565e74]">
                Enter the email address registered with your FreshCart account. We will send a secure password reset link.
              </p>

              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-[#0b1c30]">
                  Your Account Email
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-white/60 text-[13px] bg-white/40 focus:bg-white/70 focus:outline-hidden focus:ring-2 focus:ring-[#006b2c]"
                />
              </div>

              <div className="pt-2 flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="px-4 py-2 rounded-xl text-[13px] font-medium text-[#565e74] hover:bg-white/40 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="px-5 py-2 rounded-xl bg-[#006b2c] hover:bg-[#00873a] text-white text-[13px] font-semibold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {forgotLoading ? (
                    <span>Sending Token...</span>
                  ) : (
                    <span>Send Reset Link</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
