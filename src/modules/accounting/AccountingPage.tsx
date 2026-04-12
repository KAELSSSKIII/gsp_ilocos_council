import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { OverviewTab }      from "./components/OverviewTab";
import { ProfitLossTab }    from "./components/ProfitLossTab";
import { GeneralLedgerTab } from "./components/GeneralLedgerTab";
import { InvoicesTab }      from "./components/InvoicesTab";
import { ExpensesTab }      from "./components/ExpensesTab";
import { ChartOfAccountsTab } from "./components/ChartOfAccountsTab";
import { JournalEntriesTab } from "./components/JournalEntriesTab";
import { ManualJournalEntryTab } from "./components/ManualJournalEntryTab";
import { FinancialStatementsTab } from "./components/FinancialStatementsTab";
import { AccountMappingsTab } from "./components/AccountMappingsTab";
import { CategoryRevenueMappingsTab } from "./components/CategoryRevenueMappingsTab";

const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 1, currentYear, currentYear + 1];

export function AccountingPage() {
  const [year,      setYear]      = useState(currentYear);
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Accounting & Finance</h1>
          <p className="text-muted-foreground">
            Business overview, P&amp;L statements, invoicing, and expense tracking.
          </p>
        </div>
        {/* Year selector only applies to the Overview chart */}
        {activeTab === "overview" && (
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Chart of Accounts</TabsTrigger>
          <TabsTrigger value="mappings">Account Mappings</TabsTrigger>
          <TabsTrigger value="category-mappings">Category Revenue</TabsTrigger>
          <TabsTrigger value="manual-journal">Manual Journal</TabsTrigger>
          <TabsTrigger value="journals">Journal Entries</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="ledger">General Ledger</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab year={year} />
        </TabsContent>

        <TabsContent value="accounts">
          <ChartOfAccountsTab />
        </TabsContent>

        <TabsContent value="mappings">
          <AccountMappingsTab />
        </TabsContent>

        <TabsContent value="category-mappings">
          <CategoryRevenueMappingsTab />
        </TabsContent>

        <TabsContent value="manual-journal">
          <ManualJournalEntryTab />
        </TabsContent>

        <TabsContent value="journals">
          <JournalEntriesTab />
        </TabsContent>

        <TabsContent value="statements">
          <FinancialStatementsTab />
        </TabsContent>

        <TabsContent value="pnl">
          <ProfitLossTab />
        </TabsContent>

        <TabsContent value="ledger">
          <GeneralLedgerTab />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoicesTab />
        </TabsContent>

        <TabsContent value="expenses">
          <ExpensesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
