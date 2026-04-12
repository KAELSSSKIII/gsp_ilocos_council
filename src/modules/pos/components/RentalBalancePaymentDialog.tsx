import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useSessionStore, selectProfile } from "@/store/sessionStore";
import { formatCurrency } from "@/utils/format";
import { writeLocalReceipt } from "@/modules/pos/utils/receiptStorage";
import type { RentalBookingSummary } from "@/modules/pos/hooks/useRentalAvailability";
import type { ReceiptData } from "@/modules/pos/types";

interface RentalBalancePaymentDialogProps {
  booking: RentalBookingSummary;
  spaceName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

type BalancePaymentResponse = {
  sale: {
    id: string;
    sale_number?: string | null;
    created_at?: string | null;
  };
  booking: unknown;
};

export function RentalBalancePaymentDialog({
  booking,
  spaceName,
  open,
  onClose,
  onSuccess,
}: RentalBalancePaymentDialogProps) {
  const profile = useSessionStore(selectProfile);

  // postgres.js returns NUMERIC columns as strings — force Number() to prevent string concatenation bugs
  const totalAmount = Number(booking.total_amount ?? 0);
  const paidAmount = Number(booking.initial_payment ?? 0);
  const balanceDue = totalAmount - paidAmount;

  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "online">("cash");
  const [amountStr, setAmountStr] = useState<string>(balanceDue.toFixed(2));
  const [isProcessing, setIsProcessing] = useState(false);

  const amountNum = Math.min(Math.max(parseFloat(amountStr) || 0, 0), balanceDue);
  const isFullPayment = amountNum >= balanceDue;

  const handleConfirm = async () => {
    if (amountNum <= 0) {
      toast.error("Enter a payment amount greater than zero.");
      return;
    }
    if (!profile?.id) {
      toast.error("Session error. Please log in again.");
      return;
    }

    setIsProcessing(true);
    try {
      // Single atomic request — creates the sale and updates the booking in one DB transaction.
      // This prevents orphaned sale records if the booking update were to fail separately.
      const { sale: balanceSale } = await api.post<BalancePaymentResponse>(
        `/rental/bookings/${booking.id}/pay-balance`,
        {
          amount: amountNum,
          payment_method: paymentMethod,
          cashier_id: profile.id,
          branch: profile.branch ?? null,
          space_name: spaceName,
          booking_date: booking.booking_date,
        }
      );

      // Persist a lightweight receipt for reprint capability
      const receiptSnapshot: ReceiptData = {
        saleId: balanceSale.id,
        saleNumber: balanceSale.sale_number,
        createdAt: balanceSale.created_at ?? new Date().toISOString(),
        paymentMethod,
        branch: profile.branch ?? null,
        subtotal: amountNum,
        discount: 0,
        tax: 0,
        total: amountNum,
        depositAmount: null,
        balanceDue: null,
        items: [
          {
            id: booking.rental_space_id,
            name: `${spaceName} — Balance Payment`,
            quantity: 1,
            price: amountNum,
            subtotal: amountNum,
            rentalDate: booking.booking_date,
          },
        ],
        cashierId: profile.id,
        cashierName: profile.full_name ?? profile.id,
      };
      writeLocalReceipt(receiptSnapshot);

      toast.success(
        isFullPayment
          ? `Balance of ${formatCurrency(balanceDue)} received. Booking is now fully paid.`
          : `Partial payment of ${formatCurrency(amountNum)} recorded. Remaining: ${formatCurrency(balanceDue - amountNum)}.`
      );

      await onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to record payment.";
      console.error(err);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isProcessing) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay Rental Balance</DialogTitle>
          <DialogDescription>
            Record the outstanding balance payment for this booking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
            <p>
              <span className="font-semibold">Space:</span> {spaceName}
            </p>
            <p>
              <span className="font-semibold">Booking date:</span> {booking.booking_date}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded border px-3 py-2 text-center">
              <p className="text-muted-foreground">Total</p>
              <p className="font-semibold">{formatCurrency(totalAmount)}</p>
            </div>
            <div className="rounded border px-3 py-2 text-center">
              <p className="text-muted-foreground">Paid</p>
              <p className="font-semibold text-emerald-700">{formatCurrency(paidAmount)}</p>
            </div>
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-center">
              <p className="text-amber-700">Balance</p>
              <p className="font-semibold text-amber-800">{formatCurrency(balanceDue)}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="balance-payment-method">Payment Method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
            >
              <SelectTrigger id="balance-payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="balance-amount">Amount to Collect</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">₱</span>
              <Input
                id="balance-amount"
                type="number"
                min={0.01}
                max={balanceDue}
                step={0.01}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Defaults to the full balance. Enter less for a partial payment.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing || amountNum <= 0}>
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </span>
            ) : (
              `Record ₱${amountNum.toFixed(2)} Payment`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
