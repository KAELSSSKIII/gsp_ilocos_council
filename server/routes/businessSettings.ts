import { Router } from "express";

import { ROUTE_ROLE_ACCESS } from "../config/permissions";
import sql from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { ADMIN_AUDIT_ACTIONS, appendAuditLog } from "../services/auditLog";
import { validateBody } from "../middleware/validate";
import { businessSettingsSchema } from "../validation/schemas";

const router = Router();

const isMissingRelationError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: string }).code === "42P01";

const DEFAULT_SETTINGS = {
  taxRate: 0.12,
  rentalDiscountRate: 0.1,
  orgName: "Girl Scouts of the Philippines",
  regionName: "Northern Luzon Region",
  councilName: "Ilocos Sur Council",
  orgAddress: "Plaza Burgos, City of Vigan, Ilocos Sur, Philippines",
  bankAccount1: "Cash in Bank, DBP #00500128590-5",
  bankAccount2: "Time Deposit, Cordillera Bank #8104",
  bankAccount3: "Cash in Bank, Maybank #01-017-00-0197-9",
  bankAccount4: "Checking Account, DBP #00-0-50141-590-7",
  bankAccount5: "Cash in Bank, PNB #223510036978",
  reportPreparedByName: "",
  reportPreparedByTitle: "Cashier",
  reportVerifiedByName: "",
  reportVerifiedByTitle: "Supervisor / Council Executive Director",
  reportApprovedByName: "",
  reportApprovedByTitle: "Council President / Authorized Signatory",
} as const;

