-- ═══════════════════════════════════════════════════════════════
--  0009 — Verified Recruiter Badge Support
--  Vacancies published from the admin portal are marked as verified recruiter posts.
-- ═══════════════════════════════════════════════════════════════

-- Vacancies table already uses `source` check in ('telegram', 'web').
-- In MedInsure Hub, `source = 'web'` denotes vacancies published directly
-- from the authenticated admin portal by verified recruiters.

-- Optional: ensure any web posts are formally verified
comment on column public.vacancies.source is 'Source of the post: telegram (channel sync) or web (admin portal / verified recruiter)';
