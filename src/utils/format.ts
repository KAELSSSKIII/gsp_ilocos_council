export function formatCurrency(amount: number | null | undefined, currency = "PHP") {
  const value = Number(amount ?? 0);
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  return Number(value ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDate(input: string | Date | null | undefined) {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}



