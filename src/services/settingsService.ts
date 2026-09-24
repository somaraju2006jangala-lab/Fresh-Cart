export interface AppSettings {
  taxAndPackingPercentage: number;
}

const STORAGE_SETTINGS_KEY = 'freshcart_app_settings_v1';
const DEFAULT_SETTINGS: AppSettings = {
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
      if (typeof parsed?.taxAndPackingPercentage === 'number' && !isNaN(parsed.taxAndPackingPercentage)) {
        return {
          taxAndPackingPercentage: Math.max(0, Math.min(100, parsed.taxAndPackingPercentage)),
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
      if (data?.success && typeof data?.settings?.taxAndPackingPercentage === 'number') {
        const settings: AppSettings = {
          taxAndPackingPercentage: Math.max(0, Math.min(100, data.settings.taxAndPackingPercentage)),
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
    taxAndPackingPercentage:
      typeof settings.taxAndPackingPercentage === 'number' && !isNaN(settings.taxAndPackingPercentage)
        ? Math.max(0, Math.min(100, Math.round(settings.taxAndPackingPercentage * 100) / 100))
        : current.taxAndPackingPercentage,
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
      if (data?.success && typeof data?.settings?.taxAndPackingPercentage === 'number') {
        return {
          taxAndPackingPercentage: data.settings.taxAndPackingPercentage,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to persist settings to backend:', err);
  }

  return nextSettings;
};
