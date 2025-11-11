import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface POSCartItem {
  id: string;
  sku: string;
  name: string;
  price: number;
  cost?: number;
  quantity: number;
  maxQuantity: number;
  categoryId?: string | null;
  categoryName?: string | null;
  rentalDate?: string | null;
  customization?: {
    embroideryName?: string;
    color?: string;
    variant?: string;
  };
}

export type PaymentMethod = "cash" | "card" | "online" | "mixed";

export interface POSMember {
  id: string;
  name: string;
  code: string;
  discountRate: number;
  email?: string | null;
}

export type RentalDiscountType = "none" | "pwd" | "senior" | "council" | "council_staff";

export const RENTAL_DISCOUNT_RATES: Record<RentalDiscountType, number> = {
  none: 0,
  pwd: 0.1,
  senior: 0.1,
  council: 0.1,
  council_staff: 0.1,
};

interface POSState {
  cart: POSCartItem[];
  discountRate: number;
  taxRate: number;
  heldCarts: Record<string, POSCartItem[]>;
  paymentMethod: PaymentMethod;
  member: POSMember | null;
  rentalDiscountType: RentalDiscountType;
  addItem: (item: POSCartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setCart: (items: POSCartItem[]) => void;
  holdCurrentCart: (label: string) => void;
  resumeHeldCart: (label: string) => void;
  setDiscountRate: (value: number) => void;
  setTaxRate: (value: number) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setMember: (member: POSMember | null) => void;
  clearMember: () => void;
  setRentalDiscountType: (type: RentalDiscountType) => void;
  setItemRentalDate: (id: string, date: string | null) => void;
  totals: () => { subtotal: number; discount: number; tax: number; total: number };
}

export const usePOSStore = create<POSState>()(
  devtools((set, get) => ({
    cart: [],
    discountRate: 0,
    taxRate: 0.12,
    heldCarts: {},
    paymentMethod: "cash",
    member: null,
    rentalDiscountType: "none",
    addItem: (incoming) => {
      set((state) => {
        const existing = state.cart.find((item) => item.id === incoming.id);
        if (existing) {
          const mergedQuantity = Math.min(existing.quantity + incoming.quantity, existing.maxQuantity);
          return {
            ...state,
            cart: state.cart.map((item) =>
              item.id === incoming.id
                ? {
                    ...item,
                    quantity: mergedQuantity,
                    rentalDate: incoming.rentalDate ?? item.rentalDate ?? null,
                  }
                : item
            ),
          };
        }
        return {
          ...state,
          cart: [
            ...state.cart,
            {
              ...incoming,
              rentalDate: incoming.rentalDate ?? null,
            },
          ],
        };
      });
    },
    removeItem: (id) => set((state) => ({ ...state, cart: state.cart.filter((item) => item.id !== id) })),
    updateQuantity: (id, quantity) =>
      set((state) => ({
        ...state,
        cart: state.cart.map((item) =>
          item.id === id
            ? { ...item, quantity: Math.max(1, Math.min(quantity, item.maxQuantity)) }
            : item
        ),
      })),
    clearCart: () => set((state) => ({ ...state, cart: [] })),
    setCart: (items) =>
      set((state) => ({
        ...state,
        cart: items.map((item) => ({
          ...item,
          rentalDate: item.rentalDate ?? null,
        })),
      })),
    holdCurrentCart: (label) =>
      set((state) => ({
        ...state,
        heldCarts: {
          ...state.heldCarts,
          [label]: state.cart,
        },
        cart: [],
      })),
    resumeHeldCart: (label) =>
      set((state) => ({
        ...state,
        cart: state.heldCarts[label] ?? [],
        heldCarts: Object.fromEntries(Object.entries(state.heldCarts).filter(([key]) => key !== label)),
      })),
    setDiscountRate: (value) =>
      set((state) => ({
        ...state,
        discountRate: Math.max(0, value),
      })),
    setTaxRate: (value) => set((state) => ({ ...state, taxRate: Math.max(0, value) })),
    setPaymentMethod: (method) => set((state) => ({ ...state, paymentMethod: method })),
    setMember: (member) =>
      set((state) => ({
        ...state,
        member,
      })),
    clearMember: () =>
      set((state) => ({
        ...state,
        member: null,
      })),
    setItemRentalDate: (id, date) =>
      set((state) => ({
        ...state,
        cart: state.cart.map((item) => (item.id === id ? { ...item, rentalDate: date } : item)),
      })),
    setRentalDiscountType: (type) =>
      set((state) => ({
        ...state,
        rentalDiscountType: type,
        discountRate: RENTAL_DISCOUNT_RATES[type],
      })),
    totals: () => {
      const RENTAL_CATEGORIES = new Set([
        "Hall Rental".toLowerCase(),
        "Room Rental".toLowerCase(),
        "Hall & Room Rental".toLowerCase(),
        "Hall & Room Rentals".toLowerCase(),
      ]);

      const subtotal = get().cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const rentalBase = get().cart
        .filter((item) =>
          item.categoryName ? RENTAL_CATEGORIES.has(item.categoryName.toLowerCase()) : false
        )
        .reduce((sum, item) => sum + item.price * item.quantity, 0);

      const discount = rentalBase * get().discountRate;
      const taxable = subtotal - discount;
      const tax = taxable * get().taxRate;
      return {
        subtotal,
        discount,
        tax,
        total: taxable + tax,
      };
    },
  }))
);

