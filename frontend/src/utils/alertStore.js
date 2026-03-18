const STORAGE_KEY = "sessionAlerts";

export const addAlert = (alert) => {
  let existing = [];

  const stored = sessionStorage.getItem(STORAGE_KEY);

  if (stored) {
    try {
      existing = JSON.parse(stored);
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }

  const exists = existing.some(
    (a) =>
      a.vehicle === alert.vehicle &&
      a.description === alert.description
  );

  if (!exists) {
    const updated = [alert, ...existing];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
};

export const getAlerts = () => {
  const stored = sessionStorage.getItem(STORAGE_KEY);

  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};