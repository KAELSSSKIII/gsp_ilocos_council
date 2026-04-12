import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import api from "@/lib/api";
import { readBusinessSettings } from "@/utils/businessSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Download, FileSpreadsheet, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type SCRDAutoData = {
  salesByCategory: { category_name: string; total: string }[];
  rentalBySpace: { space_name: string; amount: string }[];
  payrollSummary?: {
    salaries_wages?: string;
    cola?: string;
    sss?: string;
    philhealth?: string;
    pagibig?: string;
    net_salary?: string;
  } | null;
  receiptVoucherSummary?: {
    total?: string;
  } | null;
  voucherExpenses?: {
    voucher_number?: string;
    voucher_type?: string;
    description?: string;
    amount?: string;
    posted_date?: string;
  }[];
};

type RentalRow = { name: string; amount: number; auto: boolean };

type SavedReportRow = Partial<Record<keyof ReportState, unknown>>;
type NumericReportField = Exclude<keyof ReportState, "rental_rows" | "other_income_label">;

// Single flat state type — keys match DB column names exactly
type ReportState = {
  beginning_balance: number;
  council_support_fund: number;
  troop_fees: number;
  district_committee: number;
  career_woman: number;
  honorary_member: number;
  iccg: number;
  thinking_day_fund_gen: number;
  nes_sales: number;
  rental_rows: RentalRow[];
  interest_income: number;
  souvenir_sales: number;
  other_income_label: string;
  other_income_amount: number;
  exp_salaries_wages: number;
  exp_cola: number;
  exp_representation_ce: number;
  exp_sss: number;
  exp_philhealth: number;
  exp_pagibig: number;
  exp_transportation: number;
  exp_postage: number;
  exp_telephone: number;
  exp_electric: number;
  exp_office_supplies: number;
  exp_maintenance_linens: number;
  exp_gasoline_oil: number;
  exp_maintenance_vehicle: number;
  exp_repair_hq: number;
  exp_trainings: number;
  exp_conferences: number;
  exp_representation: number;
  exp_donations: number;
  exp_christmas_program: number;
  exp_escoda_fund: number;
  exp_thinking_day_fund: number;
  exp_licenses_permits: number;
  exp_legal_fees: number;
  exp_taxes: number;
  exp_advertising: number;
  exp_tulong_bata: number;
  exp_miscellaneous: number;
  nes_purchases: number;
  acc_cash_in_bank_dbp: number;
  acc_petty_cash: number;
  acc_cash_on_hand: number;
  acc_retirement_fund: number;
  acc_cash_in_bank_maybank: number;
  acc_checking_account_dbp: number;
  acc_cash_in_bank_pnb: number;
};

