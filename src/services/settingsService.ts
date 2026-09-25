import { DeliveryChargeRule } from '../types';

export interface AppSettings {
  deliveryChargeRules: DeliveryChargeRule[];
  deliveryCharges?: number;
}

export const DEFAULT_DELIVERY_RULES: DeliveryChargeRule[] = [
  { id: 'rule-0', minOrderAmount: 0, deliveryCharge: 40 },
  { id: 'rule-500', minOrderAmount: 500, deliveryCharge: 30 },
  { id: 'rule-1000', minOrderAmount: 1000, deliveryCharge: 25 },
  { id: 'rule-1500', minOrderAmount: 1500, deliveryCharge: 12 },
  { id: 'rule-2000', minOrderAmount: 2000, deliveryCharge: 10 },
  { id: 'rule-2500', minOrderAmount: 2500, deliveryCharge: 5 },
  { id: 'rule-3000', minOrderAmount: 3000, deliveryCharge: 0 },
  { id: 'rule-5000', minOrderAmount: 5000, deliveryCharge: 0 },
];

const STORAGE_SETTINGS_KEY = 'freshcart_app_settings_v2';
const LEGACY_STORAGE_SETTINGS_KEY = 'freshcart_app_settings_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  deliveryChargeRules: DEFAULT_DELIVERY_RULES,
  deliveryCharges: 40,
};

/**
 * Automatically selects the rule with the HIGHEST Minimum Order Amount that the customer's cart subtotal has reached.
 * IF subtotal >= highest applicable minimum amount -> Apply that rule's delivery charge
 * ELSE -> Apply the applicable lower rule (or lowest configured rule)
 */
export function getApplicableDeliveryChargeRule(
  rules: DeliveryChargeRule[],
  subtotal: number
): DeliveryChargeRule | null {
  if (!rules || rules.length === 0) return null;
  const sorted = [...rules].sort((a, b) => a.minOrderAmount - b.minOrderAmount);
  const applicable = sorted.filter((r) => subtotal >= r.minOrderAmount);
  if (applicable.length > 0) {
    return applicable[applicable.length - 1];
  }
  return sorted[0];
}

/**
 * Calculates the final Delivery Charge amount.
 * Returns 0 if cart is empty or subtotal <= 0 or if applicable rule is FREE (deliveryCharge === 0).
 */
export function calculateDeliveryCharge(
  rules: DeliveryChargeRule[],
  subtotal: number,
  itemCount: number = 1
): number {
  if (itemCount === 0 || subtotal <= 0) return 0;
  const rule = getApplicableDeliveryChargeRule(rules, subtotal);
  if (!rule) return 0;
  return rule.deliveryCharge;
}

function sanitizeRules(rawRules: any[]): DeliveryChargeRule[] {
  if (!Array.isArray(rawRules) || rawRules.length === 0) return [];
  const valid = rawRules
    .filter((r) => r && typeof r.minOrderAmount === 'number' && !isNaN(r.minOrderAmount))
    .map((r) => ({
      id: String(r.id || `rule-${r.minOrderAmount}`),
      minOrderAmount: Math.max(0, Math.round(r.minOrderAmount * 100) / 100),
      deliveryCharge: Math.max(0, Math.round((Number(r.deliveryCharge) || 0) * 100) / 100),
    }))
    .sort((a, b) => a.minOrderAmount - b.minOrderAmount);
  return valid;
}

/**
 * Reads local cached settings from localStorage for instant synchronous hydration.
 */
export const getStoredSettings = (): AppSettings => {
  try {
    const rawV2 = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      const sanitized = sanitizeRules(parsed?.deliveryChargeRules);
      if (sanitized.length > 0) {
        return {
          deliveryChargeRules: sanitized,
          deliveryCharges: sanitized[0]?.deliveryCharge || 40,
        };
      }
    }

    // Check legacy key
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_SETTINGS_KEY);
    if (rawV1) {
      const parsed = JSON.parse(rawV1);
      const sanitized = sanitizeRules(parsed?.deliveryChargeRules);
      if (sanitized.length > 0) {
        return {
          deliveryChargeRules: sanitized,
          deliveryCharges: sanitized[0]?.deliveryCharge || 40,
        };
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_SETTINGS;
};

/**
 * Fetches authoritative settings from backend /api/settings and synchronizes with localStorage.
 */
export const fetchServerSettings = async (): Promise<AppSettings> => {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data?.success) {
        const sanitized = sanitizeRules(data?.settings?.deliveryChargeRules);
        const rules = sanitized.length > 0 ? sanitized : DEFAULT_DELIVERY_RULES;
        const settings: AppSettings = {
          deliveryChargeRules: rules,
          deliveryCharges: rules[0]?.deliveryCharge || 40,
        };
        try {
          localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
        } catch {
          // ignore
        }
        return settings;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch settings from backend:', err);
  }
  return getStoredSettings();
};

/**
 * Persists updated settings to backend /api/settings and updates localStorage.
 */
export const updateServerSettings = async (settings: Partial<AppSettings>): Promise<AppSettings> => {
  const current = getStoredSettings();
  let nextRules = current.deliveryChargeRules;

  if (Array.isArray(settings.deliveryChargeRules) && settings.deliveryChargeRules.length > 0) {
    const sanitized = sanitizeRules(settings.deliveryChargeRules);
    if (sanitized.length > 0) {
      nextRules = sanitized;
    }
  }

  const nextSettings: AppSettings = {
    deliveryChargeRules: nextRules,
    deliveryCharges: nextRules[0]?.deliveryCharge || 40,
  };

  // Immediate local cache update
  try {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(nextSettings));
  } catch {
    // ignore
  }

  // Persist to backend
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.success && Array.isArray(data?.settings?.deliveryChargeRules)) {
        const serverRules = sanitizeRules(data.settings.deliveryChargeRules);
        return {
          deliveryChargeRules: serverRules.length > 0 ? serverRules : nextRules,
          deliveryCharges: serverRules[0]?.deliveryCharge || nextRules[0]?.deliveryCharge || 40,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to persist settings to backend:', err);
  }

  return nextSettings;
};
