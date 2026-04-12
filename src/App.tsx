import { lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { BusinessSettingsBootstrap } from "./components/BusinessSettingsBootstrap";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { RouteGuard } from "./components/RouteGuard";
import { Toaster as Sonner } from "./components/ui/sonner";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { ROUTE_ACCESS } from "./lib/permissions";

const Accounting = lazy(() => import("./pages/Accounting"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Cart = lazy(() => import("./pages/Cart"));
const CashDisbursementJournal = lazy(() => import("./pages/CashDisbursementJournal"));
const CashReceiptsJournal = lazy(() => import("./pages/CashReceiptsJournal"));
const CheckVoucherPrint = lazy(() => import("./pages/CheckVoucherPrint"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DCCR = lazy(() => import("./pages/DCCR"));
const Employees = lazy(() => import("./pages/Employees"));
const IncomeStatement = lazy(() => import("./pages/IncomeStatement"));
const InventoryReport = lazy(() => import("./pages/InventoryReport"));
const JournalVoucher = lazy(() => import("./pages/JournalVoucher"));
const Login = lazy(() => import("./pages/Login"));
const Members = lazy(() => import("./pages/Members"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Payroll = lazy(() => import("./pages/Payroll"));
const PayrollSheet = lazy(() => import("./pages/PayrollSheet"));
const POS = lazy(() => import("./pages/POS"));
const Products = lazy(() => import("./pages/Products"));
const Receipt = lazy(() => import("./pages/Receipt"));
const Receipts = lazy(() => import("./pages/Receipts"));
const RentalCalendar = lazy(() => import("./pages/RentalCalendar"));
const SCRD = lazy(() => import("./pages/SCRD"));
const Settings = lazy(() => import("./pages/Settings"));
const Users = lazy(() => import("./pages/Users"));
const Vouchers = lazy(() => import("./pages/Vouchers"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-6 py-16">
      <div className="rounded-2xl border border-border/60 bg-card px-6 py-4 text-sm text-muted-foreground shadow-sm">
        Loading page...
      </div>
    </div>
  );
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BusinessSettingsBootstrap />
      <BrowserRouter>
        <ErrorBoundary>
        <Layout>
          <Routes>
            <Route
              path="/"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.dashboard} fallbackPath="/pos">
                    <Dashboard />
                  </RouteGuard>
                )
              }
            />
            <Route path="/login" element={withSuspense(<Login />)} />
            <Route
              path="/pos"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.pos}>
                    <POS />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/income-statement"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.incomeStatement}>
                    <IncomeStatement />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/rental-calendar"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.rentalCalendar}>
                    <RentalCalendar />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/pos/cart"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.cart}>
                    <Cart />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/pos/checkout"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.checkout}>
                    <Checkout />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/pos/receipt"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.receipt}>
                    <Receipt />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/pos/receipts"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.receipts}>
                    <Receipts />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/products"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.products}>
                    <Products />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/accounting"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.accounting}>
                    <Accounting />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/dccr"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.dccr}>
                    <DCCR />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/employees"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.employees}>
                    <Employees />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/payroll"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.payroll}>
                    <Payroll />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/vouchers"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.vouchers}>
                    <Vouchers />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/settings"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.settings}>
                    <Settings />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/members"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.members}>
                    <Members />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/scrd"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.scrd}>
                    <SCRD />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/inventory-report"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.inventoryReport}>
                    <InventoryReport />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/users"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.users}>
                    <Users />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/check-voucher-print"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.checkVoucherPrint}>
                    <CheckVoucherPrint />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/payroll-sheet"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.payrollSheet}>
                    <PayrollSheet />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/cash-disbursement-journal"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.cashDisbursementJournal}>
                    <CashDisbursementJournal />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/cash-receipts-journal"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.cashReceiptsJournal}>
                    <CashReceiptsJournal />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/journal-voucher"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.journalVoucher}>
                    <JournalVoucher />
                  </RouteGuard>
                )
              }
            />
            <Route
              path="/audit-log"
              element={
                withSuspense(
                  <RouteGuard allowedRoles={ROUTE_ACCESS.auditLogs}>
                    <AuditLog />
                  </RouteGuard>
                )
              }
            />
            <Route path="*" element={withSuspense(<NotFound />)} />
          </Routes>
        </Layout>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
