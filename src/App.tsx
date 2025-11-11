import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Products from "./pages/Products";
import Accounting from "./pages/Accounting";
import Employees from "./pages/Employees";
import Payroll from "./pages/Payroll";
import Vouchers from "./pages/Vouchers";
import InventoryReport from "./pages/InventoryReport";
import IncomeStatement from "./pages/IncomeStatement";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Cart from "./pages/Cart";
import RentalCalendar from "./pages/RentalCalendar";
import ReceiptSettings from "./pages/cashier/ReceiptSettings";
import Receipts from "./pages/Receipts";
import DCCR from "./pages/DCCR";
import { RouteGuard } from "./components/RouteGuard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route
              path="/"
              element={
                <RouteGuard allowedRoles={["admin", "accountant"]} fallbackPath="/pos">
                  <Dashboard />
                </RouteGuard>
              }
            />
            <Route path="/login" element={<Login />} />
            <Route
              path="/pos"
              element={
                <RouteGuard allowedRoles={["admin", "cashier"]}>
                  <POS />
                </RouteGuard>
              }
            />
        <Route
          path="/inventory-report"
          element={
            <RouteGuard allowedRoles={["admin", "cashier", "accountant", "inventory_clerk"]}>
              <InventoryReport />
            </RouteGuard>
          }
        />
        <Route
          path="/income-statement"
          element={
            <RouteGuard allowedRoles={["admin", "cashier", "accountant"]}>
              <IncomeStatement />
            </RouteGuard>
          }
        />
            <Route
              path="/rental-calendar"
              element={
                <RouteGuard allowedRoles={["admin", "cashier"]}>
                  <RentalCalendar />
                </RouteGuard>
              }
            />
            <Route
              path="/pos/cart"
              element={
                <RouteGuard allowedRoles={["admin", "cashier"]}>
                  <Cart />
                </RouteGuard>
              }
            />
            <Route
              path="/cashier/receipt-settings"
              element={
                <RouteGuard allowedRoles={["admin", "cashier"]}>
                  <ReceiptSettings />
                </RouteGuard>
              }
            />
            <Route
              path="/pos/receipts"
              element={
                <RouteGuard allowedRoles={["admin", "cashier"]}>
                  <Receipts />
                </RouteGuard>
              }
            />
            <Route
              path="/products"
              element={
                <RouteGuard allowedRoles={["admin", "cashier", "inventory_clerk"]}>
                  <Products />
                </RouteGuard>
              }
            />
            <Route
              path="/accounting"
              element={
                <RouteGuard allowedRoles={["admin", "accountant"]}>
                  <Accounting />
                </RouteGuard>
              }
            />
            <Route
              path="/dccr"
              element={
                <RouteGuard allowedRoles={["admin", "cashier", "accountant"]}>
                  <DCCR />
                </RouteGuard>
              }
            />
            <Route
              path="/employees"
              element={
                <RouteGuard allowedRoles={["admin", "hr"]}>
                  <Employees />
                </RouteGuard>
              }
            />
            <Route
              path="/payroll"
              element={
                <RouteGuard allowedRoles={["admin", "accountant"]}>
                  <Payroll />
                </RouteGuard>
              }
            />
            <Route
              path="/vouchers"
              element={
                <RouteGuard allowedRoles={["admin", "accountant", "manager"]}>
                  <Vouchers />
                </RouteGuard>
              }
            />
            <Route
              path="/settings"
              element={
                <RouteGuard allowedRoles={["admin", "manager"]}>
                  <Settings />
                </RouteGuard>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
