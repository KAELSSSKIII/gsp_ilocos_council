import { RentalCalendarPanel } from "@/modules/pos/components/RentalCalendarPanel";

export function RentalCalendarPage() {
  return (
    <div className="space-y-6 pb-24">
        <header className="flex flex-col gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-emerald-900">Rental Calendar</h1>
            <p className="text-sm text-emerald-800/80">
              Review availability, upcoming bookings, and customer reservations in one glance.
            </p>
          </div>
        </header>
        <RentalCalendarPanel className="shadow-lg" />
    </div>
  );
}


