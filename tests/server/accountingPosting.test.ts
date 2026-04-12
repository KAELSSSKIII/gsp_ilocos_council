import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/postgres";

const accountingPosting = await import("../../server/services/accountingPosting");

test("toDateOnly normalizes Date objects and ISO timestamp strings", () => {
  assert.equal(
    accountingPosting.toDateOnly(new Date("2026-04-10T18:45:00.000Z")),
    "2026-04-10"
  );
  assert.equal(
    accountingPosting.toDateOnly("2026-04-10T23:59:59+08:00"),
    "2026-04-10"
  );
  assert.equal(accountingPosting.toDateOnly("2026-04-11"), "2026-04-11");
});

test("calculateSaleJournalAmounts distributes discounts across merchandise and rental revenue", () => {
  const amounts = accountingPosting.calculateSaleJournalAmounts(
    [
      { subtotal: 400, quantity: 2, unit_cost: 90, is_rental: false },
      { subtotal: 200, quantity: 1, unit_cost: 0, is_rental: true },
    ],
    60
  );

  assert.equal(amounts.merchandiseRevenue, 400);
  assert.equal(amounts.rentalRevenue, 200);
  assert.equal(amounts.discountAmount, 60);
  assert.equal(amounts.merchandiseNetRevenue, 360);
  assert.equal(amounts.rentalNetRevenue, 180);
  assert.equal(amounts.costOfGoodsSold, 180);
  assert.equal(amounts.merchandiseNetRevenue + amounts.rentalNetRevenue, 540);
});

test("calculateSaleJournalAmounts caps discounts at gross revenue", () => {
  const amounts = accountingPosting.calculateSaleJournalAmounts(
    [{ subtotal: 100, quantity: 1, unit_cost: 25, is_rental: false }],
    150
  );

  assert.equal(amounts.grossRevenue, 100);
  assert.equal(amounts.discountAmount, 100);
  assert.equal(amounts.merchandiseNetRevenue, 0);
  assert.equal(amounts.rentalNetRevenue, 0);
});

test("calculateSaleJournalPosting books unpaid rental deposits to receivables", () => {
  const posting = accountingPosting.calculateSaleJournalPosting(
    [{ subtotal: 5500, quantity: 1, unit_cost: 0, is_rental: true }],
    {
      collectedAmountInput: 5000,
      discountAmountInput: 0,
      taxAmountInput: 0,
    }
  );

  assert.equal(posting.rentalNetRevenue, 5500);
  assert.equal(posting.recognizedSaleAmount, 5500);
  assert.equal(posting.cashCollected, 5000);
  assert.equal(posting.receivableAmount, 500);
});

test("categorizeVoucherExpense buckets common payment voucher descriptions", () => {
  assert.equal(accountingPosting.categorizeVoucherExpense("Electric utility bill"), "utilities");
  assert.equal(accountingPosting.categorizeVoucherExpense("Office supplies restock"), "office");
  assert.equal(accountingPosting.categorizeVoucherExpense("Payroll release"), "payroll");
  assert.equal(accountingPosting.categorizeVoucherExpense("Miscellaneous disbursement"), "default");
});
