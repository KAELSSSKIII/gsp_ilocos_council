export interface LocalReceiptSettings {
  startNumber: number;
  endNumber: number;
  currentNumber: number;
  dateIssued: string;
  updatedAt: string;
  updatedBy?: string | null;
}

const LOCAL_RECEIPT_SETTINGS_KEY = "gsp-pos-receipt-settings";

export const readLocalReceiptSettings = (): LocalReceiptSettings | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_RECEIPT_SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as LocalReceiptSettings) : null;
  } catch (error) {
    console.warn("Failed to read local receipt settings", error);
    return null;
  }
};

export const writeLocalReceiptSettings = (settings: LocalReceiptSettings) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_RECEIPT_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to persist local receipt settings", error);
  }
};

export const clearLocalReceiptSettings = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOCAL_RECEIPT_SETTINGS_KEY);
  } catch (error) {
    console.warn("Failed to clear local receipt settings", error);
  }
};


