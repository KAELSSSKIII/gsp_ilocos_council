import type { CSSProperties } from "react";
import { format } from "date-fns";

import type { ReceiptData } from "@/modules/pos/types";
import {
  getReceiptFieldPositions,
  getReceiptItemsLayout,
  readLocalReceiptSettings,
} from "@/modules/pos/utils/receiptSettingsStorage";

interface Props {
  receiptData: ReceiptData;
}

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 148;

const fieldBase: CSSProperties = {
  position: "absolute",
  color: "#111827",
  fontFamily: "'Courier New', Courier, monospace",
  lineHeight: 1.1,
};

function safeDate(value?: string | null) {
  if (!value) return "";
  try {
    return format(new Date(value), "M-d-yy");
  } catch {
    return value;
  }
}

function formatAmount(value?: number | null) {
  return Number(value ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAmountWrapped(value?: number | null) {
  return value && value > 0 ? `(${formatAmount(value)})` : "";
}

function numberToWords(value: number) {
  const ones = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  const underThousand = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) {
      const remainder = n % 10;
      return remainder ? `${tens[Math.floor(n / 10)]}-${ones[remainder]}` : tens[Math.floor(n / 10)];
    }
    const remainder = n % 100;
    return remainder
      ? `${ones[Math.floor(n / 100)]} hundred ${underThousand(remainder)}`
      : `${ones[Math.floor(n / 100)]} hundred`;
  };

  if (value === 0) return "Zero pesos only";

  const whole = Math.floor(value);
  const cents = Math.round((value - whole) * 100);
  const parts: string[] = [];

  const millions = Math.floor(whole / 1_000_000);
  const thousands = Math.floor((whole % 1_000_000) / 1_000);
  const remainder = whole % 1_000;

  if (millions) parts.push(`${underThousand(millions)} million`);
  if (thousands) parts.push(`${underThousand(thousands)} thousand`);
  if (remainder) parts.push(underThousand(remainder));

  const pesoWords = `${parts.join(" ")} pesos`;
  if (!cents) return `${pesoWords} only`.replace(/^./, (char) => char.toUpperCase());

  return `${pesoWords} and ${cents}/100 only`.replace(/^./, (char) => char.toUpperCase());
}

function printableAmount(receiptData: ReceiptData) {
  return receiptData.balanceDue != null ? receiptData.depositAmount ?? receiptData.total : receiptData.total;
}

