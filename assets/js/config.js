// ─────────────────────────────────────────────────────────────
//  Site configuration — edit these values after creating your
//  Supabase project (Project Settings → API).
//  The anon key is SAFE to expose publicly; RLS protects writes.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  SUPABASE_URL: "https://amwesufvpwxxyhgagicy.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_ihlcQM0pugWsp-ztktULyg_TtNyD8BY",

  SITE_NAME_EN: "MedInsure Hub",
  SITE_NAME_AR: "ميد إنشور هب",
  TELEGRAM_URL: "https://t.me/medical_Insurance_1",  // public channel link

  PAGE_SIZE: 12,
  NEW_BADGE_HOURS: 24,
};

export const isConfigured = () =>
  CONFIG.SUPABASE_URL.startsWith("https://") &&
  !CONFIG.SUPABASE_ANON_KEY.startsWith("YOUR_");
