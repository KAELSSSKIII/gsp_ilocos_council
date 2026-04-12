/**
 * CSV batch product import utility.
 * Expected columns (case-insensitive): sku, name, selling_price, cost_price,
 * stock_quantity, reorder_level, category, description, size
 */

export type CsvProductRow = {
  sku: string;
  name: string;
  selling_price: number;
  cost_price: number;
  stock_quantity: number;
  reorder_level: number;
  category: string;
  description: string;
  size: string;
};

function parseNumber(raw: string, field: string, rowNum: number): number {
  const val = parseFloat(raw.trim());
  if (isNaN(val)) throw new Error(`Row ${rowNum}: "${field}" must be a number, got "${raw}".`);
  if (val < 0) throw new Error(`Row ${rowNum}: "${field}" cannot be negative.`);
  return val;
}

export function parseProductCsv(text: string): CsvProductRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
  const required = ["sku", "name", "selling_price", "cost_price", "stock_quantity"];
  for (const col of required) {
    if (!headers.includes(col)) throw new Error(`Missing required column: "${col}".`);
  }

  const col = (name: string) => headers.indexOf(name);

  return lines.slice(1).map((line, i) => {
    const rowNum = i + 2;
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));

    const sku = cells[col("sku")]?.trim() ?? "";
    const name = cells[col("name")]?.trim() ?? "";
    if (!sku) throw new Error(`Row ${rowNum}: "sku" is required.`);
    if (!name) throw new Error(`Row ${rowNum}: "name" is required.`);

    return {
      sku,
      name,
      selling_price: parseNumber(cells[col("selling_price")] ?? "0", "selling_price", rowNum),
      cost_price: parseNumber(cells[col("cost_price")] ?? "0", "cost_price", rowNum),
      stock_quantity: Math.round(parseNumber(cells[col("stock_quantity")] ?? "0", "stock_quantity", rowNum)),
      reorder_level: col("reorder_level") >= 0
        ? Math.round(parseNumber(cells[col("reorder_level")] ?? "0", "reorder_level", rowNum))
        : 0,
      category: col("category") >= 0 ? (cells[col("category")] ?? "") : "",
      description: col("description") >= 0 ? (cells[col("description")] ?? "") : "",
      size: col("size") >= 0 ? (cells[col("size")] ?? "") : "",
    };
  });
}

export const CSV_TEMPLATE_HEADERS = "sku,name,selling_price,cost_price,stock_quantity,reorder_level,category,description,size";

export function downloadCsvTemplate() {
  const example = [
    CSV_TEMPLATE_HEADERS,
    "SKU-001,Sample Product,150.00,80.00,50,10,Uniforms,A sample product,S",
    "SKU-002,Another Item,250.00,120.00,30,5,Accessories,,",
  ].join("\n");

  const blob = new Blob([example], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "product_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
