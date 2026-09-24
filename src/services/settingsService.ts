export interface AppSettings {
  deliveryCharges: number;
  taxAndPackingPercentage?: number;
}

const STORAGE_SETTINGS_KEY = 'freshcart_app_settings_v1';
const DEFAULT_SETTINGS: AppSettings = {
  deliveryCharges: 50,
  taxAndPackingPercentage: 0,
};

/**
 * Reads local cached settings from localStorage for instant synchronous hydration.
 */
export const getStoredSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.deliveryCharges === 'number' && !isNaN(parsed.deliveryCharges)) {
        return {
          deliveryCharges: Math.max(0, parsed.deliveryCharges),
          taxAndPackingPercentage: 0,
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
        const val = typeof data?.settings?.deliveryCharges === 'number'
          ? data.settings.deliveryCharges
          : 50;
        const settings: AppSettings = {
          deliveryCharges: Math.max(0, val),
          taxAndPackingPercentage: 0,
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
  const nextSettings: AppSettings = {
    deliveryCharges:
      typeof settings.deliveryCharges === 'number' && !isNaN(settings.deliveryCharges)
        ? Math.max(0, Math.round(settings.deliveryCharges * 100) / 100)
        : current.deliveryCharges,
    taxAndPackingPercentage: 0,
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
      if (data?.success && typeof data?.settings?.deliveryCharges === 'number') {
        return {
          deliveryCharges: data.settings.deliveryCharges,
          taxAndPackingPercentage: 0,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to persist settings to backend:', err);
  }

  return nextSettings;
};

