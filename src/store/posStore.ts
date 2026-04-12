import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { readBusinessSettings } from "@/utils/businessSettings";

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
  isRental?: boolean;
  rentalSpaceId?: string | null;
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
  paymentMethod: PaymentMethod;
  member: POSMember | null;
  rentalDiscountType: RentalDiscountType;
  addItem: (item: POSCartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setCart: (items: POSCartItem[]) => void;
  setDiscountRate: (value: number) => void;
  setTaxRate: (value: number) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setMember: (member: POSMember | null) => void;
  clearMember: () => void;
  setRentalDiscountType: (type: RentalDiscountType) => void;
  setItemRentalDate: (id: string, date: string | null) => void;
  totals: () => { subtotal: number; discount: number; rentalDiscount: number; memberDiscount: number; tax: number; total: number };
}

export const usePOSStore = create<POSState>()(
  devtools(
    persist(
      (set, get) => ({
    cart: [],
    discountRate: 0,
    taxRate: readBusinessSettings().taxRate,
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
                    isRental: incoming.isRental ?? item.isRental ?? false,
                    rentalSpaceId: incoming.rentalSpaceId ?? item.rentalSpaceId ?? null,
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
              isRental: incoming.isRental ?? false,
              rentalSpaceId: incoming.rentalSpaceId ?? null,
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
            isRental: item.isRental ?? false,
            rentalSpaceId: item.rentalSpaceId ?? null,
            rentalDate: item.rentalDate ?? null,
          })),
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
        discountRate: type === "none" ? 0 : readBusinessSettings().rentalDiscountRate,
      })),
    totals: () => {
      const subtotal = get().cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const rentalBase = get().cart
        .filter((item) => item.isRental || item.rentalSpaceId)
        .reduce((sum, item) => sum + item.price * item.quantity, 0);

      const nonRentalBase = subtotal - rentalBase;

      const rentalDiscount = rentalBase * get().discountRate;
      const memberRate = get().member?.discountRate ?? 0;
      const memberDiscount = nonRentalBase * memberRate;

      const totalDiscount = rentalDiscount + memberDiscount;
      const taxable = subtotal - totalDiscount;
      const tax = taxable * get().taxRate;
      return {
        subtotal,
        discount: totalDiscount,
        rentalDiscount,
        memberDiscount,
        tax,
        total: taxable + tax,
      };
    },
  }),
      {
        name: "gsp-pos-store",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          cart: state.cart,
          member: state.member,
          discountRate: state.discountRate,
          rentalDiscountType: state.rentalDiscountType,
          paymentMethod: state.paymentMethod,
        }),
      }
    )
  )
);
