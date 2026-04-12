import { format, parseISO } from "date-fns";
import { ReceiptData } from "@/modules/pos/types";
import { readLocalReceiptSettings } from "@/modules/pos/utils/receiptSettingsStorage";
import { readBusinessSettings } from "@/utils/businessSettings";
import { formatCurrency } from "@/utils/format";

interface Props {
  receiptData: ReceiptData;
}

const td: React.CSSProperties = {
  border: "1px solid #000",
  padding: "2px 4px",
  fontSize: 11,
};

function safeDate(val: string, fmt = "M-d-yy") {
  try {
    return format(parseISO(val), fmt);
  } catch {
    try {
      return format(new Date(val), fmt);
    } catch {
      return val;
    }
  }
}

export function BIRInvoiceTemplate({ receiptData }: Props) {
  const settings = readLocalReceiptSettings();
  const biz = readBusinessSettings();

  const isService =
    receiptData.invoiceType === "service" ||
    receiptData.items.some((item) => item.rentalDate != null);
  const invoiceLabel = isService ? "SERVICE INVOICE" : "SALES INVOICE";

  const orgName = biz.orgName || "Girl Scouts of the Philippines";
  const councilName = biz.councilName || "Ilocos Sur Girl Scout Council";
  const orgAddress =
    settings?.orgAddress ||
    "Plaza Burgos Ilocos Sur 2700, City of Vigan (Capital) Ilocos Sur Philippines";
  const orgTin = settings?.orgTin || "";
  const birAuthNo = settings?.birAuthNo || "";
  const birDateIssued = settings?.birAuthDateIssued || "";
  const birSeriesLabel = settings?.birSeriesLabel || "";
  const printerAccredNo = settings?.printerAccredNo || "";
  const printerAccredDate = settings?.printerAccredDate || "";
  const printerName = settings?.printerName || "";
  const printerTin = settings?.printerTin || "";

  const soldTo = receiptData.soldTo ?? receiptData.memberName ?? "";
  const emptyRows = Math.max(0, 6 - receiptData.items.length);

  return (
    <div
      style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: 11,
        color: "#000",
        background: "#fff",
        maxWidth: 500,
        margin: "0 auto",
        padding: "12px 16px",
      }}
    >
      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <p style={{ fontWeight: "bold", fontSize: 13, textTransform: "uppercase", margin: 0 }}>
          {orgName}
        </p>
        <p style={{ fontWeight: "600", fontSize: 11, textTransform: "uppercase", margin: 0 }}>
          {councilName}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 10 }}>{orgAddress}</p>
        {orgTin && (
          <p style={{ margin: "1px 0 0", fontSize: 10 }}>Non Vat Reg. TIN: {orgTin}</p>
        )}
      </div>

      {/* ── Invoice type title ── */}
      <div style={{ textAlign: "center", margin: "8px 0" }}>
        <p style={{ fontWeight: "bold", fontSize: 13, textDecoration: "underline", margin: 0 }}>
          {invoiceLabel}
        </p>
        <p style={{ fontWeight: "600", fontSize: 11, margin: 0 }}>(EXEMPT)</p>
      </div>

      {/* ── Void banner ── */}
      {receiptData.voidedAt && (
        <div
          style={{
            border: "2px solid #dc2626",
            background: "#fef2f2",
            color: "#dc2626",
            textAlign: "center",
            padding: "4px 8px",
            fontWeight: "bold",
            marginBottom: 8,
            fontSize: 12,
          }}
        >
          VOIDED — {format(new Date(receiptData.voidedAt), "MMM d, yyyy")}
          {receiptData.voidReason ? ` — ${receiptData.voidReason}` : ""}
        </div>
      )}

      {/* ── Customer fields ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6, fontSize: 11 }}>
        <tbody>
          <tr>
            <td style={{ paddingRight: 4, whiteSpace: "nowrap", width: 72 }}>Sold to:</td>
            <td style={{ borderBottom: "1px solid #000", width: "50%" }}>{soldTo}</td>
            <td style={{ paddingLeft: 8, paddingRight: 4, whiteSpace: "nowrap" }}>Date</td>
            <td style={{ borderBottom: "1px solid #000" }}>{safeDate(receiptData.createdAt)}</td>
          </tr>
          <tr>
            <td style={{ paddingRight: 4, whiteSpace: "nowrap" }}>TIN:</td>
            <td style={{ borderBottom: "1px solid #000" }}>{receiptData.customerTin ?? ""}</td>
            <td style={{ paddingLeft: 8, paddingRight: 4, whiteSpace: "nowrap" }}>Term</td>
            <td style={{ borderBottom: "1px solid #000" }}>{receiptData.term ?? ""}</td>
          </tr>
          <tr>
            <td style={{ paddingRight: 4, whiteSpace: "nowrap" }}>Address:</td>
            <td colSpan={3} style={{ borderBottom: "1px solid #000" }}>
              {receiptData.customerAddress ?? ""}
            </td>
          </tr>
          <tr>
            <td style={{ paddingRight: 4, whiteSpace: "nowrap" }}>Business Style:</td>
            <td colSpan={3} style={{ borderBottom: "1px solid #000" }}>
              {receiptData.businessStyle ?? ""}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Line items ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ ...td, textAlign: "center", width: 48 }}>Quantity</th>
            <th style={{ ...td, textAlign: "center", width: 32 }}>Unit</th>
            <th style={{ ...td, textAlign: "left" }}>Articles</th>
            <th style={{ ...td, textAlign: "right", width: 68 }}>Unit Price</th>
            <th style={{ ...td, textAlign: "right", width: 72 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {receiptData.items.map((item) => (
            <tr key={`${item.id}-${item.sku ?? item.name}`}>
              <td style={{ ...td, textAlign: "center" }}>{item.quantity}</td>
              <td style={{ ...td, textAlign: "center" }}>pc</td>
              <td style={{ ...td }}>
                {item.name}
                {item.sku ? (
                  <span style={{ fontSize: 9, color: "#555", display: "block" }}>
                    SKU: {item.sku}
                  </span>
                ) : null}
                {item.rentalDate ? (
                  <span style={{ fontSize: 9, color: "#166534", display: "block" }}>
                    Booking: {safeDate(item.rentalDate, "PP")}
                  </span>
                ) : null}
              </td>
              <td style={{ ...td, textAlign: "right" }}>{formatCurrency(item.price)}</td>
              <td style={{ ...td, textAlign: "right" }}>{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
          {/* Blank filler rows to match physical invoice look */}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <tr key={`empty-${i}`}>
              <td style={{ ...td, height: 18 }}>&nbsp;</td>
              <td style={{ ...td }}>&nbsp;</td>
              <td style={{ ...td }}>&nbsp;</td>
              <td style={{ ...td }}>&nbsp;</td>
              <td style={{ ...td }}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ ...td, textAlign: "right" }}>
              Total Sales
            </td>
            <td colSpan={2} style={{ ...td, textAlign: "right" }}>
              {formatCurrency(receiptData.subtotal)}
            </td>
          </tr>
          <tr>
            <td colSpan={3} style={{ ...td, textAlign: "right" }}>
              Less: Discount:
            </td>
            <td colSpan={2} style={{ ...td, textAlign: "right" }}>
              {receiptData.discount > 0 ? formatCurrency(receiptData.discount) : ""}
            </td>
          </tr>
          <tr>
            <td
              colSpan={3}
              style={{ ...td, textAlign: "right", fontWeight: "bold", fontSize: 12 }}
            >
              TOTAL AMOUNT DUE
            </td>
            <td
              colSpan={2}
              style={{ ...td, textAlign: "right", fontWeight: "bold", fontSize: 12 }}
            >
              {formatCurrency(receiptData.balanceDue != null ? receiptData.depositAmount ?? receiptData.total : receiptData.total)}
            </td>
          </tr>
          {receiptData.cashTendered != null && (
            <>
              <tr>
                <td colSpan={3} style={{ ...td, textAlign: "right" }}>
                  Cash Tendered
                </td>
                <td colSpan={2} style={{ ...td, textAlign: "right" }}>
                  {formatCurrency(receiptData.cashTendered)}
                </td>
              </tr>
              <tr>
                <td colSpan={3} style={{ ...td, textAlign: "right" }}>
                  Change
                </td>
                <td colSpan={2} style={{ ...td, textAlign: "right" }}>
                  {formatCurrency(receiptData.change ?? 0)}
                </td>
              </tr>
            </>
          )}
          {receiptData.balanceDue != null && receiptData.balanceDue > 0 && (
            <tr>
              <td
                colSpan={3}
                style={{ ...td, textAlign: "right", color: "#b45309", fontWeight: "bold" }}
              >
                Balance Due
              </td>
              <td
                colSpan={2}
                style={{ ...td, textAlign: "right", color: "#b45309", fontWeight: "bold" }}
              >
                {formatCurrency(receiptData.balanceDue)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>

      {/* ── Signature + Invoice number ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 16 }}>
        <div>
          <p style={{ fontSize: 11, fontStyle: "italic", margin: 0 }}>Girl Scout of the Philippines</p>
          <div style={{ marginTop: 20, marginBottom: 2 }}>
            <span style={{ fontSize: 11 }}>By: </span>
            <span style={{ fontSize: 10 }}>{receiptData.cashierName ?? ""}</span>
          </div>
          <div style={{ borderTop: "1px solid #000", width: 200, marginBottom: 2 }} />
          <p style={{ fontSize: 10, textAlign: "center", width: 200, margin: 0 }}>
            Cashier / Authorized Representative
          </p>
        </div>
        {typeof receiptData.receiptNumber === "number" && (
          <p style={{ fontSize: 32, fontWeight: "bold", color: "#cc0000", margin: 0 }}>
            {receiptData.receiptNumber}
          </p>
        )}
      </div>

      {/* ── BIR footer ── */}
      {(birSeriesLabel || birAuthNo || printerAccredNo || printerName) && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 6,
            borderTop: "1px dashed #999",
            fontSize: 9,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              {birSeriesLabel && <p style={{ margin: 0 }}>{birSeriesLabel}</p>}
              {birAuthNo && <p style={{ margin: 0 }}>BIR Auth. No. {birAuthNo}</p>}
              {birDateIssued && <p style={{ margin: 0 }}>Date Issued: {birDateIssued}</p>}
              {printerName && <p style={{ margin: 0 }}>{printerName}</p>}
              {printerTin && <p style={{ margin: 0 }}>TIN: {printerTin}</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              {printerAccredNo && (
                <p style={{ margin: 0 }}>Printer's Accreditation No. {printerAccredNo}</p>
              )}
              {printerAccredDate && <p style={{ margin: 0 }}>Date Issued: {printerAccredDate}</p>}
            </div>
          </div>
          <p style={{ textAlign: "center", fontWeight: "bold", marginTop: 6, fontSize: 10 }}>
            THIS DOCUMENT IS NOT VALID FOR CLAIMING INPUT TAX
          </p>
        </div>
      )}
    </div>
  );
}