export function PreprintedOfficialReceipt({ receiptData }: Props) {
  const settings = readLocalReceiptSettings();
  const fields = getReceiptFieldPositions(settings);
  const itemsLayout = getReceiptItemsLayout(settings);
  const soldTo = receiptData.soldTo ?? receiptData.memberName ?? "";
  const amountDue = printableAmount(receiptData);
  const amountWords = numberToWords(amountDue);
  const topItems = receiptData.items.slice(0, itemsLayout.maxRows);

  return (
    <div
      className="relative bg-white text-black"
      style={{
        width: `${PAGE_WIDTH_MM}mm`,
        height: `${PAGE_HEIGHT_MM}mm`,
      }}
    >
      {topItems.map((item, index) => (
        <div
          key={`${item.id}-${index}`}
          style={{
            ...fieldBase,
            left: `${itemsLayout.descriptionX}mm`,
            top: `${itemsLayout.startY + index * itemsLayout.rowGap}mm`,
            width: `${itemsLayout.descriptionWidth}mm`,
            fontSize: `${itemsLayout.fontSize}px`,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.name}
        </div>
      ))}

      {topItems.map((item, index) => (
        <div
          key={`${item.id}-amount-${index}`}
          style={{
            ...fieldBase,
            left: `${itemsLayout.amountX}mm`,
            top: `${itemsLayout.startY + index * itemsLayout.rowGap}mm`,
            width: `${itemsLayout.amountWidth}mm`,
            fontSize: `${itemsLayout.fontSize}px`,
            textAlign: "right",
            whiteSpace: "nowrap",
          }}
        >
          {formatAmount(item.subtotal)}
        </div>
      ))}

      <div style={{ ...fieldBase, left: `${fields.totalSales.x}mm`, top: `${fields.totalSales.y}mm`, width: `${fields.totalSales.width}mm`, fontSize: `${fields.totalSales.fontSize}px`, textAlign: "right" }}>
        {formatAmount(receiptData.subtotal)}
      </div>
      <div style={{ ...fieldBase, left: `${fields.totalDiscount.x}mm`, top: `${fields.totalDiscount.y}mm`, width: `${fields.totalDiscount.width}mm`, fontSize: `${fields.totalDiscount.fontSize}px`, textAlign: "right" }}>
        {formatAmountWrapped(receiptData.discount)}
      </div>
      <div style={{ ...fieldBase, left: `${fields.totalAmountDue.x}mm`, top: `${fields.totalAmountDue.y}mm`, width: `${fields.totalAmountDue.width}mm`, fontSize: `${fields.totalAmountDue.fontSize}px`, textAlign: "right", fontWeight: 700 }}>
        {formatAmount(amountDue)}
      </div>

      <div style={{ ...fieldBase, left: `${fields.soldTo.x}mm`, top: `${fields.soldTo.y}mm`, width: `${fields.soldTo.width}mm`, fontSize: `${fields.soldTo.fontSize}px`, whiteSpace: "nowrap", overflow: "hidden" }}>
        {soldTo}
      </div>
      <div style={{ ...fieldBase, left: `${fields.date.x}mm`, top: `${fields.date.y}mm`, width: `${fields.date.width}mm`, fontSize: `${fields.date.fontSize}px`, whiteSpace: "nowrap" }}>
        {safeDate(receiptData.createdAt)}
      </div>

      <div style={{ ...fieldBase, left: `${fields.tin.x}mm`, top: `${fields.tin.y}mm`, width: `${fields.tin.width}mm`, fontSize: `${fields.tin.fontSize}px`, whiteSpace: "nowrap" }}>
        {receiptData.customerTin ?? ""}
      </div>
      <div style={{ ...fieldBase, left: `${fields.term.x}mm`, top: `${fields.term.y}mm`, width: `${fields.term.width}mm`, fontSize: `${fields.term.fontSize}px`, whiteSpace: "nowrap" }}>
        {receiptData.term ?? receiptData.paymentMethod}
      </div>

      <div
        style={{
          ...fieldBase,
          left: `${fields.address.x}mm`,
          top: `${fields.address.y}mm`,
          width: `${fields.address.width}mm`,
          fontSize: `${fields.address.fontSize}px`,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {receiptData.customerAddress ?? ""}
      </div>

      <div
        style={{
          ...fieldBase,
          left: `${fields.businessStyle.x}mm`,
          top: `${fields.businessStyle.y}mm`,
          width: `${fields.businessStyle.width}mm`,
          fontSize: `${fields.businessStyle.fontSize}px`,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {receiptData.businessStyle ?? ""}
      </div>

      <div
        style={{
          ...fieldBase,
          left: `${fields.amountWords.x}mm`,
          top: `${fields.amountWords.y}mm`,
          width: `${fields.amountWords.width}mm`,
          fontSize: `${fields.amountWords.fontSize}px`,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {amountWords}
      </div>

      <div
        style={{
          ...fieldBase,
          left: `${fields.paymentMethod.x}mm`,
          top: `${fields.paymentMethod.y}mm`,
          width: `${fields.paymentMethod.width}mm`,
          fontSize: `${fields.paymentMethod.fontSize}px`,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {receiptData.paymentMethod}
      </div>

      <div style={{ ...fieldBase, left: `${fields.paymentAmount.x}mm`, top: `${fields.paymentAmount.y}mm`, width: `${fields.paymentAmount.width}mm`, fontSize: `${fields.paymentAmount.fontSize}px`, whiteSpace: "nowrap" }}>
        {formatAmount(amountDue)}
      </div>

      <div
        style={{
          ...fieldBase,
          left: `${fields.cashierName.x}mm`,
          top: `${fields.cashierName.y}mm`,
          width: `${fields.cashierName.width}mm`,
          fontSize: `${fields.cashierName.fontSize}px`,
          textAlign: "center",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {receiptData.cashierName ?? ""}
      </div>
    </div>
  );
}
