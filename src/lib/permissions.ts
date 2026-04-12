export const USER_ROLES = [
  "admin",
  "cashier",
  "accountant",
  "hr",
  "inventory_clerk",
  "manager",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_HOME: Record<UserRole, string> = {
  admin: "/",
  accountant: "/",
  cashier: "/pos",
  hr: "/employees",
  inventory_clerk: "/products",
  manager: "/",
};

export const ROUTE_ACCESS = {
  dashboard: ["admin", "accountant", "manager", "hr"],
  pos: ["admin", "cashier"],
  incomeStatement: ["admin", "accountant", "manager"],
  rentalCalendar: ["admin", "cashier", "manager"],
  cart: ["admin", "cashier"],
  checkout: ["admin", "cashier"],
  receipt: ["admin", "cashier"],
  receipts: ["admin", "cashier"],
  products: ["admin", "cashier", "inventory_clerk", "accountant"],
  accounting: ["admin", "accountant"],
  dccr: ["admin", "cashier", "accountant", "manager"],
  employees: ["admin", "hr"],
  payroll: ["admin", "accountant", "hr"],
  vouchers: ["admin", "accountant", "manager"],
  settings: ["admin", "manager", "accountant"],
  members: ["admin"],
  scrd: ["admin", "accountant"],
  inventoryReport: ["admin", "accountant", "inventory_clerk"],
  users: ["admin"],
  auditLogs: ["admin"],
  receiptSeries: ["admin", "accountant"],
  checkVoucherPrint: ["admin", "accountant"],
  payrollSheet: ["admin", "accountant", "hr"],
  cashDisbursementJournal: ["admin", "accountant"],
  cashReceiptsJournal: ["admin", "accountant"],
  journalVoucher: ["admin", "accountant"],
} as const satisfies Record<string, readonly UserRole[]>;

export const FEATURE_ACCESS = {
  manageReceiptSettings: ["admin", "accountant", "manager"],
  filterReceiptsByCashier: ["admin", "accountant", "manager"],
  viewStaffDirectory: ["admin", "accountant", "manager", "hr"],
  voidSales: ["admin", "manager"],
  manageUsers: ["admin"],
} as const satisfies Record<string, readonly UserRole[]>;

export function hasRoleAccess(
  role: UserRole | undefined,
  allowedRoles: readonly UserRole[]
) {
  return !!role && allowedRoles.includes(role);
}
