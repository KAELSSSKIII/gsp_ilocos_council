import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Printer, Download, Mail, Check, Loader2, ArrowLeft } from "lucide-react";
import { usePOSStore } from "@/store/posStore";
import { ReceiptData } from "@/modules/pos/types";
import { DEFAULT_RECEIPT_LAYOUT, readLocalReceiptSettings } from "@/modules/pos/utils/receiptSettingsStorage";
import { BIRInvoiceTemplate } from "@/modules/pos/components/BIRInvoiceTemplate";
import { PreprintedOfficialReceipt } from "@/modules/pos/components/PreprintedOfficialReceipt";
import { ThermalReceiptTemplate } from "@/modules/pos/components/ThermalReceiptTemplate";

type ReceiptLocationState = {
  receiptData?: ReceiptData | null;
};

export function ReceiptPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const clearCart = usePOSStore((state) => state.clearCart);
  const clearMember = usePOSStore((state) => state.clearMember);

  const receiptData = (location.state as ReceiptLocationState | null)?.receiptData ?? null;

  const receiptRef = useRef<HTMLDivElement>(null);
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);
  const [isSendingEmail] = useState(false);
  const [hasPrinted, setHasPrinted] = useState(false);
  const prefs = readLocalReceiptSettings();
  const receiptLayout = prefs?.receiptLayout ?? DEFAULT_RECEIPT_LAYOUT;
  const paperWidth = prefs?.paperWidth ?? "a4";

  useEffect(() => {
    if (!receiptData) {
      navigate("/pos", { replace: true });
    }
  }, [receiptData, navigate]);


  const handlePrintReceipt = useCallback(() => {
    if (!receiptRef.current || !receiptData) {
      toast.error("Receipt is not ready to print yet.");
      return;
    }

    const thermalStyle = paperWidth === "a4" ? "" : paperWidth === "58mm" ? `
      @page { margin: 0; size: 58mm; }
      body { width: 58mm; padding: 2px 3mm; font-size: 9px; margin: 0; }
      .receipt-wrapper { max-width: 52mm; margin: 0; border: none; padding: 0; }
    ` : `
      @page { margin: 0; size: 80mm; }
      body { width: 80mm; padding: 4px 6px; font-size: 11px; }
      .receipt-wrapper { max-width: 100%; border: none; padding: 0; }
    `;
    const preprintedStyle = receiptLayout === "preprinted" ? `
      @page { margin: 0; size: 210mm 148mm; }
      body { margin: 0; padding: 0; background: #fff; }
      .receipt-wrapper { width: 210mm; height: 148mm; margin: 0; border: none; padding: 0; }
    ` : "";

    const html = `
      <html>
        <head>
          <title>Receipt ${receiptData.saleNumber ?? receiptData.saleId}</title>
          <style>
            :root { color-scheme: light; }
            body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 24px; background: #ffffff; }
            .receipt-wrapper { max-width: 520px; margin: 0 auto; border: 1px dashed #d4d4d8; padding: 20px; }
            .receipt-wrapper h2 { letter-spacing: 0.25em; text-transform: uppercase; font-size: 16px; text-align: center; margin-bottom: 4px; }
            .receipt-wrapper p { margin: 0; }
            .section-divider { border-top: 1px dashed #d4d4d8; margin: 16px 0; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; font-size: 12px; padding: 4px 0; }
            th:nth-child(2), td:nth-child(2) { text-align: center; }
            th:nth-child(3), td:nth-child(3) { text-align: right; }
            ${thermalStyle}
            ${preprintedStyle}
          </style>
        </head>
        <body>
          <div class="receipt-wrapper">${receiptRef.current.innerHTML}</div>
        </body>
      </html>
    `;

    // Use a hidden iframe so the browser doesn't need pop-up permission.
    // This also works for programmatic (auto-print) triggers.
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      toast.error("Could not prepare print frame.");
      return;
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for iframe content to load before printing
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Remove iframe after a short delay to allow the print dialog to open
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1000);
    };
  }, [prefs, receiptData, receiptLayout, paperWidth]);

  // Auto-print on mount if the user has enabled the setting
  useEffect(() => {
    if (!receiptData || hasPrinted) return;
    const prefs = readLocalReceiptSettings();
    if (prefs?.autoPrint) {
      setHasPrinted(true);
      const timer = setTimeout(handlePrintReceipt, 400);
      return () => clearTimeout(timer);
    }
  }, [receiptData, hasPrinted, handlePrintReceipt]);

  const handleDownloadReceipt = async () => {
    if (!receiptRef.current || !receiptData) {
      toast.error("Receipt is not ready to download yet.");
      return;
    }

    setIsDownloadingReceipt(true);
    try {
      const html2pdfModule = await import("html2pdf.js");
      const html2pdf = html2pdfModule.default ?? html2pdfModule;
      const filename = `receipt-${receiptData.saleNumber ?? receiptData.saleId}.pdf`;
      await html2pdf()
        .set({
          margin: receiptLayout === "preprinted" ? 0 : 8,
          filename,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: receiptLayout === "preprinted"
            ? { unit: "mm", format: [210, 148], orientation: "landscape" }
            : { unit: "mm", format: "a5", orientation: "portrait" },
        })
        .from(receiptRef.current)
        .save();
      toast.success("Receipt downloaded");
    } catch (error) {
      console.error(error);
      toast.error("Failed to download receipt.");
    } finally {
      setIsDownloadingReceipt(false);
    }
  };

  const handleEmailReceipt = async () => {
    if (!receiptData?.memberEmail) {
      toast.error("No email found for this member.");
      return;
    }
    toast.info("Email receipt feature is not currently available.");
  };

  const handleDone = () => {
    clearCart();
    clearMember();
    navigate("/pos");
  };

  if (!receiptData) return null;

  return (
    <div className="space-y-6 pb-24">
      <header className="sticky top-[64px] z-30 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Receipt</h1>
            <p className="text-sm text-muted-foreground">
              {receiptData.saleNumber ?? receiptData.saleId}
            </p>
          </div>
          <Button variant="ghost" onClick={() => navigate("/pos/checkout")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Checkout
          </Button>
        </div>
      </header>

      <div className="w-full px-6 sm:px-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <div
            ref={receiptRef}
            className={receiptLayout === "preprinted"
              ? "overflow-auto rounded-lg border border-muted-foreground/30 bg-white shadow-inner"
              : "overflow-hidden rounded-lg border border-muted-foreground/30 bg-white shadow-inner"}
          >
            {paperWidth === "58mm" ? (
              <ThermalReceiptTemplate receiptData={receiptData} />
            ) : receiptLayout === "preprinted" ? (
              <PreprintedOfficialReceipt receiptData={receiptData} />
            ) : (
              <BIRInvoiceTemplate receiptData={receiptData} />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handlePrintReceipt}>
                <Printer className="mr-2 h-4 w-4" />
                Print Receipt
              </Button>
              <Button variant="outline" onClick={handleDownloadReceipt} disabled={isDownloadingReceipt}>
                {isDownloadingReceipt ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparing…
                  </span>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </>
                )}
              </Button>
              {receiptData.memberEmail ? (
                <Button variant="outline" onClick={handleEmailReceipt} disabled={isSendingEmail}>
                  {isSendingEmail ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending…
                    </span>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Email Receipt
                    </>
                  )}
                </Button>
              ) : null}
            </div>
            <Button onClick={handleDone}>
              <Check className="mr-2 h-4 w-4" />
              Done — New Sale
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
