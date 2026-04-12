import type { POSCartItem } from "@/store/posStore";
import type { ProductRow } from "@/modules/pos/types";

export const isRentalProduct = (product: Pick<ProductRow, "is_rental" | "rental_space_id">) =>
  Boolean(product.is_rental || product.rental_space_id);

export const isRentalCartItem = (item: Pick<POSCartItem, "isRental" | "rentalSpaceId">) =>
  Boolean(item.isRental || item.rentalSpaceId);
