import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
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
  onNavigateToAdmin,
}) => {
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [address, setAddress] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Simple password strength calculation
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strengthScore = [hasMinLength, hasLetter, hasNumber, hasSpecial].filter(Boolean).length;

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
        phone: phone.trim(),
        password,
        address: address.trim(),
      });

      if (res.success) {
        onRegisterSuccess();
      } else {
        setErrorMessage(res.error || 'Failed to create customer account. Please try again.');
      }
    } catch (err) {
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

        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#006b2c] bg-[#eff4ff] px-2.5 py-1 rounded-full border border-[#cbd5e1]/40">
          New Customer Registration
        </span>
      </div>

      {/* Main Register Card */}
      <div className="w-full max-w-lg bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/80 overflow-hidden">
        {/* Header */}
        <div className="bg-linear-to-b from-white/90 to-white/60 backdrop-blur-md p-6 sm:p-7 text-center border-b border-white/70">
          <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-white/90 shadow-2xs border border-white/80 mb-3">
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

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#dcfce7]/90 text-[#15803d] text-[11px] font-semibold border border-emerald-200 shadow-2xs">
            <Sparkles className="w-3 h-3 text-[#16a34a]" />
            <span>New Member Bonus: 10% Off Your First Order</span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleRegisterSubmit} className="p-6 sm:p-7 space-y-4">
          {/* Error Message */}
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
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#f8f9ff] border border-[#cbd5e1] text-[13px] text-[#0b1c30] placeholder:text-[#94a3b8] focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#006b2c]"
              />
            </div>
          </div>

          {/* Email / User ID and Phone in 2-col grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#f8f9ff] border border-[#cbd5e1] text-[13px] text-[#0b1c30] placeholder:text-[#94a3b8] focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#006b2c]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="reg-phone"
                className="block text-[12px] font-semibold text-[#0b1c30]"
              >
                Phone Number
              </label>
              <div className="relative flex items-center">
                <Phone className="absolute left-3.5 w-4 h-4 text-[#6e7b6c] pointer-events-none" />
                <input
                  id="reg-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 019-2834"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#f8f9ff] border border-[#cbd5e1] text-[13px] text-[#0b1c30] placeholder:text-[#94a3b8] focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#006b2c]"
                />
              </div>
            </div>
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
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#f8f9ff] border border-[#cbd5e1] text-[13px] text-[#0b1c30] placeholder:text-[#94a3b8] focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#006b2c]"
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
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#f8f9ff] border border-[#cbd5e1] text-[13px] text-[#0b1c30] placeholder:text-[#94a3b8] focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#006b2c]"
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
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#f8f9ff] border border-[#cbd5e1] text-[13px] text-[#0b1c30] placeholder:text-[#94a3b8] focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-[#006b2c]"
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
            <div className="space-y-1.5 p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0]">
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
                        : 'bg-[#e2e8f0]'
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
          <div className="p-3 rounded-xl bg-[#eff4ff] border border-[#d3e4fe] flex items-start gap-2 text-[11px] text-[#3b4759]">
            <ShieldCheck className="w-4 h-4 text-[#006b2c] shrink-0 mt-0.5" />
            <span>
              <strong>Zero Plain-Text Storage:</strong> FreshCart cryptographically hashes your credentials using Web Crypto SHA-256 + individual salt before saving.
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="register-submit-btn"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-[#006b2c] hover:bg-[#00873a] hover:-translate-y-0.5 hover:shadow-lg hover:brightness-105 active:translate-y-0 active:scale-[0.99] text-white font-semibold text-[14px] shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
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
        <div className="bg-white/50 backdrop-blur-sm px-6 sm:px-7 py-4 border-t border-white/70 text-center">
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
