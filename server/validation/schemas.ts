import { z } from "zod";

const uuidSchema = z.string().uuid();
const optionalUuidSchema = z.string().uuid().nullable().optional();
const isoDateSchema = z.string().datetime({ offset: true });
const optionalIsoDateSchema = isoDateSchema.nullable().optional();

const nonNegativeNumber = z.coerce.number().finite().min(0);
const optionalNonNegativeNumber = nonNegativeNumber.optional();

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const saleIdParamSchema = z.object({
  saleId: uuidSchema,
});

export const authLoginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(255),
});

export const businessSettingsSchema = z.object({
  taxRate: z.coerce.number().min(0).max(1),
  rentalDiscountRate: z.coerce.number().min(0).max(1),
  orgName: z.string().trim().min(1).max(255),
  regionName: z.string().trim().min(1).max(255),
  councilName: z.string().trim().min(1).max(255),
  orgAddress: z.string().trim().max(500).default(""),
  bankAccount1: z.string().trim().max(255),
  bankAccount2: z.string().trim().max(255),
  bankAccount3: z.string().trim().max(255),
  bankAccount4: z.string().trim().max(255),
  bankAccount5: z.string().trim().max(255),
  reportPreparedByName: z.string().trim().max(255).default(""),
  reportPreparedByTitle: z.string().trim().max(255).default("Cashier"),
  reportVerifiedByName: z.string().trim().max(255).default(""),
  reportVerifiedByTitle: z.string().trim().max(255).default("Supervisor / Council Executive Director"),
  reportApprovedByName: z.string().trim().max(255).default(""),
  reportApprovedByTitle: z.string().trim().max(255).default("Council President / Authorized Signatory"),
});

export const receiptSettingsCreateSchema = z.object({
  start_number: z.coerce.number().int().min(0),
  end_number: z.coerce.number().int().min(0),
  current_number: z.coerce.number().int().min(0),
  date_issued: z.string().trim().min(1).max(50),
}).refine((value) => value.start_number < value.end_number, {
  message: "start_number must be less than end_number",
  path: ["start_number"],
}).refine(
  (value) => value.current_number >= value.start_number && value.current_number <= value.end_number + 1,
  {
    message: "current_number must be within the active range",
    path: ["current_number"],
  }
);

export const receiptSettingsUpdateSchema = z.object({
  start_number: z.coerce.number().int().min(0).optional(),
  end_number: z.coerce.number().int().min(0).optional(),
  current_number: z.coerce.number().int().min(0).optional(),
  date_issued: z.string().trim().min(1).max(50).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided",
});

export const memberCreateSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email().max(255).nullable().optional(),
  discount_rate: z.coerce.number().min(0).max(1).optional(),
});

export const memberUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  discount_rate: z.coerce.number().min(0).max(1).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided",
});

export const productCreateSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).nullable().optional(),
  category_id: optionalUuidSchema,
  image_url: z.string().trim().url().max(2048).nullable().optional(),
  size: z.string().trim().max(100).nullable().optional(),
  cost_price: nonNegativeNumber,
  selling_price: nonNegativeNumber,
  stock_quantity: z.coerce.number().int().min(0).optional(),
  reorder_level: z.coerce.number().int().min(0).optional(),
});

export const productUpdateSchema = z.object({
  sku: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category_id: optionalUuidSchema,
  image_url: z.string().trim().url().max(2048).nullable().optional(),
  size: z.string().trim().max(100).nullable().optional(),
  cost_price: optionalNonNegativeNumber,
  selling_price: optionalNonNegativeNumber,
  stock_quantity: z.coerce.number().int().min(0).optional(),
  reorder_level: z.coerce.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  adjust_reason: z.string().trim().max(500).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided",
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).nullable().optional(),
  revenue_account_id: optionalUuidSchema,
});

export const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  revenue_account_id: optionalUuidSchema,
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided",
});

