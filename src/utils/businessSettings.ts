import api from "@/lib/api";

export interface BusinessSettings {
  taxRate: number;
  rentalDiscountRate: number;
  orgName: string;
  regionName: string;
  councilName: string;
  orgAddress: string;
  bankAccount1: string;
  bankAccount2: string;
  bankAccount3: string;
  bankAccount4: string;
  bankAccount5: string;
  reportPreparedByName: string;
  reportPreparedByTitle: string;
  reportVerifiedByName: string;
  reportVerifiedByTitle: string;
  reportApprovedByName: string;
  reportApprovedByTitle: string;
}

const KEY = "gsp-business-settings";
export const BUSINESS_SETTINGS_UPDATED_EVENT = "gsp:business-settings-updated";

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
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
};

const mergeBusinessSettings = (settings?: Partial<BusinessSettings> | null): BusinessSettings => ({
  ...DEFAULT_BUSINESS_SETTINGS,
  ...(settings ?? {}),
});

export const readBusinessSettings = (): BusinessSettings => {
  if (typeof window === "undefined") return DEFAULT_BUSINESS_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? mergeBusinessSettings(JSON.parse(raw) as Partial<BusinessSettings>) : DEFAULT_BUSINESS_SETTINGS;
  } catch {
    return DEFAULT_BUSINESS_SETTINGS;
  }
};

export const writeBusinessSettings = (settings: BusinessSettings): BusinessSettings => {
  const merged = mergeBusinessSettings(settings);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent(BUSINESS_SETTINGS_UPDATED_EVENT, { detail: merged }));
    } catch {
      // Ignore storage errors
    }
  }
  return merged;
};

export const fetchBusinessSettings = async (): Promise<BusinessSettings> => {
  try {
    const response = await api.get<{ settings: BusinessSettings | null; defaults?: BusinessSettings }>("/business-settings");
    const merged = mergeBusinessSettings(response.settings ?? response.defaults);
    return writeBusinessSettings(merged);
  } catch {
    return readBusinessSettings();
  }
};

export const saveBusinessSettings = async (settings: BusinessSettings): Promise<BusinessSettings> => {
  const response = await api.put<{ settings: BusinessSettings }>("/business-settings", settings);
  return writeBusinessSettings(response.settings);
};
