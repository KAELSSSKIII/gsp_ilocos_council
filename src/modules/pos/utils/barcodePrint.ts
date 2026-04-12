import { escapeHtml } from "@/utils/escapeHtml";

export type BarcodePrintPresetId = "compact" | "retail" | "shelf";

export type BarcodePrintableProduct = {
  sku: string;
  name: string;
  size?: string | null;
  selling_price?: number | null;
};

export type BarcodePrintSelection = {
  product: BarcodePrintableProduct;
  qty: number;
};

export type BarcodePrintSettings = {
  presetId: BarcodePrintPresetId;
  showName: boolean;
  showSku: boolean;
  showPrice: boolean;
};

type BarcodePrintPreset = {
  id: BarcodePrintPresetId;
  label: string;
  description: string;
  pagePadding: string;
  gridTemplate: string;
  gap: string;
  cardWidth: string;
  cardMinHeight: string;
  cardPadding: string;
  borderRadius: string;
  titleFontSize: string;
  titleLineHeight: string;
  skuFontSize: string;
  priceFontSize: string;
  barcodeWidth: number;
  barcodeHeight: number;
  barcodeMargin: number;
};

export const BARCODE_PRINT_PRESETS: BarcodePrintPreset[] = [
  {
    id: "compact",
    label: "Compact Sticker",
    description: "Dense small labels for sticker sheets and quick stock tagging.",
    pagePadding: "10mm",
    gridTemplate: "repeat(auto-fill, minmax(48mm, 1fr))",
    gap: "4mm",
    cardWidth: "48mm",
    cardMinHeight: "26mm",
    cardPadding: "3mm",
    borderRadius: "3mm",
    titleFontSize: "9px",
    titleLineHeight: "1.2",
    skuFontSize: "8px",
    priceFontSize: "10px",
    barcodeWidth: 1.2,
    barcodeHeight: 34,
    barcodeMargin: 2,
  },
  {
    id: "retail",
    label: "Retail Label",
    description: "Balanced product label with readable name, SKU, and price.",
    pagePadding: "12mm",
    gridTemplate: "repeat(auto-fill, minmax(58mm, 1fr))",
    gap: "5mm",
    cardWidth: "58mm",
    cardMinHeight: "34mm",
    cardPadding: "4mm",
    borderRadius: "4mm",
    titleFontSize: "10px",
    titleLineHeight: "1.3",
    skuFontSize: "8.5px",
    priceFontSize: "11px",
    barcodeWidth: 1.45,
    barcodeHeight: 42,
    barcodeMargin: 3,
  },
  {
    id: "shelf",
    label: "Shelf Tag",
    description: "Larger labels for shelf edges and easy cashier scanning.",
    pagePadding: "12mm",
    gridTemplate: "repeat(auto-fill, minmax(72mm, 1fr))",
    gap: "6mm",
    cardWidth: "72mm",
    cardMinHeight: "42mm",
    cardPadding: "5mm",
    borderRadius: "5mm",
    titleFontSize: "12px",
    titleLineHeight: "1.35",
    skuFontSize: "9px",
    priceFontSize: "13px",
    barcodeWidth: 1.7,
    barcodeHeight: 52,
    barcodeMargin: 4,
  },
];

export function getBarcodePrintPreset(presetId: BarcodePrintPresetId) {
  return BARCODE_PRINT_PRESETS.find((preset) => preset.id === presetId) ?? BARCODE_PRINT_PRESETS[1];
}

function formatPrice(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "";

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value));
}

function getDisplayName(product: BarcodePrintableProduct) {
  return product.size ? `${product.name} (${product.size})` : product.name;
}

export function openBarcodePrintWindow(
  selections: BarcodePrintSelection[],
  settings: BarcodePrintSettings,
  title = "Product Barcodes"
) {
  const sanitizedSelections = selections
    .map(({ product, qty }) => ({ product, qty: Math.max(1, Math.min(9999, Math.floor(qty || 1))) }))
    .filter(({ product, qty }) => product.sku?.trim() && qty > 0);

  if (sanitizedSelections.length === 0) {
    return { ok: false as const, reason: "No valid products selected." };
  }

  const printWindow = window.open("", "_blank", "width=1100,height=780");
  if (!printWindow) {
    return { ok: false as const, reason: "Pop-up blocked. Enable pop-ups to print barcodes." };
  }

  const preset = getBarcodePrintPreset(settings.presetId);

  let globalIndex = 0;
  const cards: string[] = [];
  const scripts: string[] = [];

  sanitizedSelections.forEach(({ product, qty }) => {
    const displayName = getDisplayName(product);
    const priceLabel = formatPrice(product.selling_price);

    Array.from({ length: qty }).forEach(() => {
      const id = `bc-${globalIndex++}`;

      cards.push(`
        <article class="barcode-card">
          ${settings.showName ? `<h2>${escapeHtml(displayName)}</h2>` : ""}
          <svg id="${id}"></svg>
          ${settings.showSku ? `<div class="sku">${escapeHtml(product.sku)}</div>` : ""}
          ${settings.showPrice && priceLabel ? `<div class="price">${escapeHtml(priceLabel)}</div>` : ""}
        </article>
      `);

      scripts.push(`JsBarcode("#${id}", ${JSON.stringify(product.sku)}, {
        format: "CODE128",
        displayValue: false,
        lineColor: "#000000",
        width: ${preset.barcodeWidth},
        height: ${preset.barcodeHeight},
        margin: ${preset.barcodeMargin}
      });`);
    });
  });

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>
          :root { color-scheme: light; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: ${preset.pagePadding};
            font-family: Arial, sans-serif;
            background: #ffffff;
            color: #111827;
          }
          .grid {
            display: grid;
            grid-template-columns: ${preset.gridTemplate};
            gap: ${preset.gap};
            align-items: start;
          }
          .barcode-card {
            width: ${preset.cardWidth};
            min-height: ${preset.cardMinHeight};
            padding: ${preset.cardPadding};
            border: 1px solid #d1d5db;
            border-radius: ${preset.borderRadius};
            background: #ffffff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2mm;
            page-break-inside: avoid;
            overflow: hidden;
          }
          .barcode-card h2 {
            width: 100%;
            margin: 0;
            text-align: center;
            font-size: ${preset.titleFontSize};
            line-height: ${preset.titleLineHeight};
            font-weight: 700;
            word-break: break-word;
          }
          .barcode-card svg {
            width: 100%;
            max-width: 100%;
            display: block;
          }
          .sku {
            font-size: ${preset.skuFontSize};
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #4b5563;
            text-align: center;
          }
          .price {
            font-size: ${preset.priceFontSize};
            font-weight: 700;
            color: #0f172a;
            text-align: center;
          }
          @media print {
            body { padding: ${preset.pagePadding}; }
          }
        </style>
      </head>
      <body>
        <section class="grid">
          ${cards.join("")}
        </section>
        <script>
          window.addEventListener("load", function () {
            ${scripts.join("\n")}
            setTimeout(function () {
              window.print();
              window.close();
            }, 300);
          });
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  return { ok: true as const };
}
