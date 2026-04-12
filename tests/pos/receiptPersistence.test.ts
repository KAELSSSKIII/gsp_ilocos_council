import test from "node:test";
import assert from "node:assert/strict";

import { readLocalReceipt, writeLocalReceipt } from "../../src/modules/pos/utils/receiptStorage";
import {
  clearLocalReceiptSettings,
  getReceiptFieldPositions,
  getReceiptItemsLayout,
  readLocalReceiptSettings,
  writeLocalReceiptSettings,
} from "../../src/modules/pos/utils/receiptSettingsStorage";
import { isRentalCartItem, isRentalProduct } from "../../src/modules/pos/utils/rental";
import type { ReceiptData } from "../../src/modules/pos/types";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

type TestWindow = {
  localStorage: StorageLike;
};

const testGlobal = globalThis as typeof globalThis & { window?: TestWindow };
const originalWindow = testGlobal.window;

function createStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function installWindow() {
  testGlobal.window = {
    localStorage: createStorage(),
  };
}

test.beforeEach(() => {
  installWindow();
});

test.after(() => {
  testGlobal.window = originalWindow;
});

test("receipt snapshots round-trip through local storage", () => {
  const receipt: ReceiptData = {
    saleId: "sale-1",
    saleNumber: "SALE-001",
    createdAt: "2026-04-10T10:00:00.000Z",
    paymentMethod: "cash",
    subtotal: 500,
    discount: 50,
    tax: 0,
    total: 450,
    items: [{ id: "item-1", name: "Uniform", quantity: 1, price: 500, subtotal: 500 }],
  };

  writeLocalReceipt(receipt);

  assert.deepEqual(readLocalReceipt(), receipt);
});

test("receipt settings merge custom field and item layout overrides with defaults", () => {
  writeLocalReceiptSettings({
    startNumber: 1,
    endNumber: 9999,
    currentNumber: 25,
    dateIssued: "2026-04-10",
    updatedAt: "2026-04-10T08:00:00.000Z",
    receiptFieldPositions: {
      soldTo: { x: 150, y: 40, width: 50, fontSize: 11 },
    },
    receiptItemsLayout: {
      startY: 24,
      maxRows: 8,
    },
  });

  const settings = readLocalReceiptSettings();
  const fieldPositions = getReceiptFieldPositions(settings);
  const itemsLayout = getReceiptItemsLayout(settings);

  assert.equal(settings?.currentNumber, 25);
  assert.equal(fieldPositions.soldTo.x, 150);
  assert.equal(fieldPositions.date.x, 171);
  assert.equal(itemsLayout.startY, 24);
  assert.equal(itemsLayout.maxRows, 8);
  assert.equal(itemsLayout.amountX, 82);
});

test("clearing receipt settings removes the local snapshot", () => {
  writeLocalReceiptSettings({
    startNumber: 10,
    endNumber: 20,
    currentNumber: 10,
    dateIssued: "2026-04-10",
    updatedAt: "2026-04-10T08:00:00.000Z",
  });

  clearLocalReceiptSettings();

  assert.equal(readLocalReceiptSettings(), null);
});

test("rental helpers detect both explicit flags and linked rental spaces", () => {
  assert.equal(isRentalProduct({ is_rental: true, rental_space_id: null }), true);
  assert.equal(isRentalProduct({ is_rental: false, rental_space_id: "space-1" }), true);
  assert.equal(isRentalProduct({ is_rental: false, rental_space_id: null }), false);

  assert.equal(isRentalCartItem({ isRental: true, rentalSpaceId: null }), true);
  assert.equal(isRentalCartItem({ isRental: false, rentalSpaceId: "space-2" }), true);
  assert.equal(isRentalCartItem({ isRental: false, rentalSpaceId: null }), false);
});
