import { format, parseISO } from "date-fns";
import { ReceiptData } from "@/modules/pos/types";
import { readLocalReceiptSettings } from "@/modules/pos/utils/receiptSettingsStorage";
import { readBusinessSettings } from "@/utils/businessSettings";
import { formatCurrency } from "@/utils/format";

interface Props {
  receiptData: ReceiptData;
}

function safeDate(val: string, fmt = "MM/dd/yyyy") {
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

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 4,
  marginBottom: 1,
};

const rowLabel: React.CSSProperties = {
  flexShrink: 0,
  whiteSpace: "nowrap",
};

const rowValue: React.CSSProperties = {
  flexShrink: 0,
  whiteSpace: "nowrap",
  textAlign: "right",
};

const divider58 = "--------------------------------";
const dividerDouble = "================================";

export function ThermalReceiptTemplate({ receiptData }: Props) {
  const settings = readLocalReceiptSettings();
  const biz = readBusinessSettings();

  const orgName = biz.orgName || "Girl Scouts of the Philippines";
  const councilName = biz.councilName || "Ilocos Sur Council";
  const orgAddress =
    settings?.orgAddress ||
    "Plaza Burgos, City of Vigan, Ilocos Sur, Philippines";
  const orgTin = settings?.orgTin || "";
  const birAuthNo = settings?.birAuthNo || "";
  const birDateIssued = settings?.birAuthDateIssued || "";
  const birSeriesLabel = settings?.birSeriesLabel || "";
  const printerAccredNo = settings?.printerAccredNo || "";
  const printerAccredDate = settings?.printerAccredDate || "";
  const printerName = settings?.printerName || "";
  const printerTin = settings?.printerTin || "";
  const footerText = settings?.footerText || "";

  const isService =
    receiptData.invoiceType === "service" ||
    receiptData.items.some((item) => item.rentalDate != null);

  const receiptTypeLabel =
    typeof receiptData.receiptNumber === "number"
      ? "OFFICIAL RECEIPT"
      : isService
      ? "SERVICE INVOICE"
      : "SALES INVOICE";

  const hasBirInfo =
    birSeriesLabel || birAuthNo || printerAccredNo || printerName;

  return (
    <div
      style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: 9,
        color: "#000",
        background: "#fff",
        width: "52mm",
        margin: "0 auto",
        padding: "4px 0",
        lineHeight: 1.4,
      }}
    >
      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <div
          style={{
            fontWeight: "bold",
            fontSize: 10,
            textTransform: "uppercase",
            lineHeight: 1.3,
          }}
        >
          {orgName}
        </div>
        <div style={{ fontWeight: "600", fontSize: 9, textTransform: "uppercase" }}>
          {councilName}
        </div>
        <div style={{ fontSize: 8, marginTop: 1 }}>{orgAddress}</div>
        {orgTin && (
          <div style={{ fontSize: 8, marginTop: 1 }}>Non-VAT Reg. TIN: {orgTin}</div>
        )}
      </div>

      {/* ── Double divider ── */}
      <div
        style={{
          textAlign: "center",
          fontSize: 8,
          overflow: "hidden",
          whiteSpace: "nowrap",
          margin: "3px 0",
        }}
      >
        {dividerDouble}
      </div>

      {/* ── Receipt type ── */}
      <div
        style={{
          textAlign: "center",
          fontWeight: "bold",
          fontSize: 9,
          marginBottom: 2,
        }}
      >
        {receiptTypeLabel}
      </div>

      {/* ── Void banner ── */}
      {receiptData.voidedAt && (
        <div
          style={{
            border: "2px solid #dc2626",
            background: "#fef2f2",
            color: "#dc2626",
            textAlign: "center",
            padding: "2px 4px",
            fontWeight: "bold",
            margin: "4px 0",
            fontSize: 9,
          }}
        >
          <div>*** VOIDED ***</div>
          <div style={{ fontWeight: "normal", fontSize: 8 }}>
            {format(new Date(receiptData.voidedAt), "MM/dd/yyyy hh:mm a")}
          </div>
          {receiptData.voidReason && (
            <div style={{ fontWeight: "normal", fontSize: 8 }}>
              {receiptData.voidReason}
            </div>
          )}
        </div>
      )}

      {/* ── Meta rows ── */}
      <div style={{ marginBottom: 2 }}>
        <div style={row}>
          <span style={rowLabel}>Date:</span>
          <span style={rowValue}>{safeDate(receiptData.createdAt, "MM/dd/yyyy hh:mm a")}</span>
        </div>
        {typeof receiptData.receiptNumber === "number" && (
          <div style={row}>
            <span style={rowLabel}>Receipt #:</span>
            <span style={{ ...rowValue, fontWeight: "bold" }}>
              {receiptData.receiptNumber}
            </span>
          </div>
        )}
        {receiptData.saleNumber && (
          <div style={row}>
            <span style={rowLabel}>Sale #:</span>
            <span style={rowValue}>{receiptData.saleNumber}</span>
          </div>
        )}
        {receiptData.cashierName && (
          <div style={row}>
            <span style={rowLabel}>Cashier:</span>
            <span style={rowValue}>{receiptData.cashierName}</span>
          </div>
        )}
        {receiptData.memberName && (
          <div style={row}>
            <span style={rowLabel}>Member:</span>
            <span style={rowValue}>
              {receiptData.memberName}
              {receiptData.memberDiscountRate
                ? ` (${receiptData.memberDiscountRate * 100}% off)`
                : ""}
            </span>
          </div>
        )}
        {receiptData.soldTo && !receiptData.memberName && (
          <div style={row}>
            <span style={rowLabel}>Sold to:</span>
            <span style={rowValue}>{receiptData.soldTo}</span>
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div
        style={{
          textAlign: "center",
          fontSize: 8,
          overflow: "hidden",
          whiteSpace: "nowrap",
          margin: "3px 0",
        }}
      >
        {divider58}
      </div>

      {/* ── Items ── */}
      <div style={{ marginBottom: 2 }}>
        {receiptData.items.map((item, idx) => (
          <div key={`${item.id}-${idx}`} style={{ marginBottom: 2 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 4,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  flexShrink: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "65%",
                }}
              >
                {item.name}
              </div>
              <div style={{ flexShrink: 0, whiteSpace: "nowrap", textAlign: "right" }}>
                {item.quantity}x {formatCurrency(item.subtotal)}
              </div>
            </div>
            {item.sku && (
              <div style={{ fontSize: 8, color: "#555", paddingLeft: 8 }}>
                SKU: {item.sku}
              </div>
            )}
            {item.rentalDate && (
              <div style={{ fontSize: 8, color: "#166534", fontStyle: "italic", paddingLeft: 8 }}>
                Booking: {safeDate(item.rentalDate, "MMM d, yyyy")}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Divider ── */}
      <div
        style={{
          textAlign: "center",
          fontSize: 8,
          overflow: "hidden",
          whiteSpace: "nowrap",
          margin: "3px 0",
        }}
      >
        {divider58}
      </div>

      {/* ── Totals ── */}
      <div style={{ marginBottom: 2 }}>
        <div style={row}>
          <span style={rowLabel}>Subtotal:</span>
          <span style={rowValue}>{formatCurrency(receiptData.subtotal)}</span>
        </div>
        {receiptData.discount > 0 && (
          <div style={row}>
            <span style={rowLabel}>Discount:</span>
            <span style={rowValue}>-{formatCurrency(receiptData.discount)}</span>
          </div>
        )}
        {receiptData.tax > 0 && (
          <div style={row}>
            <span style={rowLabel}>Tax:</span>
            <span style={rowValue}>{formatCurrency(receiptData.tax)}</span>
          </div>
        )}
        <div
          style={{
            ...row,
            fontWeight: "bold",
            fontSize: 10,
            borderTop: "1px solid #000",
            paddingTop: 2,
            marginTop: 2,
          }}
        >
          <span style={rowLabel}>TOTAL:</span>
          <span style={rowValue}>
            {formatCurrency(
              receiptData.balanceDue != null
                ? receiptData.depositAmount ?? receiptData.total
                : receiptData.total
            )}
          </span>
        </div>

        {/* Deposit / balance due */}
        {receiptData.depositAmount != null && receiptData.balanceDue != null && receiptData.balanceDue > 0 && (
          <>
            <div style={row}>
              <span style={rowLabel}>Deposit Paid:</span>
              <span style={rowValue}>{formatCurrency(receiptData.depositAmount)}</span>
            </div>
            <div
              style={{
                ...row,
                color: "#b45309",
                fontWeight: "bold",
              }}
            >
              <span style={rowLabel}>Balance Due:</span>
              <span style={rowValue}>{formatCurrency(receiptData.balanceDue)}</span>
            </div>
          </>
        )}

        {/* Cash */}
        {receiptData.cashTendered != null && (
          <>
            <div style={{ ...row, marginTop: 2 }}>
              <span style={rowLabel}>Cash Tendered:</span>
              <span style={rowValue}>{formatCurrency(receiptData.cashTendered)}</span>
            </div>
            <div style={row}>
              <span style={rowLabel}>Change:</span>
              <span style={rowValue}>{formatCurrency(receiptData.change ?? 0)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Divider ── */}
      <div
        style={{
          textAlign: "center",
          fontSize: 8,
          overflow: "hidden",
          whiteSpace: "nowrap",
          margin: "3px 0",
        }}
      >
        {divider58}
      </div>

      {/* ── Payment method ── */}
      <div style={{ ...row, marginBottom: 4 }}>
        <span style={rowLabel}>Payment:</span>
        <span style={{ ...rowValue, textTransform: "capitalize" }}>
          {receiptData.paymentMethod}
        </span>
      </div>

      {/* ── Cashier signature line ── */}
      <div style={{ marginTop: 8, marginBottom: 4 }}>
        <div
          style={{
            borderTop: "1px solid #000",
            width: "60%",
            margin: "0 auto",
            marginBottom: 2,
          }}
        />
        <div style={{ textAlign: "center", fontSize: 8 }}>
          {receiptData.cashierName || "Cashier"}
        </div>
        <div style={{ textAlign: "center", fontSize: 7, color: "#555" }}>
          Cashier / Authorized Representative
        </div>
      </div>

      {/* ── Double divider ── */}
      <div
        style={{
          textAlign: "center",
          fontSize: 8,
          overflow: "hidden",
          whiteSpace: "nowrap",
          margin: "3px 0",
        }}
      >
        {dividerDouble}
      </div>

      {/* ── Footer text ── */}
      {footerText && (
        <div
          style={{
            textAlign: "center",
            fontSize: 8,
            fontStyle: "italic",
            margin: "4px 0",
            whiteSpace: "pre-wrap",
          }}
        >
          {footerText}
        </div>
      )}

      {/* ── BIR info block ── */}
      {hasBirInfo && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 4,
            borderTop: "1px dashed #999",
            fontSize: 7,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
            <div>
              {birSeriesLabel && <div>{birSeriesLabel}</div>}
              {birAuthNo && <div>BIR Auth. No. {birAuthNo}</div>}
              {birDateIssued && <div>Date Issued: {birDateIssued}</div>}
              {printerName && <div>{printerName}</div>}
              {printerTin && <div>TIN: {printerTin}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              {printerAccredNo && <div>Accred. No. {printerAccredNo}</div>}
              {printerAccredDate && <div>Date: {printerAccredDate}</div>}
            </div>
          </div>
          <div
            style={{
              textAlign: "center",
              fontWeight: "bold",
              marginTop: 4,
              fontSize: 7,
            }}
          >
            NOT VALID FOR INPUT TAX CLAIM
          </div>
        </div>
      )}
    </div>
  );
}
