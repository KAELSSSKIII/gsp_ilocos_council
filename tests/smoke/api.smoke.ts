import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";

process.env.JWT_SECRET ??= "smoke-test-secret";
process.env.NODE_ENV = "test";

import sql from "../../server/db";
import { startServer } from "../../server/startServer";

type ApiResponse<T> = {
  body: T;
  response: Response;
};

type JsonRecord = Record<string, unknown>;

class ApiClient {
  private readonly cookieJar = new Map<string, string>();

  constructor(private readonly baseUrl: string) {}

  private storeCookies(response: Response) {
    const setCookies = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (() => {
          const setCookie = response.headers.get("set-cookie");
          return setCookie ? [setCookie] : [];
        })();

    for (const rawCookie of setCookies) {
      const [cookiePair] = rawCookie.split(";", 1);
      const separatorIndex = cookiePair.indexOf("=");
      if (separatorIndex <= 0) continue;

      const name = cookiePair.slice(0, separatorIndex);
      const value = cookiePair.slice(separatorIndex + 1);
      this.cookieJar.set(name, value);
    }
  }

  private buildCookieHeader() {
    return Array.from(this.cookieJar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
    this.storeCookies(response);

    const text = await response.text();
    const body = text ? JSON.parse(text) as T : undefined as T;
    return { response, body };
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body: JsonRecord) {
    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: JsonRecord) {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }
}

async function cleanupSmokeData(params: {
  categoryId?: string;
  employeeId?: string;
  productId?: string;
  profileId?: string;
  receiptSettingsId?: string;
  saleIds: string[];
  scrdMonth: number;
  scrdYear: number;
  voucherIds: string[];
  payrollId?: string;
}) {
  const referenceIds = [
    ...params.saleIds,
    ...params.voucherIds,
    params.payrollId,
  ].filter((value): value is string => Boolean(value));

  await sql.begin(async (tx) => {
    const scopedSql = tx as unknown as typeof sql;

    if (referenceIds.length > 0) {
      await scopedSql`
        DELETE FROM public.journal_entry_lines
        WHERE journal_entry_id IN (
          SELECT id
          FROM public.journal_entries
          WHERE reference_id = ANY(${referenceIds}::uuid[])
        )
      `;

      await scopedSql`
        DELETE FROM public.journal_entries
        WHERE reference_id = ANY(${referenceIds}::uuid[])
      `;
    }

    if (params.saleIds.length > 0) {
      await scopedSql`DELETE FROM public.sale_void_events WHERE sale_id = ANY(${params.saleIds}::uuid[])`;
      await scopedSql`DELETE FROM public.sale_receipts WHERE sale_id = ANY(${params.saleIds}::uuid[])`;
      await scopedSql`DELETE FROM public.sales WHERE id = ANY(${params.saleIds}::uuid[])`;
    }

    if (params.payrollId) {
      await scopedSql`DELETE FROM public.payroll WHERE id = ${params.payrollId}::uuid`;
    }

    if (params.voucherIds.length > 0) {
      await scopedSql`DELETE FROM public.vouchers WHERE id = ANY(${params.voucherIds}::uuid[])`;
    }

    if (params.receiptSettingsId) {
      await scopedSql`DELETE FROM public.receipt_settings WHERE id = ${params.receiptSettingsId}::uuid`;
    }

    await scopedSql`
      DELETE FROM public.scrd_reports
      WHERE year = ${params.scrdYear}
        AND month = ${params.scrdMonth}
        AND (${params.profileId ?? null}::uuid IS NULL OR created_by = ${params.profileId ?? null}::uuid)
    `;

    if (params.productId) {
      await scopedSql`DELETE FROM public.products WHERE id = ${params.productId}::uuid`;
    }

    if (params.categoryId) {
      await scopedSql`DELETE FROM public.product_categories WHERE id = ${params.categoryId}::uuid`;
    }

    if (params.employeeId) {
      await scopedSql`DELETE FROM public.employees WHERE id = ${params.employeeId}::uuid`;
    }

    if (params.profileId) {
      await scopedSql`
        DELETE FROM public.admin_audit_logs
        WHERE actor_id = ${params.profileId}::uuid
           OR target_user_id = ${params.profileId}::uuid
      `;
      await scopedSql`DELETE FROM public.profiles WHERE id = ${params.profileId}::uuid`;
      await scopedSql`DELETE FROM public.users WHERE id = ${params.profileId}::uuid`;
    }
  });
}

test("API smoke covers auth, POS, voiding, payroll, vouchers, and reports", async (t) => {
  const startedServer = await startServer(0);
  const baseUrl = `http://127.0.0.1:${startedServer.port}`;
  const api = new ApiClient(baseUrl);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prefix = `smoke-${suffix}`;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthPadded = String(month).padStart(2, "0");
  const today = now.toISOString().slice(0, 10);
  const periodStart = `${year}-${monthPadded}-01`;
  const periodEnd = today;
  const password = "SmokePass123!";
  const username = `${prefix}-admin`;
  const email = `${username}@example.test`;

  const cleanupState: Parameters<typeof cleanupSmokeData>[0] = {
    saleIds: [],
    scrdYear: year,
    scrdMonth: month,
    voucherIds: [],
  };

  t.after(async () => {
    await startedServer.close();
    await cleanupSmokeData(cleanupState);
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO public.users (username, email, password_hash)
    VALUES (${username}, ${email}, ${passwordHash})
    RETURNING id
  `;
  cleanupState.profileId = user.id;

  await sql`
    INSERT INTO public.profiles (id, full_name, email, username, role, branch)
    VALUES (${user.id}::uuid, ${`Smoke Admin ${suffix}`}, ${email}, ${username}, 'admin', 'Smoke Branch')
  `;

  const [category] = await sql<{ id: string }[]>`
    INSERT INTO public.product_categories (name, description)
    VALUES (${`Smoke Category ${suffix}`}, 'Smoke test category')
    RETURNING id
  `;
  cleanupState.categoryId = category.id;

  const [product] = await sql<{ id: string }[]>`
    INSERT INTO public.products (
      sku, name, category_id, cost_price, selling_price, stock_quantity, reorder_level
    ) VALUES (
      ${`SMOKE-SKU-${suffix}`},
      ${`Smoke Product ${suffix}`},
      ${category.id}::uuid,
      40,
      100,
      25,
      5
    )
    RETURNING id
  `;
  cleanupState.productId = product.id;

  const [employee] = await sql<{ id: string }[]>`
    INSERT INTO public.employees (
      employee_number, full_name, position, department, branch, email, phone, address, hire_date, salary
    ) VALUES (
      ${`EMP-${suffix}`},
      ${`Smoke Employee ${suffix}`},
      'Staff',
      'Operations',
      'Smoke Branch',
      ${`${prefix}-employee@example.test`},
      '09000000000',
      'Smoke Street',
      ${today},
      900
    )
    RETURNING id
  `;
  cleanupState.employeeId = employee.id;

  const health = await api.get<{ ok: boolean }>("/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.ok, true);

  const login = await api.post<{ profile: { id: string; role: string; username: string } }>("/api/auth/login", {
    username,
    password,
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.profile.id, user.id);
  assert.equal(login.body.profile.role, "admin");

  const me = await api.get<{ profile: { id: string; username: string } }>("/api/auth/me");
  assert.equal(me.response.status, 200);
  assert.equal(me.body.profile.id, user.id);
  assert.equal(me.body.profile.username, username);

  const receiptSettings = await api.post<{ settings: { id: string; current_number: number } }>("/api/receipt-settings", {
    start_number: 810000,
    end_number: 810099,
    current_number: 810000,
    date_issued: today,
  });
  assert.equal(receiptSettings.response.status, 201);
  cleanupState.receiptSettingsId = receiptSettings.body.settings.id;

  const voidedSaleNumber = `SALE-VOID-${suffix}`;
  const voidedSale = await api.post<{ sale: { id: string; status: string; receipt_number: number | null } }>("/api/sales", {
    sale: {
      sale_number: voidedSaleNumber,
      cashier_id: user.id,
      branch: "Smoke Branch",
      subtotal: 100,
      tax_amount: 0,
      discount_amount: 10,
      total_amount: 90,
      payment_method: "cash",
      notes: "Smoke POS sale",
    },
    items: [
      {
        product_id: product.id,
        quantity: 1,
        unit_price: 100,
        unit_cost: 40,
        subtotal: 100,
      },
    ],
    receipt_payload: {
      saleNumber: voidedSaleNumber,
      createdAt: `${today}T08:00:00.000Z`,
      paymentMethod: "cash",
      branch: "Smoke Branch",
      subtotal: 100,
      discount: 10,
      tax: 0,
      total: 90,
      items: [
        {
          id: product.id,
          name: `Smoke Product ${suffix}`,
          quantity: 1,
          price: 100,
          subtotal: 100,
        },
      ],
      cashierId: user.id,
      cashierName: `Smoke Admin ${suffix}`,
    },
  });
  assert.equal(voidedSale.response.status, 201);
  assert.equal(voidedSale.body.sale.status, "completed");
  assert.equal(voidedSale.body.sale.receipt_number, 810000);
  cleanupState.saleIds.push(voidedSale.body.sale.id);

  const receipts = await api.get<{ receipts: Array<{ sale_id: string; payload: { total?: number } }> }>(
    `/api/sales/receipts?sale_ids=${voidedSale.body.sale.id}`
  );
  assert.equal(receipts.response.status, 200);
  assert.equal(receipts.body.receipts.length, 1);
  assert.equal(receipts.body.receipts[0]?.sale_id, voidedSale.body.sale.id);
  assert.equal(receipts.body.receipts[0]?.payload.total, 90);

  const voidSale = await api.post<{ success: boolean }>(`/api/sales/${voidedSale.body.sale.id}/void`, {
    reason: "Smoke test void",
  });
  assert.equal(voidSale.response.status, 200);
  assert.equal(voidSale.body.success, true);

  const reportSaleNumber = `SALE-REPORT-${suffix}`;
  const reportSale = await api.post<{ sale: { id: string; status: string; receipt_number: number | null } }>("/api/sales", {
    sale: {
      sale_number: reportSaleNumber,
      cashier_id: user.id,
      branch: "Smoke Branch",
      subtotal: 120,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: 120,
      payment_method: "cash",
      notes: "Smoke report sale",
    },
    items: [
      {
        product_id: product.id,
        quantity: 1,
        unit_price: 120,
        unit_cost: 40,
        subtotal: 120,
      },
    ],
    receipt_payload: {
      saleNumber: reportSaleNumber,
      createdAt: `${today}T09:00:00.000Z`,
      paymentMethod: "cash",
      branch: "Smoke Branch",
      subtotal: 120,
      discount: 0,
      tax: 0,
      total: 120,
      items: [
        {
          id: product.id,
          name: `Smoke Product ${suffix}`,
          quantity: 1,
          price: 120,
          subtotal: 120,
        },
      ],
      cashierId: user.id,
      cashierName: `Smoke Admin ${suffix}`,
    },
  });
  assert.equal(reportSale.response.status, 201);
  assert.equal(reportSale.body.sale.status, "completed");
  assert.equal(reportSale.body.sale.receipt_number, 810001);
  cleanupState.saleIds.push(reportSale.body.sale.id);

  const payroll = await api.post<{ entry: { id: string; status: string } }>("/api/payroll", {
    employee_id: employee.id,
    period_start: periodStart,
    period_end: periodEnd,
    basic_salary: 900,
    overtime_pay: 50,
    cola: 25,
    sss: 30,
    philhealth: 20,
    pagibig: 10,
    tax_deducted: 15,
  });
  assert.equal(payroll.response.status, 201);
  assert.equal(payroll.body.entry.status, "pending");
  cleanupState.payrollId = payroll.body.entry.id;

  const paidPayroll = await api.patch<{ entry: { id: string; status: string } }>(`/api/payroll/${cleanupState.payrollId}`, {
    status: "paid",
  });
  assert.equal(paidPayroll.response.status, 200);
  assert.equal(paidPayroll.body.entry.status, "paid");

  const receiptVoucher = await api.post<{ voucher: { id: string; status: string } }>("/api/vouchers", {
    voucher_type: "receipt",
    amount: 75,
    description: `Smoke receipt voucher ${suffix}`,
  });
  assert.equal(receiptVoucher.response.status, 201);
  cleanupState.voucherIds.push(receiptVoucher.body.voucher.id);

  const postedReceiptVoucher = await api.patch<{ voucher: { id: string; status: string } }>(
    `/api/vouchers/${receiptVoucher.body.voucher.id}`,
    { status: "posted" }
  );
  assert.equal(postedReceiptVoucher.response.status, 200);
  assert.equal(postedReceiptVoucher.body.voucher.status, "posted");

  const paymentVoucher = await api.post<{ voucher: { id: string; status: string } }>("/api/vouchers", {
    voucher_type: "payment",
    amount: 45,
    description: `Smoke office supplies ${suffix}`,
  });
  assert.equal(paymentVoucher.response.status, 201);
  cleanupState.voucherIds.push(paymentVoucher.body.voucher.id);

  const postedPaymentVoucher = await api.patch<{ voucher: { id: string; status: string } }>(
    `/api/vouchers/${paymentVoucher.body.voucher.id}`,
    { status: "posted" }
  );
  assert.equal(postedPaymentVoucher.response.status, 200);
  assert.equal(postedPaymentVoucher.body.voucher.status, "posted");

  const ledger = await api.get<{ ledger: Array<{ reference: string; entry_type: string }> }>(
    `/api/reports/ledger?from=${periodStart}&to=${today}`
  );
  assert.equal(ledger.response.status, 200);
  assert.ok(ledger.body.ledger.some((entry) => entry.reference === reportSaleNumber && entry.entry_type === "sale"));
  assert.ok(!ledger.body.ledger.some((entry) => entry.reference === voidedSaleNumber && entry.entry_type === "sale"));
  assert.ok(ledger.body.ledger.some((entry) => entry.entry_type === "payroll"));
  assert.ok(ledger.body.ledger.some((entry) => entry.entry_type === "voucher"));

  const scrd = await api.get<{
    salesByCategory: Array<{ category_name: string; total: string }>;
    payrollSummary: { net_salary?: string } | null;
    receiptVoucherSummary: { total?: string } | null;
    voucherExpenses: Array<{ description?: string }>;
  }>(`/api/reports/scrd?year=${year}&month=${month}`);
  assert.equal(scrd.response.status, 200);
  assert.ok(Array.isArray(scrd.body.salesByCategory));
  assert.ok(scrd.body.salesByCategory.some((entry) => Number(entry.total) >= 120));
  assert.ok(Number(scrd.body.payrollSummary?.net_salary ?? 0) > 0);
  assert.ok(Number(scrd.body.receiptVoucherSummary?.total ?? 0) >= 75);
  assert.ok(scrd.body.voucherExpenses.some((entry) => String(entry.description ?? "").includes("Smoke office supplies")));

  const savedScrd = await api.post<{ report: { year: number; month: number; beginning_balance: string | number } }>(
    "/api/reports/scrd/saved",
    {
      year,
      month,
      beginning_balance: 500,
      council_support_fund: 10,
      troop_fees: 5,
      district_committee: 0,
      career_woman: 0,
      honorary_member: 0,
      iccg: 0,
      thinking_day_fund_gen: 0,
      nes_sales: 0,
      rental_rows: [],
      interest_income: 0,
      souvenir_sales: 0,
      other_income_label: "Smoke Income",
      other_income_amount: 25,
      exp_salaries_wages: 0,
      exp_cola: 0,
      exp_representation_ce: 0,
      exp_sss: 0,
      exp_philhealth: 0,
      exp_pagibig: 0,
      exp_transportation: 0,
      exp_postage: 0,
      exp_telephone: 0,
      exp_electric: 0,
      exp_office_supplies: 0,
      exp_maintenance_linens: 0,
      exp_gasoline_oil: 0,
      exp_maintenance_vehicle: 0,
      exp_repair_hq: 0,
      exp_trainings: 0,
      exp_conferences: 0,
      exp_representation: 0,
      exp_donations: 0,
      exp_christmas_program: 0,
      exp_escoda_fund: 0,
      exp_thinking_day_fund: 0,
      exp_licenses_permits: 0,
      exp_legal_fees: 0,
      exp_taxes: 0,
      exp_advertising: 0,
      exp_tulong_bata: 0,
      exp_miscellaneous: 0,
      nes_purchases: 0,
      acc_cash_in_bank_dbp: 0,
      acc_petty_cash: 0,
      acc_cash_on_hand: 0,
      acc_retirement_fund: 0,
      acc_cash_in_bank_maybank: 0,
      acc_checking_account_dbp: 0,
      acc_cash_in_bank_pnb: 0,
    }
  );
  assert.equal(savedScrd.response.status, 200);
  assert.equal(Number(savedScrd.body.report.beginning_balance), 500);

  const loadedScrd = await api.get<{ report: { year: number; month: number; beginning_balance: string | number } | null }>(
    `/api/reports/scrd/saved?year=${year}&month=${month}`
  );
  assert.equal(loadedScrd.response.status, 200);
  assert.equal(loadedScrd.body.report?.year, year);
  assert.equal(loadedScrd.body.report?.month, month);
  assert.equal(Number(loadedScrd.body.report?.beginning_balance ?? 0), 500);

  const disbursementJournal = await api.get<{ vouchers: Array<{ id: string }>; payroll: Array<{ id: string }> }>(
    `/api/reports/disbursement-journal?year=${year}&month=${month}`
  );
  assert.equal(disbursementJournal.response.status, 200);
  assert.ok(disbursementJournal.body.vouchers.some((entry) => entry.id === paymentVoucher.body.voucher.id));
  assert.ok(disbursementJournal.body.payroll.some((entry) => entry.id === cleanupState.payrollId));

  const receiptsJournal = await api.get<{
    sales: Array<{ id: string }>;
    receiptVouchers: Array<{ id: string }>;
  }>(`/api/reports/receipts-journal?year=${year}&month=${month}`);
  assert.equal(receiptsJournal.response.status, 200);
  assert.ok(receiptsJournal.body.sales.some((entry) => entry.id === reportSale.body.sale.id));
  assert.ok(!receiptsJournal.body.sales.some((entry) => entry.id === voidedSale.body.sale.id));
  assert.ok(receiptsJournal.body.receiptVouchers.some((entry) => entry.id === receiptVoucher.body.voucher.id));
});
