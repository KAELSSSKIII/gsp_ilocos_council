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
  is_rental?: boolean;
  rental_space_id?: string | null;
  rental_space_type?: "hall" | "room" | null;
  reorder_level?: number | null;
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
  rentalDate?: string | null;
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
  depositAmount?: number | null;   // amount collected at booking time (deposit/initial payment)
  balanceDue?: number | null;      // remaining owed; null means fully paid
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
  cashTendered?: number | null;
  change?: number | null;
  // BIR invoice customer fields
  soldTo?: string | null;
  customerTin?: string | null;
  customerAddress?: string | null;
  businessStyle?: string | null;
  term?: string | null;
  invoiceType?: "sales" | "service";
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

