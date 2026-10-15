import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CONFIG, isConfigured } from "./config.js";

export const supabase = isConfigured()
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Demo data shown while Supabase is not configured, so the UI can be previewed.
export const DEMO = {
  vacancies: [
    {
      id: "af1d2b4d-d37a-49f6-8e15-07befa0695ae",
      content: "https://www.linkedin.com/jobs/view/4464014608/",
      source: "telegram",
      created_at: new Date(Date.now() - 24 * 3600e3).toISOString(),
    },
    {
      id: "d1",
      content:
        "🚨 مطلوب فورًا | Medical Claims Specialist\n\n🏢 شركة رعاية طبية كبرى — مدينة نصر\n💰 الراتب: 9,000 – 12,000 ج.م\n⏰ شيفت صباحي 9 ص – 5 م\n✅ خبرة سنة على الأقل في Medical Insurance\n\n📲 للتقديم واتساب: https://wa.me/201000000000",
      source: "telegram",
      created_at: new Date(Date.now() - 3 * 3600e3).toISOString(),
    },
    {
      id: "d2",
      content:
        "We're hiring 👩‍⚕️ Approval Doctor (Pre-authorization)\n\n📍 New Cairo — hybrid\n🩺 Licensed physician, 1–3 yrs TPA experience\n🕑 Night shift available (+ allowance)\n\nSend your CV via WhatsApp: +20 111 000 0000",
      source: "web",
      created_at: new Date(Date.now() - 30 * 3600e3).toISOString(),
    },
    {
      id: "d3",
      content:
        "Call Center Agents — Medical Network 📞\n\n• Fresh grads welcome\n• Fluent English is a plus\n• Training provided\n• Location: Maadi\n\nContact: https://wa.me/201200000000",
      source: "telegram",
      created_at: new Date(Date.now() - 4 * 86400e3).toISOString(),
    },
    {
      id: "d4",
      content:
        "📢 Senior Medical Auditor & Underwriter\n\n🏥 Leading Health Insurance Organization — Dokki\n💼 4+ years of underwriting & clinical audit experience\n🎯 Attractive package + Medical Insurance + Bonus\n\n📝 Apply via Google Form:\nhttps://forms.gle/MedInsureApplication",
      source: "telegram",
      created_at: new Date(Date.now() - 5 * 86400e3).toISOString(),
    },
  ],
  interviews: [
    {
      id: "i1",
      company_name: "Bupa",
      position: "Medical Approvals Doctor",
      topics: "They asked about my experience with ICD-10, how I handle difficult providers, and a clinical scenario about pre-existing conditions.",
      pdf_link: "",
      hr_name: "Mr. Tarek",
      hr_phone: "+201000000000",
      hr_email: "tarek@example.com",
      created_at: new Date(Date.now() - 5 * 3600e3).toISOString(),
    },
  ],
  community: [
    {
      id: "c1",
      author_name: "Dr. Mona",
      message: "Does anyone have experience with the pre-approval workflow at large TPAs? What KPIs do they track?",
      source: "web",
      created_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
    },
    {
      id: "c2",
      author_name: "أحمد",
      message: "أنصح أي حد جديد في المجال يتعلم ICD-10 و CPT codes كويس، دي أهم حاجة في الـ claims.",
      source: "telegram",
      created_at: new Date(Date.now() - 20 * 3600e3).toISOString(),
    },
  ],
  comments: [
    {
      id: "r1",
      post_id: "c1",
      author_name: "Karim",
      message: "Mostly turnaround time (TAT) per request and approval/rejection ratio. Some also track call-backs from providers.",
      source: "web",
      created_at: new Date(Date.now() - 1.5 * 3600e3).toISOString(),
    },
    {
      id: "r2",
      post_id: "c1",
      author_name: "سارة",
      message: "عندنا كمان بيقيسوا نسبة الأخطاء في الـ coding شهريًا.",
      source: "web",
      created_at: new Date(Date.now() - 1 * 3600e3).toISOString(),
    },
  ],
};