const saleRecordSchema = z.object({
  sale_number: z.string().trim().min(1).max(100),
  cashier_id: uuidSchema,
  branch: z.string().trim().max(255).nullable().optional(),
  subtotal: nonNegativeNumber,
  tax_amount: optionalNonNegativeNumber,
  discount_amount: optionalNonNegativeNumber,
  total_amount: nonNegativeNumber,
  payment_method: z.string().trim().min(1).max(50),
  payment_reference: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  member_id: optionalUuidSchema,
  receipt_number: z.coerce.number().int().min(0).nullable().optional(),
});

const saleItemSchema = z.object({
  product_id: uuidSchema,
  quantity: z.coerce.number().int().positive(),
  unit_price: nonNegativeNumber,
  unit_cost: nonNegativeNumber,
  subtotal: nonNegativeNumber,
});

const rentalBookingSchema = z.object({
  rental_space_id: uuidSchema,
  booking_date: z.string().trim().min(1).max(50),
  notes: z.string().trim().max(1000).nullable().optional(),
  total_amount: optionalNonNegativeNumber.nullable(),
  initial_payment: optionalNonNegativeNumber.nullable(),
  payment_status: z.string().trim().max(50).optional(),
});

export const saleCreateSchema = z.object({
  sale: saleRecordSchema,
  items: z.array(saleItemSchema).min(1),
  receipt_payload: z.record(z.string(), z.unknown()).optional(),
  rental_bookings: z.array(rentalBookingSchema).optional(),
});

export const saleVoidSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
});

export const salesQuerySchema = z.object({
  from: optionalIsoDateSchema,
  to: optionalIsoDateSchema,
  cashier_id: optionalUuidSchema,
  include_items: z.enum(["true", "false"]).optional(),
});

export const salesReceiptsQuerySchema = z.object({
  sale_ids: z.string().trim().min(1).optional(),
  from: optionalIsoDateSchema,
  to: optionalIsoDateSchema,
  cashier_id: optionalUuidSchema,
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(200).optional(),
});

export const productsListQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  category_id: optionalUuidSchema,
  unassigned: z.enum(["true", "false"]).optional(),
  include_rental: z.enum(["true", "false"]).optional(),
  exclude_rental: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(5000).optional(),
});

export const receiptVoidMetadataSchema = z.object({
  voided_at: isoDateSchema.nullable().optional(),
  voided_by: optionalUuidSchema,
  void_reason: z.string().trim().max(500).nullable().optional(),
});

export const userCreateSchema = z.object({
  full_name: z.string().trim().min(1).max(255),
  username: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, underscores, dots, and hyphens"),
  password: z.string().min(8).max(255),
  role: z.enum(["admin", "accountant", "cashier", "hr", "inventory_clerk", "manager"]),
  branch: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
});

export const userUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(255).optional(),
  role: z.enum(["admin", "accountant", "cashier", "hr", "inventory_clerk", "manager"]).optional(),
  branch: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  password: z.string().min(8).max(255).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided",
});

const accountTypeSchema = z.enum(["asset", "liability", "equity", "income", "expense"]);
const accountCategorySchema = z.enum([
  "current_asset",
  "fixed_asset",
  "current_liability",
  "long_term_liability",
  "equity",
  "revenue",
  "cost_of_sales",
  "operating_expense",
  "other_income",
  "other_expense",
]);
const normalBalanceSchema = z.enum(["debit", "credit"]);

export const accountCreateSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(255),
  account_type: accountTypeSchema,
  category: accountCategorySchema,
  normal_balance: normalBalanceSchema,
  parent_account_id: optionalUuidSchema,
  description: z.string().trim().max(1000).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const accountUpdateSchema = z.object({
  code: z.string().trim().min(1).max(20).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  account_type: accountTypeSchema.optional(),
  category: accountCategorySchema.optional(),
  normal_balance: normalBalanceSchema.optional(),
  parent_account_id: optionalUuidSchema,
  description: z.string().trim().max(1000).nullable().optional(),
  is_active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided",
});