const DEFAULT_STATE: ReportState = {
  beginning_balance: 0, council_support_fund: 0, troop_fees: 0, district_committee: 0,
  career_woman: 0, honorary_member: 0, iccg: 0, thinking_day_fund_gen: 0,
  nes_sales: 0, rental_rows: [], interest_income: 0,
  souvenir_sales: 0, other_income_label: "Cash Prize", other_income_amount: 0,
  exp_salaries_wages: 0, exp_cola: 0, exp_representation_ce: 0,
  exp_sss: 0, exp_philhealth: 0, exp_pagibig: 0,
  exp_transportation: 0, exp_postage: 0, exp_telephone: 0, exp_electric: 0,
  exp_office_supplies: 0, exp_maintenance_linens: 0, exp_gasoline_oil: 0,
  exp_maintenance_vehicle: 0, exp_repair_hq: 0, exp_trainings: 0,
  exp_conferences: 0, exp_representation: 0, exp_donations: 0,
  exp_christmas_program: 0, exp_escoda_fund: 0, exp_thinking_day_fund: 0,
  exp_licenses_permits: 0, exp_legal_fees: 0, exp_taxes: 0,
  exp_advertising: 0, exp_tulong_bata: 0, exp_miscellaneous: 0,
  nes_purchases: 0,
  acc_cash_in_bank_dbp: 0, acc_petty_cash: 0, acc_cash_on_hand: 0,
  acc_retirement_fund: 0, acc_cash_in_bank_maybank: 0,
  acc_checking_account_dbp: 0, acc_cash_in_bank_pnb: 0,
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

// Single source of truth for all expense line items (UI form, Excel, and PDF export)
const EXPENSE_FIELDS: [keyof ReportState, string][] = [
  ["exp_salaries_wages",     "Salaries and Wages"],
  ["exp_cola",               "Cost of Living Allowance"],
  ["exp_representation_ce",  "Representation of CE"],
  ["exp_sss",                "SSS Premium Expense"],
  ["exp_philhealth",         "PhilHealth Premium Expense"],
  ["exp_pagibig",            "Pag-IBIG Premium Expense"],
  ["exp_transportation",     "Transportation and Travel"],
  ["exp_postage",            "Postage & Freight"],
  ["exp_telephone",          "Telephone and Communications"],
  ["exp_electric",           "Electric Bill"],
  ["exp_office_supplies",    "Office Supplies"],
  ["exp_maintenance_linens", "Maintenance Linens"],
  ["exp_gasoline_oil",       "Gasoline and Oil"],
  ["exp_maintenance_vehicle","Maintenance - Service Vehicle"],
  ["exp_repair_hq",          "Repair and Maintenance - Headquarters"],
  ["exp_trainings",          "Trainings"],
  ["exp_conferences",        "Conferences and Meetings"],
  ["exp_representation",     "Representation"],
  ["exp_donations",          "Donations and Contributions"],
  ["exp_christmas_program",  "Christmas Program"],
  ["exp_escoda_fund",        "Escoda Fund"],
  ["exp_thinking_day_fund",  "Thinking Day Fund"],
  ["exp_licenses_permits",   "Licenses and Permits"],
  ["exp_legal_fees",         "Legal Fees"],
  ["exp_taxes",              "Taxes"],
  ["exp_advertising",        "Advertising and Publicity"],
  ["exp_tulong_bata",        "Tulong Bata"],
  ["exp_miscellaneous",      "Miscellaneous"],
];

// Hydrate state from a DB row — loop over known keys, coerce types
function dbToState(r: SavedReportRow): ReportState {
  const s = { ...DEFAULT_STATE };
  for (const key of Object.keys(DEFAULT_STATE) as (keyof ReportState)[]) {
    if (r[key] == null) continue;
    if (key === "rental_rows") {
      const v = r[key];
      s.rental_rows = Array.isArray(v) ? v : (typeof v === "string" ? JSON.parse(v) : []);
    } else if (key === "other_income_label") {
      s.other_income_label = String(r[key]);
    } else {
      s[key as NumericReportField] = Number(r[key]);
    }
  }
  return s;
}

const fmt = (v: number) =>
  v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function parseMoney(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function categorizeVoucherExpense(description: string): keyof ReportState | null {
  const text = description.toLowerCase();

  const rules: Array<[keyof ReportState, string[]]> = [
    ["exp_representation_ce", ["representation of ce", "rep ce"]],
    ["exp_transportation", ["transport", "travel", "fare", "fuel reimbursement"]],
    ["exp_postage", ["postage", "freight", "courier", "shipping"]],
    ["exp_telephone", ["telephone", "communication", "internet", "mobile load"]],
    ["exp_electric", ["electric", "electricity", "power", "utility"]],
    ["exp_office_supplies", ["office supplies", "supplies", "stationery"]],
    ["exp_maintenance_linens", ["linens", "linen", "laundry"]],
    ["exp_gasoline_oil", ["gasoline", "diesel", "oil", "fuel"]],
    ["exp_maintenance_vehicle", ["vehicle maintenance", "service vehicle", "vehicle repair"]],
    ["exp_repair_hq", ["repair", "maintenance - headquarters", "headquarters"]],
    ["exp_trainings", ["training", "seminar", "workshop"]],
    ["exp_conferences", ["conference", "meeting", "convention"]],
    ["exp_representation", ["representation"]],
    ["exp_donations", ["donation", "contribution"]],
    ["exp_christmas_program", ["christmas"]],
    ["exp_escoda_fund", ["escoda"]],
    ["exp_thinking_day_fund", ["thinking day"]],
    ["exp_licenses_permits", ["license", "permit", "registration"]],
    ["exp_legal_fees", ["legal"]],
    ["exp_taxes", ["tax", "withholding"]],
    ["exp_advertising", ["advertising", "publicity", "marketing", "promotion"]],
    ["exp_tulong_bata", ["tulong bata"]],
  ];

  const match = rules.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
  return match?.[0] ?? null;
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────
function NumInput({ value, onChange, readOnly }: {
  value: number; onChange?: (v: number) => void; readOnly?: boolean;
}) {
  return (
    <Input
      type="number" min={0} step="0.01"
      value={value === 0 ? "" : value}
      placeholder="0.00"
      readOnly={readOnly}
      onChange={(e) => onChange?.(parseFloat(e.target.value) || 0)}
      className={`h-8 w-40 text-right text-sm tabular-nums ${readOnly ? "bg-muted text-muted-foreground" : ""}`}
    />
  );
}

function Row({ label, value, onChange, readOnly, indent = 0, bold, auto }: {
  label: string; value: number; onChange?: (v: number) => void;
  readOnly?: boolean; indent?: number; bold?: boolean; auto?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 py-0.5 ${bold ? "font-semibold" : ""}`}
      style={{ paddingLeft: indent * 16 }}
    >
      <span className="text-sm flex items-center gap-1.5">
        {label}
        {auto && (
          <span className="rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-700">auto</span>
        )}
      </span>
      <NumInput value={value} onChange={onChange} readOnly={readOnly} />
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-t pt-1 mt-1">
      <span className="text-sm font-bold">{label}</span>
      <span className="w-40 text-right text-sm font-bold tabular-nums">{fmt(value)}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function SCRDPage() {
  const { orgName, regionName, councilName, bankAccount1, bankAccount2, bankAccount3, bankAccount4, bankAccount5 } = readBusinessSettings();
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [state, setState] = useState<ReportState>(DEFAULT_STATE);

  // Generic field setter
  const set = useCallback(
    (key: keyof ReportState, val: number | string | RentalRow[]) =>
      setState(s => ({ ...s, [key]: val })),
    []
  );

  // ── Load saved report when month/year changes ──────────────────────────────
  const savedQuery = useQuery({
    queryKey: ["scrd-saved", year, month],
    queryFn: async () => {
      const data = await api.get<{ report: SavedReportRow | null }>(`/reports/scrd/saved?year=${year}&month=${month}`);
      return data.report ?? null;
    },
  });

  const appliedKeyRef = useRef<string>("");
  useEffect(() => {
    if (!savedQuery.isSuccess) return;
    const key = `${year}-${month}`;
    if (appliedKeyRef.current === key) return;
    appliedKeyRef.current = key;
    if (savedQuery.data) {
      setState(dbToState(savedQuery.data));
      toast.info(`Loaded saved report for ${MONTHS[month - 1]} ${year}.`);
    } else {
      setState(DEFAULT_STATE);
    }
  }, [savedQuery.isSuccess, savedQuery.data, year, month]);

  // ── Fetch auto data from sales/rentals ─────────────────────────────────────
  // Auto-fetch when: saved query has resolved AND there is no saved report for this month
  const autoQuery = useQuery({
    queryKey: ["scrd-auto", year, month],
    enabled: savedQuery.isSuccess && savedQuery.data === null,
    queryFn: async (): Promise<SCRDAutoData> =>
      api.get(`/reports/scrd?year=${year}&month=${month}`),
  });

  const { isFetching: isFetchingAuto, refetch: refetchAuto } = autoQuery;

  useEffect(() => {
    const data = autoQuery.data;
    if (!data) return;

    const byCategory = new Map(
      data.salesByCategory.map((r) => [r.category_name.toLowerCase(), parseFloat(r.total)])
    );

    const cat = (...names: string[]) =>
      [...byCategory.entries()]
        .filter(([k]) => names.some((n) => k.includes(n.toLowerCase())))
        .reduce((s, [, v]) => s + v, 0);

    const genOpsKeys = [
      "council support", "troop fee", "district committee",
      "career woman", "honorary member", "iccg", "thinking day",
    ];
    const nesTotal = [...byCategory.entries()]
      .filter(([k]) =>
        !/rental/i.test(k) &&
        !/souvenir/i.test(k) &&
        !genOpsKeys.some((n) => k.includes(n))
      )
      .reduce((s, [, v]) => s + v, 0);

    const payroll = data.payrollSummary ?? {};
    const voucherExpenses = data.voucherExpenses ?? [];
    const receiptVoucherTotal = parseMoney(data.receiptVoucherSummary?.total);

    const voucherExpenseFields: Array<keyof ReportState> = [
      "exp_representation_ce",
      "exp_transportation",
      "exp_postage",
      "exp_telephone",
      "exp_electric",
      "exp_office_supplies",
      "exp_maintenance_linens",
      "exp_gasoline_oil",
      "exp_maintenance_vehicle",
      "exp_repair_hq",
      "exp_trainings",
      "exp_conferences",
      "exp_representation",
      "exp_donations",
      "exp_christmas_program",
      "exp_escoda_fund",
      "exp_thinking_day_fund",
      "exp_licenses_permits",
      "exp_legal_fees",
      "exp_taxes",
      "exp_advertising",
      "exp_tulong_bata",
      "exp_miscellaneous",
    ];

    const voucherExpenseBuckets = voucherExpenseFields.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {} as Partial<Record<keyof ReportState, number>>);

    voucherExpenses.forEach((row) => {
      const key = categorizeVoucherExpense(String(row.description ?? "")) ?? "exp_miscellaneous";
      voucherExpenseBuckets[key] = (voucherExpenseBuckets[key] ?? 0) + parseMoney(row.amount);
    });

    setState(s => ({
      ...s,
      council_support_fund:  cat("council support fund", "council support"),
      troop_fees:            cat("troop fee"),
      district_committee:    cat("district committee"),
      career_woman:          cat("career woman"),
      honorary_member:       cat("honorary member"),
      iccg:                  cat("iccg"),
      thinking_day_fund_gen: cat("thinking day fund", "thinking day"),
      nes_sales:             nesTotal,
      souvenir_sales:        cat("souvenir"),
      other_income_amount:   receiptVoucherTotal,
      other_income_label:    receiptVoucherTotal > 0 ? "Posted Receipt Vouchers" : s.other_income_label,
      rental_rows: data.rentalBySpace.length > 0
        ? data.rentalBySpace.map((r) => ({ name: r.space_name, amount: parseFloat(r.amount), auto: true }))
        : [{ name: "Hall Rental", amount: 0, auto: false }],
      exp_salaries_wages:    parseMoney(payroll.salaries_wages),
      exp_cola:              parseMoney(payroll.cola),
      exp_sss:               parseMoney(payroll.sss),
      exp_philhealth:        parseMoney(payroll.philhealth),
      exp_pagibig:           parseMoney(payroll.pagibig),
      exp_representation_ce: voucherExpenseBuckets.exp_representation_ce ?? 0,
      exp_transportation:    voucherExpenseBuckets.exp_transportation ?? 0,
      exp_postage:           voucherExpenseBuckets.exp_postage ?? 0,
      exp_telephone:         voucherExpenseBuckets.exp_telephone ?? 0,
      exp_electric:          voucherExpenseBuckets.exp_electric ?? 0,
      exp_office_supplies:   voucherExpenseBuckets.exp_office_supplies ?? 0,
      exp_maintenance_linens: voucherExpenseBuckets.exp_maintenance_linens ?? 0,
      exp_gasoline_oil:      voucherExpenseBuckets.exp_gasoline_oil ?? 0,
      exp_maintenance_vehicle: voucherExpenseBuckets.exp_maintenance_vehicle ?? 0,
      exp_repair_hq:         voucherExpenseBuckets.exp_repair_hq ?? 0,
      exp_trainings:         voucherExpenseBuckets.exp_trainings ?? 0,
      exp_conferences:       voucherExpenseBuckets.exp_conferences ?? 0,
      exp_representation:    voucherExpenseBuckets.exp_representation ?? 0,
      exp_donations:         voucherExpenseBuckets.exp_donations ?? 0,
      exp_christmas_program: voucherExpenseBuckets.exp_christmas_program ?? 0,
      exp_escoda_fund:       voucherExpenseBuckets.exp_escoda_fund ?? 0,
      exp_thinking_day_fund: voucherExpenseBuckets.exp_thinking_day_fund ?? 0,
      exp_licenses_permits:  voucherExpenseBuckets.exp_licenses_permits ?? 0,
      exp_legal_fees:        voucherExpenseBuckets.exp_legal_fees ?? 0,
      exp_taxes:             voucherExpenseBuckets.exp_taxes ?? 0,
      exp_advertising:       voucherExpenseBuckets.exp_advertising ?? 0,
      exp_tulong_bata:       voucherExpenseBuckets.exp_tulong_bata ?? 0,
      exp_miscellaneous:     voucherExpenseBuckets.exp_miscellaneous ?? 0,
    }));

    toast.success(`Auto-populated from ${MONTHS[month - 1]} ${year} sales, rentals, payroll, and vouchers.`);
  }, [autoQuery.data, month, year]);

  // ── Save mutation ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => api.post("/reports/scrd/saved", { year, month, ...state }),
    onSuccess: () => toast.success("Report saved successfully."),
    onError: () => toast.error("Failed to save report."),
  });

  // ── Computed totals ────────────────────────────────────────────────────────
  const genOpsTotal = useMemo(
    () => state.council_support_fund + state.troop_fees + state.district_committee +
          state.career_woman + state.honorary_member + state.iccg + state.thinking_day_fund_gen,
    [state.council_support_fund, state.troop_fees, state.district_committee,
     state.career_woman, state.honorary_member, state.iccg, state.thinking_day_fund_gen]
  );
  const rentalTotal    = useMemo(() => (Array.isArray(state.rental_rows) ? state.rental_rows : []).reduce((s, r) => s + r.amount, 0), [state.rental_rows]);
  const otherIncTotal  = useMemo(() => state.souvenir_sales + state.other_income_amount, [state.souvenir_sales, state.other_income_amount]);
  const totalReceipts  = useMemo(
    () => genOpsTotal + state.nes_sales + rentalTotal + state.interest_income + otherIncTotal,
    [genOpsTotal, state.nes_sales, rentalTotal, state.interest_income, otherIncTotal]
  );
  const totalAvailable = useMemo(() => state.beginning_balance + totalReceipts, [state.beginning_balance, totalReceipts]);
  const opExpTotal     = EXPENSE_FIELDS.reduce((sum, [key]) => sum + (state[key] as number), 0);
  const totalDisbursements = useMemo(() => opExpTotal + state.nes_purchases, [opExpTotal, state.nes_purchases]);
  const endingBalance      = useMemo(() => totalAvailable - totalDisbursements, [totalAvailable, totalDisbursements]);
  const accOpsTotal        = useMemo(
    () => state.acc_cash_in_bank_dbp + state.acc_petty_cash + state.acc_cash_on_hand + state.acc_retirement_fund,
    [state.acc_cash_in_bank_dbp, state.acc_petty_cash, state.acc_cash_on_hand, state.acc_retirement_fund]
  );
  const accCapTotal        = useMemo(
    () => state.acc_cash_in_bank_maybank + state.acc_checking_account_dbp + state.acc_cash_in_bank_pnb,
    [state.acc_cash_in_bank_maybank, state.acc_checking_account_dbp, state.acc_cash_in_bank_pnb]
  );
  const accGrandTotal      = useMemo(() => accOpsTotal + accCapTotal, [accOpsTotal, accCapTotal]);

  const monthLabel = MONTHS[month - 1];
  const isSaved = !!savedQuery.data;

  // ── Build export rows ──────────────────────────────────────────────────────
  const buildRows = useCallback((): [string, string, string][] => {
    const rows: [string, string, string][] = [
      ["CASH BALANCE AVAILABLE AT THE BEGINNING","",fmt(state.beginning_balance)],
      ["ADD: CASH RECEIPTS","",""],
      ["I. OPERATIONS","",""],
      ["  A. GENERAL OPERATIONS","",""],
      ["    1. Council Support Fund",fmt(state.council_support_fund),""],
      ["    2. Troop Fees",fmt(state.troop_fees),""],
      ["    3. District Committee",fmt(state.district_committee),""],
      ["    4. Career Woman",fmt(state.career_woman),""],
      ["    5. Honorary Member",fmt(state.honorary_member),""],
      ["    6. ICCG",fmt(state.iccg),""],
      ["    7. Thinking Day Fund",fmt(state.thinking_day_fund_gen),""],
      ["  SUB-TOTAL","",fmt(genOpsTotal)],
      ["  B. National Equipment Service (NES)","",""],
      ["    1. Sales: NES Items",fmt(state.nes_sales),""],
      ["  SUB-TOTAL","",fmt(state.nes_sales)],
      ["II. RENTAL INCOME","",""],
      ...state.rental_rows.map((r, i): [string,string,string] => [`  ${i+1}. ${r.name}`,fmt(r.amount),""]),
      ["  SUB-TOTAL","",fmt(rentalTotal)],
      ["III. INTEREST INCOME","",""],
      ["    1. Interest Income from Bank",fmt(state.interest_income),""],
      ["  SUB-TOTAL","",fmt(state.interest_income)],
      ["IV. OTHER INCOME","",""],
      ["    1. Sales: Souvenir Items",fmt(state.souvenir_sales),""],
      [`    2. ${state.other_income_label}`,fmt(state.other_income_amount),""],
      ["  SUB-TOTAL","",fmt(otherIncTotal)],
      ["TOTAL CASH RECEIPTS","",fmt(totalReceipts)],
      ["TOTAL CASH AVAILABLE","",fmt(totalAvailable)],
      ["","",""],
      ["LESS: CASH DISBURSEMENTS","",""],
      ["I. OPERATIONS","",""],
      ["  A. OPERATING EXPENSES","",""],
      ...EXPENSE_FIELDS.map(([key, label], i): [string,string,string] => [`    ${i+1}. ${label}`,fmt(state[key] as number),""]),
      ["  SUB TOTAL","",fmt(opExpTotal)],
      ["  B. NATIONAL EQUIPMENT SERVICES","",""],
      ["    1. Purchases",fmt(state.nes_purchases),""],
      ["  SUB TOTAL","",fmt(state.nes_purchases)],
      [`TOTAL CASH DISBURSEMENTS`,"",fmt(totalDisbursements)],
      [`TOTAL CASH BALANCE — ${monthLabel.toUpperCase()} ${year}`,"",fmt(endingBalance)],
      ["","",""],
      ["ACCOUNTED FOR AS FOLLOWS:","",""],
      ["I. OPERATIONS","",""],
      ["  A. GENERAL OPERATIONS","",""],
      [`    ${bankAccount1}`,fmt(state.acc_cash_in_bank_dbp),""],
      ["    Petty Cash Fund",fmt(state.acc_petty_cash),""],
      ["    Cash on Hand",fmt(state.acc_cash_on_hand),""],
      ["  SUB-TOTAL","",fmt(state.acc_cash_in_bank_dbp + state.acc_petty_cash + state.acc_cash_on_hand)],
      ["  B. RETIREMENT FUND","",""],
      [`    ${bankAccount2}`,fmt(state.acc_retirement_fund),""],
      ["  SUB-TOTAL","",fmt(state.acc_retirement_fund)],
      ["II. CAPITAL OUTLAY","",""],
      ["  A. BUILDING/NES/TRANSITORY FEES","",""],
      [`    ${bankAccount3}`,fmt(state.acc_cash_in_bank_maybank),""],
      [`    ${bankAccount4}`,fmt(state.acc_checking_account_dbp),""],
      [`    ${bankAccount5}`,fmt(state.acc_cash_in_bank_pnb),""],
      ["  SUB-TOTAL","",fmt(accCapTotal)],
      [`TOTAL CASH BALANCE — ${monthLabel.toUpperCase()} ${year}`,"",fmt(accGrandTotal)],
    ];
    return rows;
  }, [state, genOpsTotal, rentalTotal, otherIncTotal, totalReceipts, totalAvailable,
      opExpTotal, totalDisbursements, endingBalance, accCapTotal, accGrandTotal, monthLabel, year,
      bankAccount1, bankAccount2, bankAccount3, bankAccount4, bankAccount5]);

  // ── Excel export ───────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const header = [
      [orgName.toUpperCase()],[regionName.toUpperCase()],[councilName.toUpperCase()],[""],
      ["STATEMENT OF CASH RECEIPTS & DISBURSEMENTS"],
      [`For the Month Ended, ${monthLabel} ${year}`],[""],
      ["Description","Amount","Sub-total / Total"],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...header, ...buildRows()]);
    ws["!cols"] = [{ wch: 60 }, { wch: 18 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SCRD");
    XLSX.writeFile(wb, `SCRD-${monthLabel}-${year}.xlsx`);
  };

  // ── PDF export ─────────────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(orgName.toUpperCase(), 105, 14, { align: "center" });
    doc.text(regionName.toUpperCase(), 105, 19, { align: "center" });
    doc.text(councilName.toUpperCase(), 105, 24, { align: "center" });
    doc.setFontSize(10);
    doc.text("STATEMENT OF CASH RECEIPTS & DISBURSEMENTS", 105, 31, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(`For the Month Ended, ${monthLabel} ${year}`, 105, 36, { align: "center" });
    autoTable(doc, {
      startY: 42,
      head: [["Description","Amount","Sub-total / Total"]],
      body: buildRows(),
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [34, 139, 87], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 35, halign: "right" }, 2: { cellWidth: 35, halign: "right" } },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    doc.save(`SCRD-${monthLabel}-${year}.pdf`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-emerald-800">
            Statement of Cash Receipts &amp; Disbursements
          </h1>
          <p className="text-sm text-slate-500">{orgName} — {councilName}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExportExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4 text-green-700" />
            Export Excel
          </Button>
          <Button variant="outline" onClick={handleExportPdf}>
            <Download className="mr-2 h-4 w-4 text-red-600" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Filters + actions */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Month</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={m} value={String(i+1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Year</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => refetchAuto()} disabled={isFetchingAuto}>
            {isFetchingAuto ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isFetchingAuto ? "Loading..." : "Refresh Auto Data"}
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Save className="mr-2 h-4 w-4" />}
            Save Report
          </Button>
          {isSaved && (
            <span className="flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved in database
            </span>
          )}
          {savedQuery.isLoading && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading saved report…
            </span>
          )}
        </CardContent>
      </Card>

      {/* Report form */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* LEFT — Receipts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-emerald-800">ADD: Cash Receipts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Row label="Cash Balance — Beginning" value={state.beginning_balance}
              onChange={(v) => set("beginning_balance", v)} bold />

            <SectionLabel label="I-A. General Operations" />
            <Row label="1. Council Support Fund" value={state.council_support_fund} onChange={(v) => set("council_support_fund", v)} indent={1} auto />
            <Row label="2. Troop Fees"            value={state.troop_fees}           onChange={(v) => set("troop_fees", v)}           indent={1} auto />
            <Row label="3. District Committee"    value={state.district_committee}   onChange={(v) => set("district_committee", v)}   indent={1} auto />
            <Row label="4. Career Woman"          value={state.career_woman}         onChange={(v) => set("career_woman", v)}         indent={1} auto />
            <Row label="5. Honorary Member"       value={state.honorary_member}      onChange={(v) => set("honorary_member", v)}      indent={1} auto />
            <Row label="6. ICCG"                  value={state.iccg}                 onChange={(v) => set("iccg", v)}                 indent={1} auto />
            <Row label="7. Thinking Day Fund"     value={state.thinking_day_fund_gen} onChange={(v) => set("thinking_day_fund_gen", v)} indent={1} auto />
            <Total label="Sub-total — General Ops" value={genOpsTotal} />

            <SectionLabel label="I-B. National Equipment Service (NES)" />
            <Row label="1. Sales: NES Items" value={state.nes_sales} onChange={(v) => set("nes_sales", v)} indent={1} auto />
            <Total label="Sub-total — NES" value={state.nes_sales} />

            <SectionLabel label="II. Rental Income" />
            {state.rental_rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5" style={{ paddingLeft: 16 }}>
                <span className="text-sm flex-1 flex items-center gap-1.5">
                  {i + 1}.{" "}
                  <input
                    className="border-b border-dashed border-slate-300 bg-transparent text-sm outline-none w-40"
                    value={row.name}
                    onChange={(e) => set("rental_rows", state.rental_rows.map((r, idx) => idx === i ? { ...r, name: e.target.value } : r))}
                  />
                  {row.auto && <span className="rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-700">auto</span>}
                </span>
                <NumInput
                  value={row.amount}
                  onChange={(v) => set("rental_rows", state.rental_rows.map((r, idx) => idx === i ? { ...r, amount: v } : r))}
                />
              </div>
            ))}
            <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs"
              onClick={() => set("rental_rows", [...state.rental_rows, { name: "Rental Space", amount: 0, auto: false }])}>
              + Add rental row
            </Button>
            <Total label="Sub-total — Rental" value={rentalTotal} />

            <SectionLabel label="III. Interest Income" />
            <Row label="1. Interest Income from Bank" value={state.interest_income} onChange={(v) => set("interest_income", v)} indent={1} />
            <Total label="Sub-total — Interest" value={state.interest_income} />

            <SectionLabel label="IV. Other Income" />
            <Row label="1. Sales: Souvenir Items" value={state.souvenir_sales} onChange={(v) => set("souvenir_sales", v)} indent={1} auto />
            <div className="flex items-center gap-2 py-0.5" style={{ paddingLeft: 16 }}>
              <span className="text-sm">2.</span>
              <input
                className="border-b border-dashed border-slate-300 bg-transparent text-sm outline-none flex-1"
                value={state.other_income_label}
                onChange={(e) => set("other_income_label", e.target.value)}
                placeholder="Label"
              />
              <NumInput value={state.other_income_amount} onChange={(v) => set("other_income_amount", v)} />
            </div>
            <Total label="Sub-total — Other Income" value={otherIncTotal} />

            <div className="mt-3 rounded-lg bg-emerald-50 p-3 space-y-1">
              <div className="flex justify-between text-sm font-bold text-emerald-800">
                <span>TOTAL CASH RECEIPTS</span>
                <span className="tabular-nums">{fmt(totalReceipts)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-emerald-900">
                <span>TOTAL CASH AVAILABLE</span>
                <span className="tabular-nums">{fmt(totalAvailable)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT — Disbursements + Accounted */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-rose-800">LESS: Cash Disbursements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <SectionLabel label="I-A. Operating Expenses" />
              {EXPENSE_FIELDS.map(([key, label], i) => (
                <Row key={key} label={`${i+1}. ${label}`} value={state[key] as number}
                  onChange={(v) => set(key, v)} indent={1} />
              ))}
              <Total label="Sub-total — Operating Expenses" value={opExpTotal} />

              <SectionLabel label="I-B. National Equipment Services" />
              <Row label="1. Purchases" value={state.nes_purchases} onChange={(v) => set("nes_purchases", v)} indent={1} />
              <Total label="Sub-total — NES Purchases" value={state.nes_purchases} />

              <div className="mt-3 rounded-lg bg-rose-50 p-3 space-y-1">
                <div className="flex justify-between text-sm font-bold text-rose-800">
                  <span>TOTAL CASH DISBURSEMENTS</span>
                  <span className="tabular-nums">{fmt(totalDisbursements)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-rose-900">
                  <span>TOTAL CASH BALANCE — {monthLabel.toUpperCase()} {year}</span>
                  <span className="tabular-nums">{fmt(endingBalance)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Accounted For As Follows</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <SectionLabel label="I-A. General Operations" />
              <Row label={bankAccount1} value={state.acc_cash_in_bank_dbp}    indent={1} onChange={(v) => set("acc_cash_in_bank_dbp", v)} />
              <Row label="Petty Cash Fund"                  value={state.acc_petty_cash}           indent={1} onChange={(v) => set("acc_petty_cash", v)} />
              <Row label="Cash on Hand"                     value={state.acc_cash_on_hand}         indent={1} onChange={(v) => set("acc_cash_on_hand", v)} />
              <Total label="Sub-total" value={state.acc_cash_in_bank_dbp + state.acc_petty_cash + state.acc_cash_on_hand} />

              <SectionLabel label="I-B. Retirement Fund" />
              <Row label={bankAccount2} value={state.acc_retirement_fund} indent={1} onChange={(v) => set("acc_retirement_fund", v)} />
              <Total label="Sub-total" value={state.acc_retirement_fund} />

              <SectionLabel label="II-A. Capital Outlay — Building/NES/Transitory" />
              <Row label={bankAccount3} value={state.acc_cash_in_bank_maybank}  indent={1} onChange={(v) => set("acc_cash_in_bank_maybank", v)} />
              <Row label={bankAccount4} value={state.acc_checking_account_dbp} indent={1} onChange={(v) => set("acc_checking_account_dbp", v)} />
              <Row label={bankAccount5} value={state.acc_cash_in_bank_pnb}     indent={1} onChange={(v) => set("acc_cash_in_bank_pnb", v)} />
              <Total label="Sub-total" value={accCapTotal} />

              <div className={`mt-2 rounded-lg p-3 ${Math.abs(accGrandTotal - endingBalance) < 0.01 ? "bg-emerald-50" : "bg-amber-50"}`}>
                <div className="flex justify-between text-sm font-bold">
                  <span>TOTAL CASH BALANCE</span>
                  <span className="tabular-nums">{fmt(accGrandTotal)}</span>
                </div>
                {Math.abs(accGrandTotal - endingBalance) > 0.01 && (
                  <p className="text-xs text-amber-700 mt-1">
                    Difference from ending balance: {fmt(Math.abs(accGrandTotal - endingBalance))}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom save/export */}
      <div className="flex gap-2 justify-end pb-8">
        <Button variant="outline" onClick={handleExportExcel}>
          <FileSpreadsheet className="mr-2 h-4 w-4 text-green-700" /> Export Excel
        </Button>
        <Button variant="outline" onClick={handleExportPdf}>
          <Download className="mr-2 h-4 w-4 text-red-600" /> Export PDF
        </Button>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Save className="mr-2 h-4 w-4" />}
          Save Report
        </Button>
      </div>
    </div>
  );
}
