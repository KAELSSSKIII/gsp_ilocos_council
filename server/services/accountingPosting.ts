import sql, { type SqlClient } from "../db";

type SqlExecutor = SqlClient;

type JournalLineInput = {
  accountCode: string;
  accountId?: string;
  debit?: number;
  credit?: number;
  description?: string | null;
};

type SaleRow = {
  id: string;
  sale_number: string;
  total_amount: string | number;
  tax_amount: string | number;
  discount_amount: string | number;
  created_at: Date | string;
  payment_method: string;
  payment_reference?: string | null;
  notes?: string | null;
};

type SaleItemRow = {
  product_id: string;
  subtotal: string | number;
  quantity: number;
  unit_cost: string | number;
  is_rental: boolean;
  category_revenue_account_code: string | null;
};

type VoucherRow = {
  id: string;
  voucher_number: string;
  voucher_type: "payment" | "receipt" | "journal" | "payroll";
  amount: string | number;
  description: string;
  account_code: string | null;
  posted_at: Date | string | null;
  created_at: Date | string;
};

type PayrollRow = {
  id: string;
  payroll_number: string;
  period_end: string;
  basic_salary: string | number;
  overtime_pay: string | number;
  cola: string | number;
  sss: string | number;
  philhealth: string | number;
  pagibig: string | number;
  tax_deducted: string | number;
  net_salary: string | number;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  issue_date: string;
  total_amount: string | number;
  subtotal: string | number;
  tax_amount: string | number;
  status: string;
};

type AccountLookupRow = {
  id: string;
  code: string;
};

type ExistingJournalLineRow = {
  account_code: string;
  description: string | null;
  debit: string | number;
  credit: string | number;
};

type JournalEntryRow = {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string | null;
  status: string;
};

type AccountingMappingRow = {
  mapping_key: string;
  account_code: string;
};