router.get("/", requireAuth, async (_req, res) => {
  try {
    const [settings] = await sql`
      SELECT id, tax_rate, rental_discount_rate, org_name, region_name, council_name,
             org_address,
             bank_account_1, bank_account_2, bank_account_3, bank_account_4, bank_account_5,
             report_prepared_by_name, report_prepared_by_title,
             report_verified_by_name, report_verified_by_title,
             report_approved_by_name, report_approved_by_title,
             updated_at
      FROM public.business_settings
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    if (!settings) {
      return res.json({ settings: null, defaults: DEFAULT_SETTINGS });
    }

    return res.json({
      settings: {
        id: settings.id,
        taxRate: Number(settings.tax_rate),
        rentalDiscountRate: Number(settings.rental_discount_rate),
        orgName: settings.org_name,
        regionName: settings.region_name,
        councilName: settings.council_name,
        orgAddress: settings.org_address ?? DEFAULT_SETTINGS.orgAddress,
        bankAccount1: settings.bank_account_1,
        bankAccount2: settings.bank_account_2,
        bankAccount3: settings.bank_account_3,
        bankAccount4: settings.bank_account_4,
        bankAccount5: settings.bank_account_5,
        reportPreparedByName: settings.report_prepared_by_name ?? "",
        reportPreparedByTitle: settings.report_prepared_by_title ?? DEFAULT_SETTINGS.reportPreparedByTitle,
        reportVerifiedByName: settings.report_verified_by_name ?? "",
        reportVerifiedByTitle: settings.report_verified_by_title ?? DEFAULT_SETTINGS.reportVerifiedByTitle,
        reportApprovedByName: settings.report_approved_by_name ?? "",
        reportApprovedByTitle: settings.report_approved_by_title ?? DEFAULT_SETTINGS.reportApprovedByTitle,
        updatedAt: settings.updated_at,
      },
      defaults: DEFAULT_SETTINGS,
    });
  } catch (err) {
    // Gracefully fall back to defaults if the table doesn't exist yet
    // or any other DB error occurs on this non-critical read
    if (isMissingRelationError(err)) {
      return res.json({ settings: null, defaults: DEFAULT_SETTINGS });
    }
    const code = (err as { code?: string })?.code ?? "";
    // Also handle permission errors or any other DB-level issue by returning defaults
    if (code.startsWith("4") || code.startsWith("5")) {
      console.warn("[business-settings] DB error, returning defaults:", code);
      return res.json({ settings: null, defaults: DEFAULT_SETTINGS });
    }
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put(
  "/",
  requireAuth,
  requireRole(...ROUTE_ROLE_ACCESS.businessSettingsWrite),
  validateBody(businessSettingsSchema),
  async (req, res) => {
    try {
      const [existing] = await sql`
        SELECT
          id, tax_rate, rental_discount_rate, org_name, region_name, council_name,
          org_address,
          bank_account_1, bank_account_2, bank_account_3, bank_account_4, bank_account_5,
          report_prepared_by_name, report_prepared_by_title,
          report_verified_by_name, report_verified_by_title,
          report_approved_by_name, report_approved_by_title
        FROM public.business_settings
        ORDER BY updated_at DESC
        LIMIT 1
      `;

      const {
        taxRate,
        rentalDiscountRate,
        orgName,
        regionName,
        councilName,
        orgAddress,
        bankAccount1,
        bankAccount2,
        bankAccount3,
        bankAccount4,
        bankAccount5,
        reportPreparedByName,
        reportPreparedByTitle,
        reportVerifiedByName,
        reportVerifiedByTitle,
        reportApprovedByName,
        reportApprovedByTitle,
      } = req.body;

      const [settings] = await sql`
        INSERT INTO public.business_settings (
          singleton_key,
          tax_rate,
          rental_discount_rate,
          org_name,
          region_name,
          council_name,
          org_address,
          bank_account_1,
          bank_account_2,
          bank_account_3,
          bank_account_4,
          bank_account_5,
          report_prepared_by_name,
          report_prepared_by_title,
          report_verified_by_name,
          report_verified_by_title,
          report_approved_by_name,
          report_approved_by_title,
          updated_by
        )
        VALUES (
          TRUE,
          ${taxRate},
          ${rentalDiscountRate},
          ${orgName},
          ${regionName},
          ${councilName},
          ${orgAddress ?? ""},
          ${bankAccount1},
          ${bankAccount2},
          ${bankAccount3},
          ${bankAccount4},
          ${bankAccount5},
          ${reportPreparedByName ?? ""},
          ${reportPreparedByTitle ?? DEFAULT_SETTINGS.reportPreparedByTitle},
          ${reportVerifiedByName ?? ""},
          ${reportVerifiedByTitle ?? DEFAULT_SETTINGS.reportVerifiedByTitle},
          ${reportApprovedByName ?? ""},
          ${reportApprovedByTitle ?? DEFAULT_SETTINGS.reportApprovedByTitle},
          ${req.user!.id}
        )
        ON CONFLICT (singleton_key) DO UPDATE SET
          tax_rate = EXCLUDED.tax_rate,
          rental_discount_rate = EXCLUDED.rental_discount_rate,
          org_name = EXCLUDED.org_name,
          region_name = EXCLUDED.region_name,
          council_name = EXCLUDED.council_name,
          org_address = EXCLUDED.org_address,
          bank_account_1 = EXCLUDED.bank_account_1,
          bank_account_2 = EXCLUDED.bank_account_2,
          bank_account_3 = EXCLUDED.bank_account_3,
          bank_account_4 = EXCLUDED.bank_account_4,
          bank_account_5 = EXCLUDED.bank_account_5,
          report_prepared_by_name = EXCLUDED.report_prepared_by_name,
          report_prepared_by_title = EXCLUDED.report_prepared_by_title,
          report_verified_by_name = EXCLUDED.report_verified_by_name,
          report_verified_by_title = EXCLUDED.report_verified_by_title,
          report_approved_by_name = EXCLUDED.report_approved_by_name,
          report_approved_by_title = EXCLUDED.report_approved_by_title,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING id, tax_rate, rental_discount_rate, org_name, region_name, council_name,
                  org_address,
                  bank_account_1, bank_account_2, bank_account_3, bank_account_4, bank_account_5,
                  report_prepared_by_name, report_prepared_by_title,
                  report_verified_by_name, report_verified_by_title,
                  report_approved_by_name, report_approved_by_title,
                  updated_at
      `;

      await appendAuditLog({
        action: ADMIN_AUDIT_ACTIONS.BUSINESS_SETTINGS_UPDATED,
        actorId: req.user!.id,
        entityType: "business_settings",
        entityId: settings.id,
        summary: `Business settings were updated for ${settings.org_name}.`,
        metadata: {
          display_name: settings.org_name,
          changes: {
            tax_rate: Number(existing?.tax_rate ?? DEFAULT_SETTINGS.taxRate) !== Number(settings.tax_rate),
            rental_discount_rate: Number(existing?.rental_discount_rate ?? DEFAULT_SETTINGS.rentalDiscountRate) !== Number(settings.rental_discount_rate),
            org_name: String(existing?.org_name ?? DEFAULT_SETTINGS.orgName) !== String(settings.org_name),
            region_name: String(existing?.region_name ?? DEFAULT_SETTINGS.regionName) !== String(settings.region_name),
            council_name: String(existing?.council_name ?? DEFAULT_SETTINGS.councilName) !== String(settings.council_name),
          },
        },
      });

      return res.json({
        settings: {
          id: settings.id,
          taxRate: Number(settings.tax_rate),
          rentalDiscountRate: Number(settings.rental_discount_rate),
          orgName: settings.org_name,
          regionName: settings.region_name,
          councilName: settings.council_name,
          orgAddress: settings.org_address ?? DEFAULT_SETTINGS.orgAddress,
          bankAccount1: settings.bank_account_1,
          bankAccount2: settings.bank_account_2,
          bankAccount3: settings.bank_account_3,
          bankAccount4: settings.bank_account_4,
          bankAccount5: settings.bank_account_5,
          reportPreparedByName: settings.report_prepared_by_name ?? "",
          reportPreparedByTitle: settings.report_prepared_by_title ?? DEFAULT_SETTINGS.reportPreparedByTitle,
          reportVerifiedByName: settings.report_verified_by_name ?? "",
          reportVerifiedByTitle: settings.report_verified_by_title ?? DEFAULT_SETTINGS.reportVerifiedByTitle,
          reportApprovedByName: settings.report_approved_by_name ?? "",
          reportApprovedByTitle: settings.report_approved_by_title ?? DEFAULT_SETTINGS.reportApprovedByTitle,
          updatedAt: settings.updated_at,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
