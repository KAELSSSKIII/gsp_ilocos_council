export const ROUTE_ROLE_ACCESS = {
  authUserList: ["admin", "accountant", "manager", "hr"],
  receiptSettings: ["admin", "cashier", "accountant", "manager"],
  businessSettingsWrite: ["admin", "accountant", "manager"],
  saleVoid: ["admin", "manager"],
  receiptVoidMetadata: ["admin", "manager"],
  userCrud: ["admin"],
} as const;
