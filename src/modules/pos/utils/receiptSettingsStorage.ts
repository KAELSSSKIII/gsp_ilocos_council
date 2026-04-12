export type PaperWidth = "a4" | "80mm" | "58mm";
export type ReceiptLayoutMode = "template" | "preprinted";
export type ReceiptFieldKey =
  | "soldTo"
  | "date"
  | "tin"
  | "term"
  | "address"
  | "businessStyle"
  | "amountWords"
  | "paymentMethod"
  | "paymentAmount"
  | "cashierName"
  | "totalSales"
  | "totalDiscount"
  | "totalAmountDue";

export interface ReceiptFieldPosition {
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

export interface ReceiptItemsLayout {
  descriptionX: number;
  amountX: number;
  startY: number;
  rowGap: number;
  descriptionWidth: number;
  amountWidth: number;
  fontSize: number;
  maxRows: number;
}

export interface LocalReceiptSettings {
  startNumber: number;
  endNumber: number;
  currentNumber: number;
  dateIssued: string;
  updatedAt: string;
  updatedBy?: string | null;
  autoPrint?: boolean;
  paperWidth?: PaperWidth;
  receiptLayout?: ReceiptLayoutMode;
  footerText?: string;
  receiptFieldPositions?: Partial<Record<ReceiptFieldKey, ReceiptFieldPosition>>;
  receiptItemsLayout?: Partial<ReceiptItemsLayout>;
  // BIR invoice info (printed at bottom of official invoice)
  orgAddress?: string;
  orgTin?: string;
  birAuthNo?: string;
  birAuthDateIssued?: string;
  birSeriesLabel?: string;
  printerAccredNo?: string;
  printerAccredDate?: string;
  printerName?: string;
  printerTin?: string;
}

const LOCAL_RECEIPT_SETTINGS_KEY = "gsp-pos-receipt-settings";

export const DEFAULT_RECEIPT_LAYOUT: ReceiptLayoutMode = "preprinted";

export const DEFAULT_RECEIPT_FIELD_POSITIONS: Record<ReceiptFieldKey, ReceiptFieldPosition> = {
  soldTo: { x: 123, y: 32, width: 46, fontSize: 10 },
  date: { x: 171, y: 32, width: 21, fontSize: 10 },
  tin: { x: 122, y: 40, width: 26, fontSize: 10 },
  term: { x: 166, y: 40, width: 26, fontSize: 10 },
  address: { x: 123, y: 48, width: 69, fontSize: 10 },
  businessStyle: { x: 123, y: 56, width: 69, fontSize: 10 },
  amountWords: { x: 124, y: 70, width: 66, fontSize: 9.5 },
  paymentMethod: { x: 123, y: 84, width: 27, fontSize: 10 },
  paymentAmount: { x: 159, y: 84, width: 28, fontSize: 10 },
  cashierName: { x: 143, y: 111, width: 40, fontSize: 10 },
  totalSales: { x: 82, y: 71, width: 21, fontSize: 10 },
  totalDiscount: { x: 82, y: 79, width: 21, fontSize: 10 },
  totalAmountDue: { x: 82, y: 87, width: 21, fontSize: 10 },
};

export const DEFAULT_RECEIPT_ITEMS_LAYOUT: ReceiptItemsLayout = {
  descriptionX: 26,
  amountX: 82,
  startY: 20,
  rowGap: 8.2,
  descriptionWidth: 54,
  amountWidth: 21,
  fontSize: 10,
  maxRows: 6,
};

export const getReceiptFieldPositions = (
  settings?: LocalReceiptSettings | null
): Record<ReceiptFieldKey, ReceiptFieldPosition> => {
  const custom = settings?.receiptFieldPositions ?? {};

  return (Object.keys(DEFAULT_RECEIPT_FIELD_POSITIONS) as ReceiptFieldKey[]).reduce(
    (acc, key) => {
      acc[key] = {
        ...DEFAULT_RECEIPT_FIELD_POSITIONS[key],
        ...(custom[key] ?? {}),
      };
      return acc;
    },
    {} as Record<ReceiptFieldKey, ReceiptFieldPosition>
  );
};

export const getReceiptItemsLayout = (settings?: LocalReceiptSettings | null): ReceiptItemsLayout => ({
  ...DEFAULT_RECEIPT_ITEMS_LAYOUT,
  ...(settings?.receiptItemsLayout ?? {}),
});

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


