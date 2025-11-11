export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  selling_price: number;
  cost_price?: number | null;
  stock_quantity: number;
  size?: string | null;
  category_id?: string | null;
  is_active: boolean;
  image_url?: string | null;
};

export type CategoryRow = {
  id: string;
  name: string;
};

export interface ReceiptItemData {
  id: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  sku?: string;
  cost?: number;
}

export interface ReceiptData {
  saleId: string;
  saleNumber?: string | null;
  createdAt: string;
  paymentMethod: string;
  branch?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  items: ReceiptItemData[];
  memberName?: string;
  memberEmail?: string | null;
  memberDiscountRate?: number;
  thankYouMessage?: string;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  receiptNumber?: number | null;
  receiptIssuedAt?: string | null;
  cashierId?: string | null;
  cashierName?: string | null;
}

export interface ReceiptHistoryItem {
  saleId: string;
  saleNumber: string;
  createdAt: string;
  total: number;
  memberName?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  receiptNumber?: number | null;
  receiptIssuedAt?: string | null;
  cashierId?: string | null;
  cashierName?: string | null;
  payload: ReceiptData;
}

