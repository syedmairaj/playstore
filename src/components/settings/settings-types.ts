export type SettingsApp = {
  id: string;
  name: string;
  package_name: string | null;
  play_store_url: string | null;
  icon_url: string | null;
};

export type SettingsMember = {
  user_id: string;
  role: string;
  display_name: string;
};

export type SettingsInvitation = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

export type CreditsLedgerEntry = {
  id: string;
  created_at: string;
  amount: number;
  description: string;
  source_type: string;
  meta: Record<string, unknown> | null;
};

export type SettingsTabId = "workspace" | "billing" | "integrations";
