import { CONFIG, isConfigured } from "./config.js";
import { t, getLang, applyLang, toggleLang, onLangChange } from "./i18n.js";

/* ───────────── text helpers ───────────── */
export const escapeHtml = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
// Egyptian mobile numbers: +20 1x xxxx xxxx / 01x xxxx xxxx (spaces or dashes allowed)
const PHONE_RE = /(?:\+?20[\s-]?|\b0)(1[0125](?:[\s-]?\d){8})\b/g;

/** Escape text, then turn URLs and Egyptian mobile numbers into links (display only — storage stays raw). */
export function linkify(raw = "") {
  return raw
    .split(URL_RE)
    .map((part, i) => {
      if (i % 2 === 1) {
        const safe = escapeHtml(part);
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="post-link">${safe}</a>`;
      }
      return escapeHtml(part).replace(PHONE_RE, (m, num) => {
        const digits = "20" + num.replace(/\D/g, "");
        return `<a href="https://wa.me/${digits}" target="_blank" rel="noopener noreferrer" class="post-link">${m}</a>`;
      });
    })
    .join("");
}

export function timeAgo(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(getLang(), { numeric: "auto" });
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [u, s] of units) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), u);
  return t("justNow");
}

export const fullDate = (iso) =>
  new Intl.DateTimeFormat(getLang() === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export const isNew = (iso) => Date.now() - new Date(iso).getTime() < CONFIG.NEW_BADGE_HOURS * 3600e3;

export const initials = (name = "?") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/* ───────────── toast ───────────── */
export function toast(msg, type = "ok") {
  let wrap = document.getElementById("toast-wrap");
  if (!wrap) {
    wrap = Object.assign(document.createElement("div"), { id: "toast-wrap", className: "toast-wrap" });
    document.body.append(wrap);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", "status");
  el.textContent = msg;
  wrap.append(el);
  setTimeout(() => el.classList.add("toast-out"), 3200);
  setTimeout(() => el.remove(), 3700);
}

/* ───────────── icons ───────────── */
export const ICON = {
  logo: `<svg viewBox="0 0 32 32" fill="none" class="w-8 h-8"><defs><linearGradient id="lg" x1="0" y1="0" x2="32" y2="32"><stop stop-color="#2dd4bf"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)"/><path d="M16 8v16M8 16h16" stroke="#04131f" stroke-width="3.2" stroke-linecap="round"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M9.04 15.47 8.9 19.6c.4 0 .58-.17.79-.38l1.9-1.82 3.94 2.88c.72.4 1.24.19 1.43-.67l2.6-12.18c.25-1.08-.4-1.5-1.1-1.24L3.2 11.23c-1.05.41-1.04 1-.18 1.27l3.93 1.22 9.12-5.75c.43-.28.82-.13.5.16"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
};

/* ───────────── shared header / footer ───────────── */
export function initShell(active) {
  const links = [
    ["index.html", "navHome", "home"],
    ["vacancies.html", "navVacancies", "vacancies"],
    ["community.html", "navCommunity", "community"],
    ["interviews.html", "navInterviews", "interviews"],
    ["terms.html", "navTerms", "terms"],
  ];
  const nav = links
    .map(([href, key, id]) =>
      `<a href="${href}" id="nav-${id}" class="nav-link ${active === id ? "nav-active" : ""}" data-i18n="${key}"></a>`)
    .join("");

  document.getElementById("site-header").innerHTML = `
    <div class="glass-bar mx-auto max-w-6xl flex items-center justify-between gap-4 px-4 sm:px-6 py-3 rounded-2xl">
      <a href="index.html" id="brand-link" class="flex items-center gap-3 shrink-0">
        ${ICON.logo}<span class="font-bold text-lg tracking-tight" data-i18n="siteName"></span>
      </a>
      <nav class="hidden md:flex items-center gap-1" aria-label="Main">${nav}</nav>
      <div class="flex items-center gap-2">
        <button id="lang-toggle" class="btn-ghost text-sm" type="button">${ICON.globe}<span data-i18n="langToggle"></span></button>
        <a id="header-telegram" href="${CONFIG.TELEGRAM_URL}" target="_blank" rel="noopener" class="btn-primary text-sm hidden sm:inline-flex">${ICON.telegram}<span data-i18n="joinTelegram"></span></a>
        <button id="menu-toggle" class="btn-ghost md:hidden !px-2" type="button" aria-label="Menu">${ICON.menu}</button>
      </div>
    </div>
    <nav id="mobile-nav" class="md:hidden mx-auto max-w-6xl mt-2 glass-bar rounded-2xl p-2 hidden flex-col" aria-label="Mobile">${nav.replaceAll('id="nav-', 'id="mnav-')}</nav>
    ${isConfigured() ? "" : `<div id="demo-banner" class="mx-auto max-w-6xl mt-3 demo-banner" data-i18n="demoBanner"></div>`}`;

  document.getElementById("site-footer").innerHTML = `
    <div class="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
      <div class="flex items-center gap-3">${ICON.logo}<span><span data-i18n="siteName"></span> · © ${new Date().getFullYear()}</span></div>
      <p>
        <span data-i18n="footer"></span>
        <span class="mx-2 opacity-50">|</span>
        <a href="terms.html" class="hover:text-teal-300 transition" data-i18n="navTerms"></a>
      </p>
      <a href="${CONFIG.TELEGRAM_URL}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 hover:text-teal-300 transition">${ICON.telegram}Telegram</a>
    </div>`;

  document.getElementById("lang-toggle").addEventListener("click", toggleLang);
  const mnav = document.getElementById("mobile-nav");
  document.getElementById("menu-toggle").addEventListener("click", () => {
    mnav.classList.toggle("hidden");
    mnav.classList.toggle("flex");
  });

  onLangChange(() => {
    document.title = `${t(document.body.dataset.titleKey || "siteName")} · ${t("siteName")}`;
  });
  applyLang();
  revealOnScroll();
}

/* ───────────── reveal animation ───────────── */
const io = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.08 })
  : null;

export function revealOnScroll(root = document) {
  root.querySelectorAll(".reveal:not(.in)").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
}
