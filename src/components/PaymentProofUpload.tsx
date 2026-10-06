import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldAlert,
  Loader2,
  Eye,
} from 'lucide-react';
import { PaymentProofData, PaymentVerificationStatus } from '../types';
import {
  validatePaymentProofFile,
  formatFileSize,
  uploadPaymentProof,
} from '../services/paymentProofService';

interface PaymentProofUploadProps {
  orderId: string;
  customerId: string;
  customerToken?: string;
  initialProof?: PaymentProofData | null;
  currentVerificationStatus?: PaymentVerificationStatus;
  onProofSubmitted?: (proof: PaymentProofData) => void;
  compact?: boolean;
  className?: string;
}

export const PaymentProofUpload: React.FC<PaymentProofUploadProps> = ({
  orderId,
  customerId,
  customerToken,
  initialProof,
  currentVerificationStatus,
  onProofSubmitted,
  compact = false,
  className = '',
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submittedProof, setSubmittedProof] = useState<PaymentProofData | null>(initialProof || null);
  const [verificationStatus, setVerificationStatus] = useState<PaymentVerificationStatus>(
    currentVerificationStatus || initialProof?.verificationStatus || 'NOT_UPLOADED'
  );
  const [isReplacing, setIsReplacing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialProof) {
      setSubmittedProof(initialProof);
      setVerificationStatus(initialProof.verificationStatus);
    } else if (currentVerificationStatus) {
      setVerificationStatus(currentVerificationStatus);
    }
  }, [initialProof, currentVerificationStatus]);

  // Clean up object URLs when unmounting or changing files
  useEffect(() => {
    return () => {
      if (filePreview && filePreview.startsWith('blob:')) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [filePreview]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const validation = validatePaymentProofFile(file);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'Invalid file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (filePreview && filePreview.startsWith('blob:')) {
      URL.revokeObjectURL(filePreview);
    }
    setFilePreview(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleReplaceClick = () => {
    handleRemoveFile();
    setIsReplacing(true);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  const handleSubmitProof = async () => {
    if (!selectedFile) {
      setErrorMessage('Please select a payment screenshot or PDF first.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await uploadPaymentProof({
        orderId,
        customerId,
        file: selectedFile,
        token: customerToken,
      });

      if (res.success && res.proof) {
        setSubmittedProof(res.proof);
        setVerificationStatus('PENDING_VERIFICATION');
        setSuccessMessage('Payment proof submitted. Your payment is waiting for admin verification.');
        setIsReplacing(false);
        onProofSubmitted?.(res.proof);
      } else {
        setErrorMessage(res.error || 'Failed to submit payment proof.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Server error uploading payment proof.');
    } finally {
      setIsUploading(false);
    }
  };

  const isPdf = selectedFile?.type === 'application/pdf' || selectedFile?.name.toLowerCase().endsWith('.pdf');

  // If already submitted and waiting for admin verification
  const isPendingVerification =
    !isReplacing &&
    (verificationStatus === 'PENDING_VERIFICATION' || verificationStatus === 'UPLOADED');

  const isVerified = !isReplacing && verificationStatus === 'VERIFIED';
  const isRejected = !isReplacing && verificationStatus === 'REJECTED';

  return (
    <div
      id={`payment-proof-upload-${orderId}`}
      data-testid="payment-proof-upload-section"
      className={`rounded-2xl border transition-all ${
        isRejected
          ? 'bg-rose-950/20 border-rose-500/40'
          : isVerified
          ? 'bg-emerald-950/20 border-emerald-500/40'
          : isPendingVerification
          ? 'bg-amber-950/20 border-amber-500/30'
          : 'bg-[#051c33]/70 border-cyan-500/30'
      } p-4 sm:p-5 text-left space-y-4 ${className}`}
    >
      {/* Hidden file input supporting JPG, JPEG, PNG, PDF */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        className="hidden"
        id={`payment-proof-input-${orderId}`}
        data-testid="payment-proof-file-input"
      />

      {/* Header section with status badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/10">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-cyan-400" />
            <h4 className="text-sm sm:text-base font-bold text-white font-display">
              Upload Payment Screenshot
            </h4>
          </div>
          <p className="text-xs text-slate-300">
            Order <span className="font-semibold text-white">{orderId}</span> · Connect payment evidence for admin verification
          </p>
        </div>

        {/* Dynamic Verification Status Badge */}
        <div>
          {isVerified && (
            <span
              data-testid="payment-verification-status-badge"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>PAID · VERIFIED</span>
            </span>
          )}

          {isPendingVerification && (
            <span
              data-testid="payment-verification-status-badge"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>PENDING VERIFICATION</span>
            </span>
          )}

          {isRejected && (
            <span
              data-testid="payment-verification-status-badge"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>REJECTED</span>
            </span>
          )}

          {!isVerified && !isPendingVerification && !isRejected && (
            <span
              data-testid="payment-verification-status-badge"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-700/60 text-slate-300 border border-white/10"
            >
              <span>NOT UPLOADED</span>
            </span>
          )}
        </div>
      </div>

      {/* Case 1: Verified state notice */}
      {isVerified && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-emerald-200">Payment Verified by Admin</p>
            <p className="text-emerald-300/90 leading-relaxed">
              Your payment has been successfully confirmed and your order is scheduled for delivery.
            </p>
          </div>
        </div>
      )}

      {/* Case 2: Rejected state notice with replace option */}
      {isRejected && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="space-y-1">
              <p className="font-bold text-rose-100">
                Payment proof was rejected by admin. Please upload a valid payment proof.
              </p>
              <p className="text-rose-200/90 leading-relaxed">
                The administrator could not verify your earlier transaction proof. Please provide a clear screenshot from Google Pay, PhonePe, Paytm, or BHIM showing the transaction ID and amount.
              </p>
            </div>
          </div>

          <button
            type="button"
            id={`btn-replace-rejected-proof-${orderId}`}
            data-testid="replace-rejected-proof-btn"
            onClick={handleReplaceClick}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs sm:text-sm font-bold shadow transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Upload New Payment Proof</span>
          </button>
        </div>
      )}

      {/* Case 3: Pending verification notice */}
      {isPendingVerification && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
            <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="space-y-1">
              <p className="font-bold text-amber-100">
                Payment proof submitted. Your payment is waiting for admin verification.
              </p>
              <p className="text-amber-200/90 leading-relaxed">
                Order status: <span className="font-semibold text-white">PAYMENT VERIFICATION PENDING</span>.
                Our team will verify the payment evidence before dispatching your order.
              </p>
            </div>
          </div>

          {submittedProof && (
            <div className="p-3 rounded-xl bg-[#031526]/80 border border-white/10 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2 truncate">
                <FileCheck2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-medium text-white truncate">{submittedProof.fileName}</span>
                <span className="text-slate-400 shrink-0">({formatFileSize(submittedProof.fileSize)})</span>
              </div>
              <button
                type="button"
                onClick={handleReplaceClick}
                className="shrink-0 text-cyan-400 hover:text-cyan-300 underline font-semibold text-xs ml-2 cursor-pointer"
              >
                Replace
              </button>
            </div>
          )}
        </div>
      )}

      {/* Case 4: File Selection / Upload Area (when not already verified or when uploading/replacing) */}
      {(!isVerified && !isPendingVerification && !isRejected) || isReplacing ? (
        <div className="space-y-3">
          {/* File selector drop zone */}
          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-cyan-500/40 hover:border-cyan-400 rounded-xl p-5 sm:p-6 text-center cursor-pointer bg-[#031526]/50 hover:bg-[#031526] transition-all space-y-2 group"
            >
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs sm:text-sm font-semibold text-white">
                  Click to select Payment Screenshot or PDF
                </p>
                <p className="text-[11px] text-slate-400">
                  Supported files: <span className="text-slate-300 font-medium">JPG, JPEG, PNG, PDF</span> · Maximum file size: <span className="text-slate-300 font-medium">10 MB</span>
                </p>
              </div>
            </div>
          ) : (
            /* Selected File Details Box */
            <div
              id="selected-proof-file-card"
              data-testid="selected-proof-file-card"
              className="p-4 rounded-xl bg-[#031526] border border-cyan-500/40 space-y-3"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {filePreview ? (
                    <img
                      src={filePreview}
                      alt="Payment screenshot preview"
                      className="w-12 h-12 rounded-lg object-cover border border-white/20 shrink-0 bg-slate-900"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-800 text-cyan-400 flex items-center justify-center border border-white/10 shrink-0">
                      {isPdf ? <FileText className="w-6 h-6 text-rose-400" /> : <ImageIcon className="w-6 h-6 text-cyan-400" />}
                    </div>
                  )}

                  <div className="min-w-0 text-left space-y-0.5">
                    <p
                      id="proof-file-name"
                      data-testid="proof-file-name"
                      className="text-xs sm:text-sm font-bold text-white truncate max-w-xs"
                      title={selectedFile.name}
                    >
                      {selectedFile.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span id="proof-file-type" data-testid="proof-file-type">
                        Type: <span className="text-slate-300 font-medium">{selectedFile.type || (isPdf ? 'application/pdf' : 'image/jpeg')}</span>
                      </span>
                      <span>·</span>
                      <span id="proof-file-size" data-testid="proof-file-size">
                        Size: <span className="text-slate-300 font-medium">{formatFileSize(selectedFile.size)}</span>
                      </span>
                    </div>
                    <div className="pt-0.5">
                      <span
                        id="proof-upload-status"
                        data-testid="proof-upload-status"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300"
                      >
                        <Clock className="w-3 h-3" />
                        <span>Ready to Submit (Verification Pending)</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Replace & Remove buttons */}
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    id="btn-replace-proof-file"
                    data-testid="replace-proof-btn"
                    disabled={isUploading}
                    onClick={handleReplaceClick}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Replace</span>
                  </button>

                  <button
                    type="button"
                    id="btn-remove-proof-file"
                    data-testid="remove-proof-btn"
                    disabled={isUploading}
                    onClick={handleRemoveFile}
                    className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>

              {/* Submit Payment Proof Action Button */}
              <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400">
                  Submitting provides payment evidence for admin verification.
                </p>

                <button
                  type="button"
                  id="btn-submit-payment-proof"
                  data-testid="submit-payment-proof-btn"
                  disabled={isUploading}
                  onClick={handleSubmitProof}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs sm:text-sm font-bold shadow-md shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Payment Proof...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-4 h-4" />
                      <span>Submit Payment Proof</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Feedback Messages */}
      {errorMessage && (
        <div
          id="proof-upload-error-message"
          data-testid="proof-upload-error-message"
          className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          id="proof-upload-success-message"
          data-testid="proof-upload-success-message"
          className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}
    </div>
  );
};