function asAmount(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function toDateOnly(value: Date | string | null | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return new Date().toISOString().slice(0, 10);
}

type SaleJournalAmountItem = Pick<SaleItemRow, "subtotal" | "quantity" | "unit_cost" | "is_rental">;

export function calculateSaleJournalAmounts(
  items: SaleJournalAmountItem[],
  discountAmountInput: string | number | null | undefined
) {
  const merchandiseRevenue = roundMoney(
    items.filter((item) => !item.is_rental).reduce((sum, item) => sum + asAmount(item.subtotal), 0)
  );
  const rentalRevenue = roundMoney(
    items.filter((item) => item.is_rental).reduce((sum, item) => sum + asAmount(item.subtotal), 0)
  );
  const costOfGoodsSold = roundMoney(
    items.filter((item) => !item.is_rental).reduce(
      (sum, item) => sum + asAmount(item.unit_cost) * Number(item.quantity),
      0
    )
  );
  const grossRevenue = roundMoney(merchandiseRevenue + rentalRevenue);
  const discountAmount = roundMoney(Math.min(asAmount(discountAmountInput), grossRevenue));
  const discountRatio = grossRevenue > 0 ? discountAmount / grossRevenue : 0;
  const merchandiseDiscount = roundMoney(merchandiseRevenue * discountRatio);
  const rentalDiscount = roundMoney(discountAmount - merchandiseDiscount);
  const merchandiseNetRevenue = roundMoney(Math.max(0, merchandiseRevenue - merchandiseDiscount));
  const rentalNetRevenue = roundMoney(Math.max(0, rentalRevenue - rentalDiscount));

  return {
    merchandiseRevenue,
    rentalRevenue,
    costOfGoodsSold,
    grossRevenue,
    discountAmount,
    merchandiseNetRevenue,
    rentalNetRevenue,
  };
}

export function calculateSaleJournalPosting(
  items: SaleJournalAmountItem[],
  params: {
    collectedAmountInput: string | number | null | undefined;
    discountAmountInput: string | number | null | undefined;
    taxAmountInput: string | number | null | undefined;
  }
) {
  const journalAmounts = calculateSaleJournalAmounts(items, params.discountAmountInput);
  const taxAmount = roundMoney(asAmount(params.taxAmountInput));
  const recognizedSaleAmount = roundMoney(
    journalAmounts.merchandiseNetRevenue + journalAmounts.rentalNetRevenue + taxAmount
  );
  const cashCollected = roundMoney(
    Math.min(asAmount(params.collectedAmountInput), recognizedSaleAmount)
  );
  const receivableAmount = roundMoney(Math.max(0, recognizedSaleAmount - cashCollected));

  return {
    ...journalAmounts,
    taxAmount,
    recognizedSaleAmount,
    cashCollected,
    receivableAmount,
  };
}

function buildEntryNumber(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

async function getAccountIds(executor: SqlExecutor, codes: string[]) {
  const rows = await executor<AccountLookupRow[]>`
    SELECT id, code
    FROM public.chart_of_accounts
    WHERE code = ANY(${codes}::text[])
  `;

  const accountMap = new Map(rows.map((row) => [row.code, row.id]));
  for (const code of codes) {
    if (!accountMap.has(code)) {
      throw new Error(`Missing chart of accounts code ${code}`);
    }
  }

  return accountMap;
}

async function getPostingAccountCodes(executor: SqlExecutor) {
  const defaults = {
    sales_cash: "1010",
    sales_cashless: "1020",
    sales_merchandise_revenue: "4000",
    sales_rental_revenue: "4100",
    sales_cogs: "5000",
    sales_inventory: "1200",
    voucher_receipt_cash: "1020",
    voucher_receipt_income: "4200",
    voucher_payment_default_expense: "6900",
    voucher_payment_utilities_expense: "6200",
    voucher_payment_office_expense: "6300",
    voucher_payment_cash: "1020",
    voucher_journal_offset: "2000",
    voucher_payroll_expense: "6100",
    voucher_payroll_liability: "2100",
    payroll_expense: "6100",
    payroll_cash: "1020",
    payroll_liability: "2100",
    invoice_receivable: "1100",
    invoice_revenue: "4000",
    invoice_cash: "1020",
    sales_tax_payable: "2000",
    invoice_tax_payable: "2000",
  } as const;

  const rows = await executor<AccountingMappingRow[]>`
    SELECT am.mapping_key, coa.code AS account_code
    FROM public.accounting_mappings am
    JOIN public.chart_of_accounts coa ON coa.id = am.account_id
  `;

  return rows.reduce<Record<string, string>>(
    (acc, row) => ({ ...acc, [row.mapping_key]: row.account_code }),
    { ...defaults }
  );
}

async function createJournalEntry(
  executor: SqlExecutor,
  params: {
    sourceKey: string;
    referenceType: string;
    referenceId: string | null;
    entryDate: string;
    entryNumberPrefix: string;
    description: string;
    createdBy: string | null;
    lines: JournalLineInput[];
  }
) {
  const existing = await executor<JournalEntryRow[]>`
    SELECT id, entry_number, entry_date, description, status
    FROM public.journal_entries
    WHERE source_key = ${params.sourceKey}
    LIMIT 1
  `;

  if (existing.length > 0) {
    return existing[0];
  }

  const lines = params.lines
    .map((line) => ({
      ...line,
      debit: roundMoney(line.debit ?? 0),
      credit: roundMoney(line.credit ?? 0),
    }))
    .filter((line) => (line.debit ?? 0) > 0 || (line.credit ?? 0) > 0);

  const totalDebit = roundMoney(lines.reduce((sum, line) => sum + (line.debit ?? 0), 0));
  const totalCredit = roundMoney(lines.reduce((sum, line) => sum + (line.credit ?? 0), 0));

  if (totalDebit <= 0 || totalCredit <= 0 || totalDebit !== totalCredit) {
    throw new Error(`Unbalanced journal entry for ${params.sourceKey}`);
  }

  const linesNeedingCodes = lines.filter((line) => !line.accountId);
  const accountIds = linesNeedingCodes.length > 0
    ? await getAccountIds(
        executor,
        Array.from(new Set(linesNeedingCodes.map((line) => line.accountCode)))
      )
    : new Map<string, string>();

  const [entry] = await executor<JournalEntryRow[]>`
    INSERT INTO public.journal_entries (
      entry_number,
      entry_date,
      source_key,
      reference_type,
      reference_id,
      description,
      status,
      created_by,
      posted_by,
      posted_at
    ) VALUES (
      ${buildEntryNumber(params.entryNumberPrefix)},
      ${params.entryDate},
      ${params.sourceKey},
      ${params.referenceType},
      ${params.referenceId}::uuid,
      ${params.description},
      'posted',
      ${params.createdBy ?? null}::uuid,
      ${params.createdBy ?? null}::uuid,
      NOW()
    )
    RETURNING id, entry_number, entry_date, description, status
  `;

  const lineRows = lines.map((line, index) => ({
    journal_entry_id: entry.id,
    account_id: line.accountId ?? accountIds.get(line.accountCode),
    line_number: index + 1,
    description: line.description ?? null,
    debit: line.debit ?? 0,
    credit: line.credit ?? 0,
  }));

  await executor`INSERT INTO public.journal_entry_lines ${executor(lineRows)}`;

  return entry;
}

export async function postManualJournalEntry(
  executor: SqlExecutor,
  params: {
    entryDate: string;
    description: string;
    referenceType?: string | null;
    referenceId?: string | null;
    createdBy: string | null;
    lines: Array<{
      accountId: string;
      debit?: number;
      credit?: number;
      description?: string | null;
    }>;
  }
) {
  return createJournalEntry(executor, {
    sourceKey: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    referenceType: params.referenceType ?? "manual",
    referenceId: params.referenceId ?? null,
    entryDate: params.entryDate,
    entryNumberPrefix: "JE-MAN",
    description: params.description,
    createdBy: params.createdBy,
    lines: params.lines.map((line) => ({
      accountCode: "",
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
    })),
  });
}

export function categorizeVoucherExpense(description: string) {
  const text = description.toLowerCase();

  if (text.includes("utility") || text.includes("electric") || text.includes("water")) return "utilities";
  if (text.includes("office") || text.includes("supplies") || text.includes("stationery")) return "office";
  if (text.includes("salary") || text.includes("wage") || text.includes("payroll")) return "payroll";
  return "default";
}

export async function postSaleJournalEntry(
  executor: SqlExecutor,
  params: { saleId: string; createdBy: string | null }
) {
  const [sale] = await executor<SaleRow[]>`
    SELECT id, sale_number, total_amount, tax_amount, discount_amount, created_at, payment_method, payment_reference, notes
    FROM public.sales
    WHERE id = ${params.saleId}::uuid
    LIMIT 1
  `;

  if (!sale) {
    throw new Error("Sale not found for journal posting");
  }

  const items = await executor<SaleItemRow[]>`
    SELECT
      si.product_id,
      si.subtotal,
      si.quantity,
      si.unit_cost,
      revenue_coa.code AS category_revenue_account_code,
      EXISTS(
        SELECT 1
        FROM public.rental_spaces rs
        WHERE rs.product_id = si.product_id
      ) AS is_rental
    FROM public.sale_items si
    JOIN public.products p ON p.id = si.product_id
    LEFT JOIN public.product_categories pc ON pc.id = p.category_id
    LEFT JOIN public.chart_of_accounts revenue_coa ON revenue_coa.id = pc.revenue_account_id
    WHERE si.sale_id = ${params.saleId}::uuid
  `;

  const mapping = await getPostingAccountCodes(executor);
  const {
    costOfGoodsSold,
    merchandiseNetRevenue,
    rentalNetRevenue,
    taxAmount,
    cashCollected,
    receivableAmount,
  } = calculateSaleJournalPosting(items, {
    collectedAmountInput: sale.total_amount,
    discountAmountInput: sale.discount_amount,
    taxAmountInput: sale.tax_amount,
  });

  const cashAccountCode = sale.payment_method === "cash"
    ? mapping.sales_cash
    : mapping.sales_cashless;
  const lines: JournalLineInput[] = [];

  if (cashCollected > 0) {
    lines.push({
      accountCode: cashAccountCode,
      debit: cashCollected,
      description: `Sale ${sale.sale_number}`,
    });
  }

  if (receivableAmount > 0) {
    lines.push({
      accountCode: mapping.invoice_receivable,
      debit: receivableAmount,
      description: "Outstanding rental balance",
    });
  }

  if (taxAmount > 0) {
    lines.push({
      accountCode: mapping.sales_tax_payable,
      credit: taxAmount,
      description: "Output tax payable",
    });
  }

  // Some rental sales only collect a deposit today.
  // In that case, cash covers the collected amount while the remaining balance
  // is booked to receivables so revenue can still be recognized in full.
  const merchandiseRevenueByAccount = new Map<string, number>();
  for (const item of items.filter((entry) => !entry.is_rental)) {
    const code = item.category_revenue_account_code ?? mapping.sales_merchandise_revenue;
    merchandiseRevenueByAccount.set(code, roundMoney((merchandiseRevenueByAccount.get(code) ?? 0) + asAmount(item.subtotal)));
  }

  if (merchandiseNetRevenue > 0) {
    const grossAssigned = Array.from(merchandiseRevenueByAccount.values()).reduce((sum, value) => sum + value, 0);
    const reductionRatio = grossAssigned > 0 ? merchandiseNetRevenue / grossAssigned : 1;
    Array.from(merchandiseRevenueByAccount.entries()).forEach(([accountCode, grossValue], index, array) => {
      const adjustedValue = index === array.length - 1
        ? roundMoney(merchandiseNetRevenue - array.slice(0, -1).reduce((sum, [, value]) => sum + roundMoney(value * reductionRatio), 0))
        : roundMoney(grossValue * reductionRatio);
      if (adjustedValue > 0) {
        lines.push({
          accountCode,
          credit: adjustedValue,
          description: "Merchandise sales revenue",
        });
      }
    });
  }

  if (rentalNetRevenue > 0) {
    lines.push({
      accountCode: mapping.sales_rental_revenue,
      credit: rentalNetRevenue,
      description: "Rental income",
    });
  }

  if (costOfGoodsSold > 0) {
    lines.push(
      {
        accountCode: mapping.sales_cogs,
        debit: costOfGoodsSold,
        description: "Cost of goods sold",
      },
      {
        accountCode: mapping.sales_inventory,
        credit: costOfGoodsSold,
        description: "Inventory reduction",
      }
    );
  }

  return createJournalEntry(executor, {
    sourceKey: `sale:completed:${sale.id}`,
    referenceType: "sale",
    referenceId: sale.id,
    entryDate: toDateOnly(sale.created_at),
    entryNumberPrefix: "JE-SALE",
    description: `Auto-posted sale ${sale.sale_number}`,
    createdBy: params.createdBy,
    lines,
  });
}

export async function postRentalBalancePaymentJournalEntry(
  executor: SqlExecutor,
  params: { saleId: string; createdBy: string | null }
) {
  const [sale] = await executor<SaleRow[]>`
    SELECT id, sale_number, total_amount, tax_amount, discount_amount, created_at, payment_method, payment_reference, notes
    FROM public.sales
    WHERE id = ${params.saleId}::uuid
    LIMIT 1
  `;

  if (!sale) {
    throw new Error("Sale not found for rental balance journal posting");
  }

  const amount = roundMoney(asAmount(sale.total_amount));
  if (amount <= 0) {
    throw new Error("Rental balance payment amount must be greater than zero");
  }

  const mapping = await getPostingAccountCodes(executor);
  const cashAccountCode = sale.payment_method === "cash"
    ? mapping.sales_cash
    : mapping.sales_cashless;

  return createJournalEntry(executor, {
    sourceKey: `sale:balance:${sale.id}`,
    referenceType: "sale",
    referenceId: sale.id,
    entryDate: toDateOnly(sale.created_at),
    entryNumberPrefix: "JE-BAL",
    description: `Rental balance payment ${sale.sale_number}`,
    createdBy: params.createdBy,
    lines: [
      {
        accountCode: cashAccountCode,
        debit: amount,
        description: `Balance payment ${sale.sale_number}`,
      },
      {
        accountCode: mapping.invoice_receivable,
        credit: amount,
        description: sale.notes ?? sale.payment_reference ?? "Rental balance receivable settlement",
      },
    ],
  });
}

export async function postVoucherJournalEntry(
  executor: SqlExecutor,
  params: { voucherId: string; createdBy: string | null }
) {
  const [voucher] = await executor<VoucherRow[]>`
    SELECT v.id, v.voucher_number, v.voucher_type, v.amount, v.description, coa.code AS account_code, v.posted_at, v.created_at
    FROM public.vouchers v
    LEFT JOIN public.chart_of_accounts coa ON coa.id = v.account_id
    WHERE v.id = ${params.voucherId}::uuid
    LIMIT 1
  `;

  if (!voucher) {
    throw new Error("Voucher not found for journal posting");
  }

  const amount = asAmount(voucher.amount);
  const mapping = await getPostingAccountCodes(executor);
  let lines: JournalLineInput[];

  if (voucher.voucher_type === "receipt") {
    lines = [
      { accountCode: mapping.voucher_receipt_cash, debit: amount, description: "Receipt voucher deposit" },
      { accountCode: mapping.voucher_receipt_income, credit: amount, description: voucher.description },
    ];
  } else if (voucher.voucher_type === "payment") {
    const expenseBucket = categorizeVoucherExpense(voucher.description);
    const expenseCode = voucher.account_code ?? (expenseBucket === "utilities"
      ? mapping.voucher_payment_utilities_expense
      : expenseBucket === "office"
        ? mapping.voucher_payment_office_expense
        : expenseBucket === "payroll"
          ? mapping.voucher_payroll_expense
          : mapping.voucher_payment_default_expense);
    lines = [
      { accountCode: expenseCode, debit: amount, description: voucher.description },
      { accountCode: mapping.voucher_payment_cash, credit: amount, description: "Cash disbursement" },
    ];
  } else if (voucher.voucher_type === "payroll") {
    lines = [
      { accountCode: mapping.voucher_payroll_expense, debit: amount, description: voucher.description },
      { accountCode: mapping.voucher_payroll_liability, credit: amount, description: "Payroll liability" },
    ];
  } else {
    const expenseBucket = categorizeVoucherExpense(voucher.description);
    const expenseCode = voucher.account_code ?? (expenseBucket === "utilities"
      ? mapping.voucher_payment_utilities_expense
      : expenseBucket === "office"
        ? mapping.voucher_payment_office_expense
        : expenseBucket === "payroll"
          ? mapping.voucher_payroll_expense
          : mapping.voucher_payment_default_expense);
    lines = [
      { accountCode: expenseCode, debit: amount, description: voucher.description },
      { accountCode: mapping.voucher_journal_offset, credit: amount, description: "Journal clearing" },
    ];
  }

  return createJournalEntry(executor, {
    sourceKey: `voucher:posted:${voucher.id}`,
    referenceType: "voucher",
    referenceId: voucher.id,
    entryDate: toDateOnly(voucher.posted_at ?? voucher.created_at),
    entryNumberPrefix: "JE-VCH",
    description: `Auto-posted voucher ${voucher.voucher_number}`,
    createdBy: params.createdBy,
    lines,
  });
}

export async function postPayrollJournalEntry(
  executor: SqlExecutor,
  params: { payrollId: string; createdBy: string | null }
) {
  const [payroll] = await executor<PayrollRow[]>`
    SELECT
      id,
      payroll_number,
      period_end,
      basic_salary,
      overtime_pay,
      cola,
      sss,
      philhealth,
      pagibig,
      tax_deducted,
      net_salary
    FROM public.payroll
    WHERE id = ${params.payrollId}::uuid
    LIMIT 1
  `;

  if (!payroll) {
    throw new Error("Payroll entry not found for journal posting");
  }

  const grossPayroll = roundMoney(
    asAmount(payroll.basic_salary) + asAmount(payroll.overtime_pay) + asAmount(payroll.cola)
  );
  const withholdings = roundMoney(
    asAmount(payroll.sss) +
    asAmount(payroll.philhealth) +
    asAmount(payroll.pagibig) +
    asAmount(payroll.tax_deducted)
  );
  const mapping = await getPostingAccountCodes(executor);

  const lines: JournalLineInput[] = [
    { accountCode: mapping.payroll_expense, debit: grossPayroll, description: `Payroll ${payroll.payroll_number}` },
    { accountCode: mapping.payroll_cash, credit: asAmount(payroll.net_salary), description: "Payroll cash disbursement" },
  ];

  if (withholdings > 0) {
    lines.push({
      accountCode: mapping.payroll_liability,
      credit: withholdings,
      description: "Withheld payroll obligations",
    });
  }

  return createJournalEntry(executor, {
    sourceKey: `payroll:paid:${payroll.id}`,
    referenceType: "payroll",
    referenceId: payroll.id,
    entryDate: payroll.period_end,
    entryNumberPrefix: "JE-PAY",
    description: `Auto-posted payroll ${payroll.payroll_number}`,
    createdBy: params.createdBy,
    lines,
  });
}

export async function postInvoiceIssueJournalEntry(
  executor: SqlExecutor,
  params: { invoiceId: string; createdBy: string | null }
) {
  const [invoice] = await executor<InvoiceRow[]>`
    SELECT id, invoice_number, issue_date, total_amount, subtotal, tax_amount, status
    FROM public.invoices
    WHERE id = ${params.invoiceId}::uuid
    LIMIT 1
  `;

  if (!invoice) {
    throw new Error("Invoice not found for journal posting");
  }
  const mapping = await getPostingAccountCodes(executor);
  const taxAmount = roundMoney(asAmount(invoice.tax_amount));
  const revenueAmount = roundMoney(Math.max(0, asAmount(invoice.total_amount) - taxAmount));

  return createJournalEntry(executor, {
    sourceKey: `invoice:issued:${invoice.id}`,
    referenceType: "invoice",
    referenceId: invoice.id,
    entryDate: invoice.issue_date,
    entryNumberPrefix: "JE-INV",
    description: `Auto-posted invoice ${invoice.invoice_number}`,
    createdBy: params.createdBy,
    lines: [
      { accountCode: mapping.invoice_receivable, debit: asAmount(invoice.total_amount), description: "Accounts receivable" },
      { accountCode: mapping.invoice_revenue, credit: revenueAmount, description: "Invoice revenue" },
      ...(taxAmount > 0 ? [{
        accountCode: mapping.invoice_tax_payable,
        credit: taxAmount,
        description: "Invoice tax payable",
      }] : []),
    ],
  });
}

export async function postInvoicePaymentJournalEntry(
  executor: SqlExecutor,
  params: { invoiceId: string; createdBy: string | null }
) {
  const [invoice] = await executor<InvoiceRow[]>`
    SELECT id, invoice_number, issue_date, total_amount, subtotal, tax_amount, status
    FROM public.invoices
    WHERE id = ${params.invoiceId}::uuid
    LIMIT 1
  `;

  if (!invoice) {
    throw new Error("Invoice not found for payment posting");
  }
  const mapping = await getPostingAccountCodes(executor);

  return createJournalEntry(executor, {
    sourceKey: `invoice:paid:${invoice.id}`,
    referenceType: "invoice",
    referenceId: invoice.id,
    entryDate: invoice.issue_date,
    entryNumberPrefix: "JE-REC",
    description: `Auto-posted invoice payment ${invoice.invoice_number}`,
    createdBy: params.createdBy,
    lines: [
      { accountCode: mapping.invoice_cash, debit: asAmount(invoice.total_amount), description: "Invoice cash receipt" },
      { accountCode: mapping.invoice_receivable, credit: asAmount(invoice.total_amount), description: "Accounts receivable settlement" },
    ],
  });
}

export async function reverseJournalEntry(
  executor: SqlExecutor,
  params: {
    sourceKey: string;
    reverseSourceKey: string;
    referenceType: string;
    referenceId: string;
    entryDate: string;
    entryNumberPrefix: string;
    description: string;
    createdBy: string | null;
  }
) {
  const [existingReverse] = await executor<{ id: string }[]>`
    SELECT id
    FROM public.journal_entries
    WHERE source_key = ${params.reverseSourceKey}
    LIMIT 1
  `;

  if (existingReverse) {
    return existingReverse;
  }

  const originalLines = await executor<ExistingJournalLineRow[]>`
    SELECT
      coa.code AS account_code,
      jel.description,
      jel.debit,
      jel.credit
    FROM public.journal_entries je
    JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.source_key = ${params.sourceKey}
    ORDER BY jel.line_number
  `;

  if (originalLines.length === 0) {
    return null;
  }

  return createJournalEntry(executor, {
    sourceKey: params.reverseSourceKey,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    entryDate: params.entryDate,
    entryNumberPrefix: params.entryNumberPrefix,
    description: params.description,
    createdBy: params.createdBy,
    lines: originalLines.map((line) => ({
      accountCode: line.account_code,
      debit: asAmount(line.credit),
      credit: asAmount(line.debit),
      description: line.description,
    })),
  });
}
