import { PaymentSettings } from '../types';

export type { PaymentSettings };

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  directUpiAppEnabled: true,
  updatedAt: new Date().toISOString(),
};

const STORAGE_PAYMENT_SETTINGS_KEY = 'freshcart_payment_settings_v1';
const PAYMENT_SETTINGS_EVENT = 'freshcart:payment_settings_updated';

/**
 * Returns locally cached payment settings for immediate hydration.
 */
export function getStoredPaymentSettings(): PaymentSettings {
  try {
    const raw = localStorage.getItem(STORAGE_PAYMENT_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          directUpiAppEnabled: parsed.directUpiAppEnabled !== false,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_PAYMENT_SETTINGS;
}

/**
 * Cross-tab communication channel for live payment settings synchronization.
 */
let paymentBroadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    paymentBroadcastChannel = new BroadcastChannel('freshcart_payment_channel');
  }
} catch {
  // ignore in non-browser or unsupported environments
}

/**
 * Fetches authoritative payment settings from the backend database/API.
 * Uses no-cache headers and timestamp query parameter to prevent stale caches.
 */
export async function fetchServerPaymentSettings(): Promise<PaymentSettings> {
  try {
    const res = await fetch(`/api/payment-settings?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.settings) {
        const s = data.settings;
        const validated: PaymentSettings = {
          directUpiAppEnabled: s.directUpiAppEnabled !== false,
          updatedAt: s.updatedAt || new Date().toISOString(),
        };

        try {
          localStorage.setItem(STORAGE_PAYMENT_SETTINGS_KEY, JSON.stringify(validated));
          window.dispatchEvent(new CustomEvent(PAYMENT_SETTINGS_EVENT, { detail: validated }));
          paymentBroadcastChannel?.postMessage(validated);
        } catch {
          // ignore
        }

        return validated;
      }
    }
  } catch (err) {
    console.warn('[PaymentSettings] Failed to fetch settings from backend:', err);
  }

  return getStoredPaymentSettings();
}

/**
 * Persists updated payment settings to backend database and updates local cache.
 */
export async function updateServerPaymentSettings(
  patch: Partial<PaymentSettings>
): Promise<{ success: boolean; settings: PaymentSettings; error?: string }> {
  const current = getStoredPaymentSettings();
  const nextSettings: PaymentSettings = {
    directUpiAppEnabled: patch.directUpiAppEnabled !== undefined ? !!patch.directUpiAppEnabled : current.directUpiAppEnabled,
    updatedAt: new Date().toISOString(),
  };

  // Update local storage immediately for fast UI response
  try {
    localStorage.setItem(STORAGE_PAYMENT_SETTINGS_KEY, JSON.stringify(nextSettings));
    window.dispatchEvent(new CustomEvent(PAYMENT_SETTINGS_EVENT, { detail: nextSettings }));
    paymentBroadcastChannel?.postMessage(nextSettings);
  } catch {
    // ignore
  }

  // Persist to backend API / DB
  try {
    const res = await fetch('/api/payment-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nextSettings),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.settings) {
        try {
          localStorage.setItem(STORAGE_PAYMENT_SETTINGS_KEY, JSON.stringify(data.settings));
          window.dispatchEvent(new CustomEvent(PAYMENT_SETTINGS_EVENT, { detail: data.settings }));
          paymentBroadcastChannel?.postMessage(data.settings);
        } catch {}
        return { success: true, settings: data.settings };
      }
    }
  } catch (err: any) {
    console.warn('[PaymentSettings] Failed to persist to backend:', err);
    return { success: true, settings: nextSettings, error: err?.message };
  }

  return { success: true, settings: nextSettings };
}

/**
 * Hook or helper to subscribe to payment settings changes in the UI across tabs and windows.
 */
export function onPaymentSettingsChange(callback: (settings: PaymentSettings) => void): () => void {
  const handler = (e: Event) => {
    const custom = e as CustomEvent<PaymentSettings>;
    if (custom.detail) {
      callback(custom.detail);
    }
  };

  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_PAYMENT_SETTINGS_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed && typeof parsed === 'object') {
          callback(parsed);
        }
      } catch {}
    }
  };

  const bcHandler = (e: MessageEvent) => {
    if (e.data && typeof e.data === 'object') {
      callback(e.data);
    }
  };

  window.addEventListener(PAYMENT_SETTINGS_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  paymentBroadcastChannel?.addEventListener('message', bcHandler);

  return () => {
    window.removeEventListener(PAYMENT_SETTINGS_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
    paymentBroadcastChannel?.removeEventListener('message', bcHandler);
  };
}

export const getPaymentSettings = getStoredPaymentSettings;
export const updatePaymentSettings = updateServerPaymentSettings;
export const subscribePaymentSettings = onPaymentSettingsChange;