export const manualJournalEntryCreateSchema = z.object({
  entry_date: z.string().trim().min(1).max(20),
  description: z.string().trim().min(1).max(1000),
  reference_type: z.string().trim().max(100).nullable().optional(),
  reference_id: optionalUuidSchema,
  lines: z.array(z.object({
    account_id: uuidSchema,
    description: z.string().trim().max(500).nullable().optional(),
    debit: z.coerce.number().min(0).optional(),
    credit: z.coerce.number().min(0).optional(),
  })).min(2),
});

export const accountingMappingsUpdateSchema = z.object({
  mappings: z.array(z.object({
    mapping_key: z.string().trim().min(1).max(100),
    account_id: uuidSchema,
  })).min(1),
});

export const employeeCreateSchema = z.object({
  employee_number: z.string().trim().min(1).max(50),
  full_name:       z.string().trim().min(1).max(255),
  position:        z.string().trim().min(1).max(255),
  department:      z.string().trim().max(255).nullable().optional(),
  branch:          z.string().trim().max(255).nullable().optional(),
  email:           z.string().trim().email().max(255).nullable().optional(),
  phone:           z.string().trim().max(50).nullable().optional(),
  address:         z.string().trim().max(500).nullable().optional(),
  hire_date:       z.string().trim().min(1).max(30),
  salary:          z.coerce.number().finite().min(0),
});

export const employeeUpdateSchema = z.object({
  full_name:  z.string().trim().min(1).max(255).optional(),
  position:   z.string().trim().min(1).max(255).optional(),
  department: z.string().trim().max(255).nullable().optional(),
  branch:     z.string().trim().max(255).nullable().optional(),
  email:      z.string().trim().email().max(255).nullable().optional(),
  phone:      z.string().trim().max(50).nullable().optional(),
  address:    z.string().trim().max(500).nullable().optional(),
  salary:     z.coerce.number().finite().min(0).optional(),
  is_active:  z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(1000),
  quantity:    z.coerce.number().finite().min(0),
  unit_price:  z.coerce.number().finite().min(0),
  amount:      z.coerce.number().finite().min(0),
});

export const invoiceCreateSchema = z.object({
  customer_name:   z.string().trim().min(1).max(255),
  customer_email:  z.string().trim().email().max(255).nullable().optional(),
  customer_phone:  z.string().trim().max(50).nullable().optional(),
  issue_date:      z.string().trim().min(1).max(30),
  due_date:        z.string().trim().min(1).max(30),
  invoice_number:  z.string().trim().max(100).optional(),
  status:          z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
  tax_amount:      z.coerce.number().finite().min(0).optional(),
  notes:           z.string().trim().max(2000).nullable().optional(),
  items:           z.array(invoiceItemSchema).optional(),
});

export const invoiceUpdateSchema = z.object({
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]),
});

export const activeCartCreateSchema = z.object({
  branch: z.string().trim().max(255).nullable().optional(),
});

export const voucherCreateSchema = z.object({
  voucher_type:   z.enum([
    "payment",
    "receipt",
    "journal",
    "payroll",
    "cash_voucher",
    "check_voucher",
    "journal_voucher",
    "accounts_payable",
    "accounts_receivable",
  ]),
  amount:         z.coerce.number().finite().min(0),
  description:    z.string().trim().min(1).max(1000),
  voucher_number: z.string().trim().max(100).optional(),
  account_id:     z.string().uuid().nullable().optional(),
  reference_id:   z.string().uuid().nullable().optional(),
  reference_type: z.string().trim().max(100).nullable().optional(),
});

export const voucherUpdateSchema = z.object({
  status: z.enum(["pending", "approved", "posted", "cancelled"]),
});

export const receiptSeriesCreateSchema = z.object({
  series_label: z.string().trim().min(1).max(255),
  from_number:  z.coerce.number().int().min(1),
  to_number:    z.coerce.number().int().min(1),
}).refine((v) => v.to_number >= v.from_number, {
  message: "to_number must be >= from_number",
  path: ["to_number"],
});

export const receiptSeriesUpdateSchema = z.object({
  is_active:    z.boolean().optional(),
  series_label: z.string().trim().min(1).max(255).optional(),
  from_number:  z.coerce.number().int().min(1).optional(),
  to_number:    z.coerce.number().int().min(1).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "At least one field must be provided" });
