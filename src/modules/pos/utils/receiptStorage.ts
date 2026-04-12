import type { ReceiptData } from "@/modules/pos/types";

const LOCAL_RECEIPT_KEY = "gsp-pos-last-receipt";

export const readLocalReceipt = (): ReceiptData | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_RECEIPT_KEY);
    return raw ? (JSON.parse(raw) as ReceiptData) : null;
  } catch (error) {
    console.warn("Failed to read local receipt snapshot", error);
    return null;
  }
};

export const writeLocalReceipt = (receipt: ReceiptData) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_RECEIPT_KEY, JSON.stringify(receipt));
  } catch (error) {
    console.warn("Failed to persist receipt snapshot locally", error);
  }
};

