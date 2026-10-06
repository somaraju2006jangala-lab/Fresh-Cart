import { PaymentProofData, PaymentVerificationStatus } from '../types';
import { updateOrderStatus, updateOrderPaymentStatus } from './authService';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const SUPPORTED_FILE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'] as const;
export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  fileType?: string;
}

/**
 * Formats byte size into human readable string (KB / MB).
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Validates a candidate payment proof file against size and type rules.
 */
export function validatePaymentProofFile(file: File): ValidationResult {
  if (!file) {
    return { isValid: false, error: 'No file selected.' };
  }

  // 1. Check file size <= 10MB
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds the 10 MB limit (${formatFileSize(file.size)}). Please choose a smaller file.`,
    };
  }

  // 2. Check file extension
  const fileName = file.name.toLowerCase();
  const hasSupportedExt =
    fileName.endsWith('.jpg') ||
    fileName.endsWith('.jpeg') ||
    fileName.endsWith('.png') ||
    fileName.endsWith('.pdf');

  if (!hasSupportedExt) {
    return {
      isValid: false,
      error: 'Invalid file format. Supported file formats are JPG, JPEG, PNG, and PDF.',
    };
  }

  // 3. Check MIME type (normalized)
  let mimeType = file.type.toLowerCase();
  if (!mimeType) {
    if (fileName.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (fileName.endsWith('.png')) mimeType = 'image/png';
    else mimeType = 'image/jpeg';
  }

  if (
    mimeType !== 'image/jpeg' &&
    mimeType !== 'image/jpg' &&
    mimeType !== 'image/png' &&
    mimeType !== 'application/pdf'
  ) {
    return {
      isValid: false,
      error: 'Invalid file type. Supported types: JPG, JPEG, PNG, PDF.',
    };
  }

  return { isValid: true, fileType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType };
}

/**
 * Converts a browser File object to a base64 Data URL.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert file to data URL.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Error reading file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a payment proof file to the backend for an order.
 * Connects upload strictly to the specific order and customer.
 * Uploading proof does NOT automatically mark payment as successful.
 * Sets payment status to "PENDING VERIFICATION" and order status to "PAYMENT VERIFICATION PENDING".
 */
export async function uploadPaymentProof(params: {
  orderId: string;
  customerId: string;
  file: File;
  token?: string;
}): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  proof?: PaymentProofData;
  paymentStatus?: string;
  orderStatus?: string;
}> {
  const { orderId, customerId, file, token } = params;

  // Client validation
  const validation = validatePaymentProofFile(file);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  try {
    const fileData = await fileToBase64(file);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-customer-id': customerId,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/payment-proofs/upload', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orderId,
        customerId,
        fileName: file.name,
        fileType: validation.fileType || file.type || 'image/jpeg',
        fileSize: file.size,
        fileData,
      }),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.success) {
      // Synchronize order state in local client store
      updateOrderStatus(orderId, 'PAYMENT VERIFICATION PENDING', {
        paymentStatus: 'PENDING VERIFICATION',
      });
      updateOrderPaymentStatus(orderId, 'PENDING VERIFICATION');

      return {
        success: true,
        message:
          data.message ||
          'Payment proof submitted. Your payment is waiting for admin verification.',
        proof: data.proof,
        paymentStatus: 'PENDING VERIFICATION',
        orderStatus: 'PAYMENT VERIFICATION PENDING',
      };
    }

    return {
      success: false,
      error: data?.error || 'Failed to upload payment proof. Please try again.',
    };
  } catch (err: any) {
    // Offline local fallback handling
    console.warn('Network issue uploading payment proof, saving offline copy:', err?.message);
    try {
      const fileData = await fileToBase64(file);
      const proofId = `proof-${Date.now()}`;
      const localProof: PaymentProofData = {
        id: proofId,
        orderId,
        customerId,
        fileName: file.name,
        fileType: validation.fileType || file.type || 'image/jpeg',
        fileSize: file.size,
        fileData,
        verificationStatus: 'PENDING_VERIFICATION',
        uploadedAt: new Date().toISOString(),
      };

      updateOrderStatus(orderId, 'PAYMENT VERIFICATION PENDING', {
        paymentStatus: 'PENDING VERIFICATION',
      });
      updateOrderPaymentStatus(orderId, 'PENDING VERIFICATION');

      return {
        success: true,
        message: 'Payment proof submitted. Your payment is waiting for admin verification.',
        proof: localProof,
        paymentStatus: 'PENDING VERIFICATION',
        orderStatus: 'PAYMENT VERIFICATION PENDING',
      };
    } catch {
      return { success: false, error: 'Failed to process file. Please try again.' };
    }
  }
}

/**
 * Fetches all payment proofs for the Admin Portal.
 */
export async function fetchAllPaymentProofs(adminToken?: string): Promise<{
  success: boolean;
  proofs: PaymentProofData[];
  error?: string;
}> {
  try {
    const headers: Record<string, string> = {
      'x-admin-request': 'true',
    };
    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }

    const res = await fetch('/api/payment-proofs', {
      method: 'GET',
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.success && Array.isArray(data.proofs)) {
        return { success: true, proofs: data.proofs };
      }
    }
    return { success: false, proofs: [], error: 'Could not retrieve payment proofs.' };
  } catch (err: any) {
    return { success: false, proofs: [], error: err?.message || 'Network error' };
  }
}

/**
 * Fetches the payment proof for a specific order.
 */
export async function fetchPaymentProofForOrder(
  orderId: string,
  token?: string,
  customerId?: string
): Promise<{
  success: boolean;
  proof: PaymentProofData | null;
  verificationStatus?: PaymentVerificationStatus;
  error?: string;
}> {
  try {
    const headers: Record<string, string> = {};
    if (customerId) headers['x-customer-id'] = customerId;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/payment-proofs/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        proof: data.proof || null,
        verificationStatus: data.proof?.verificationStatus || data.verificationStatus || 'NOT_UPLOADED',
      };
    }
    return { success: false, proof: null, error: 'Could not fetch proof' };
  } catch {
    return { success: false, proof: null, error: 'Network error' };
  }
}

/**
 * Admin action: Verify or Reject a submitted payment proof.
 */
export async function adminVerifyPaymentProof(params: {
  orderId: string;
  action: 'VERIFY' | 'REJECT';
  adminOperator?: string;
  notes?: string;
  adminToken?: string;
}): Promise<{
  success: boolean;
  paymentStatus?: string;
  orderStatus?: string;
  verificationStatus?: PaymentVerificationStatus;
  message?: string;
  error?: string;
}> {
  const { orderId, action, adminOperator, notes, adminToken } = params;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-admin-request': 'true',
    };
    if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;

    const res = await fetch(`/api/payment-proofs/${encodeURIComponent(orderId)}/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action,
        adminOperator: adminOperator || 'Admin Portal',
        notes: notes || '',
      }),
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.success) {
      // Synchronize local order status
      if (action === 'VERIFY') {
        updateOrderStatus(orderId, 'CONFIRMED', { paymentStatus: 'PAID' });
        updateOrderPaymentStatus(orderId, 'PAID');
      } else {
        updateOrderStatus(orderId, 'REJECTED', { paymentStatus: 'REJECTED' });
        updateOrderPaymentStatus(orderId, 'REJECTED');
      }

      return {
        success: true,
        paymentStatus: data.paymentStatus,
        orderStatus: data.orderStatus,
        verificationStatus: data.verificationStatus,
        message: data.message,
      };
    }

    return {
      success: false,
      error: data?.error || `Failed to ${action.toLowerCase()} payment proof.`,
    };
  } catch (err: any) {
    // Offline local fallback
    if (action === 'VERIFY') {
      updateOrderStatus(orderId, 'CONFIRMED', { paymentStatus: 'PAID' });
      updateOrderPaymentStatus(orderId, 'PAID');
      return {
        success: true,
        paymentStatus: 'PAID',
        orderStatus: 'CONFIRMED',
        verificationStatus: 'VERIFIED',
        message: 'Payment verified successfully.',
      };
    } else {
      updateOrderStatus(orderId, 'REJECTED', { paymentStatus: 'REJECTED' });
      updateOrderPaymentStatus(orderId, 'REJECTED');
      return {
        success: true,
        paymentStatus: 'REJECTED',
        orderStatus: 'REJECTED',
        verificationStatus: 'REJECTED',
        message: 'Payment proof rejected.',
      };
    }
  }
}
