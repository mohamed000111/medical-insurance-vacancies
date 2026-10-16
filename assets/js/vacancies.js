import { supabase, DEMO } from "./supabase.js";
import { CONFIG } from "./config.js";
import { t, onLangChange } from "./i18n.js";
import { linkify, timeAgo, fullDate, isNew, toast, ICON, revealOnScroll, escapeHtml } from "./ui.js";

const list = document.getElementById("vacancy-list");
const search = document.getElementById("vacancy-search");
const moreBtn = document.getElementById("load-more");
const countEl = document.getElementById("result-count");

let items = [];
let page = 0;
let query = "";
let done = false;
let loading = false;

const skeleton = () =>
  Array.from({ length: 4 }, () => `
    <div class="glass-card p-6 space-y-3">
      <div class="skeleton h-5 w-1/3"></div><div class="skeleton h-4 w-full"></div>
      <div class="skeleton h-4 w-5/6"></div><div class="skeleton h-4 w-2/3"></div>
      <div class="skeleton h-4 w-1/2 mt-6"></div>
    </div>`).join("");

/* ───────────── Link Previews Engine ───────────── */
const OG_STORAGE_KEY = "medinsure_og_cache_v2";

function loadOgCache() {
  const map = new Map();
  try {
    const raw = localStorage.getItem(OG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        map.set(k, v);
      }
    }
  } catch {}
  return map;
}

const ogCache = loadOgCache();

function saveOgCache(url, data) {
  if (!url || !data) return;
  ogCache.set(url, data);
  try {
    const obj = {};
    let count = 0;
    for (const [k, v] of ogCache.entries()) {
      if (count++ > 80) break;
      obj[k] = v;
    }
    localStorage.setItem(OG_STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

const URL_REGEX = /(https?:\/\/[^\s<)\]"'\*]+)/gi;
const EMAIL_REGEX = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g;
const EGYPT_PHONE_REGEX = /(?:\+?20[\s-]?|\b0)(1[0125](?:[\s-]?\d){8})\b/g;

/** Checks if the raw text is solely (or essentially) a URL */
export function isLinkAlone(rawText = "") {
  if (!rawText || typeof rawText !== "string") return false;
  const trimmed = rawText.trim();
  if (!trimmed) return false;
  const urls = trimmed.match(URL_REGEX);
  if (!urls || !urls.length) return false;
  const stripped = trimmed.replace(URL_REGEX, "").replace(/[\s\r\n\t.,;:!?)\]'"\-_/\\#*~`]+/g, "");
  return stripped.length <= 15;
}

function extractPreviews(rawText = "") {
  const previews = [];
  const seen = new Set();

  // 1. Explicit URLs
  const urls = rawText.match(URL_REGEX) || [];
  for (const rawUrl of urls) {
    let cleanUrl = rawUrl.replace(/[)\]*_"'>]+$/, "");
    if (seen.has(cleanUrl)) continue;
    seen.add(cleanUrl);

    try {
      let parsed = new URL(cleanUrl);
      let host = parsed.hostname.toLowerCase();

      // Unwrap LinkedIn safety redirects: https://www.linkedin.com/safety/go/?url=...
      if (host.includes("linkedin.com") && parsed.pathname.includes("/safety/go")) {
        const unwrapped = parsed.searchParams.get("url");
        if (unwrapped) {
          cleanUrl = unwrapped;
          parsed = new URL(cleanUrl);
          host = parsed.hostname.toLowerCase();
        }
      }

      // WhatsApp links
      if (host.includes("wa.me") || host.includes("whatsapp.com")) {
        const phone = parsed.pathname.replace(/\D/g, "") || parsed.searchParams.get("phone") || "";
        const formatted = phone.startsWith("20") ? "0" + phone.slice(2) : (phone ? `+${phone}` : "WhatsApp");
        previews.push({
          type: "whatsapp",
          url: phone ? `https://wa.me/${phone}` : cleanUrl,
          displayPhone: formatted,
          hostname: "wa.me"
        });
        continue;
      }

      // Application Forms (Google Forms, Microsoft Forms, Typeform)
      if (host.includes("forms.gle") || host.includes("docs.google.com") || host.includes("typeform.com") || host.includes("forms.office.com")) {
        previews.push({
          type: "form",
          url: cleanUrl,
          title: host.includes("forms.gle") || host.includes("google") ? "Google Forms" : "Application Form",
          hostname: parsed.hostname
        });
        continue;
      }

      // LinkedIn Posts or Job postings
      if (host.includes("linkedin.com") || host.includes("lnkd.in")) {
        previews.push({
          type: "linkedin",
          url: cleanUrl,
          hostname: "linkedin.com"
        });
        continue;
      }

      // External website / job link
      previews.push({
        type: "web",
        url: cleanUrl,
        hostname: parsed.hostname
      });
    } catch {
      // Ignore invalid URL
    }
  }

  // 2. Phone numbers (if no explicit WhatsApp link was already added)
  const hasWa = previews.some(p => p.type === "whatsapp");
  if (!hasWa) {
    const phones = [...rawText.matchAll(EGYPT_PHONE_REGEX)];
    if (phones.length > 0) {
      const match = phones[0];
      const digits = "20" + match[1].replace(/\D/g, "");
      const formatted = "0" + match[1].replace(/\D/g, "");
      previews.push({
        type: "whatsapp",
        url: `https://wa.me/${digits}`,
        displayPhone: formatted,
        hostname: "wa.me"
      });
    }
  }

  // 3. Email addresses
  const emails = rawText.match(EMAIL_REGEX) || [];
  const seenMail = new Set();
  for (const raw of emails) {
    const email = raw.replace(/[.,;:]+$/, "");
    const key = email.toLowerCase();
    if (seenMail.has(key)) continue;
    seenMail.add(key);
    previews.push({
      type: "mail",
      url: `mailto:${email}`,
      displayEmail: email,
      hostname: email.split("@")[1]
    });
    break;
  }

  return previews.slice(0, 3);
}

/**
 * Renders the prominent "Hero Link Preview Card" when a link is alone.
 * Shows title, rich description, logo/thumbnail image, badges, and CTA button.
 */
function renderAlonePreviewHtml(previews, vid) {
  if (!previews || !previews.length) return "";
  const p = previews[0];
  const cardId = `alone-og-${vid}`;

  // Check if we have pre-cached data
  const cached = ogCache.get(p.url);

  let icon = ICON.link;
  let themeClass = "web-theme";
  let badgeLabel = p.hostname;
  let badgeClass = "bg-teal-500/20 text-teal-300 border border-teal-500/30";
  let ctaLabel = t("previewVisit");
  let ctaBtnClass = "web-btn";
  let defaultTitle = `${p.hostname} ${t("previewJobLink")}`;
  let defaultDesc = t("previewJobDetails");

  if (p.type === "linkedin") {
    icon = ICON.linkedin;
    themeClass = "linkedin-theme";
    badgeLabel = t("previewLinkedIn");
    badgeClass = "bg-sky-500/20 text-sky-300 border border-sky-500/30";
    ctaLabel = t("previewOpenLinkedIn");
    ctaBtnClass = "linkedin-btn";
    defaultTitle = "LinkedIn Job Opportunity";
    defaultDesc = t("previewJobDetails");
  } else if (p.type === "form") {
    icon = ICON.form;
    themeClass = "form-theme";
    badgeLabel = t("previewForm");
    badgeClass = "bg-purple-500/20 text-purple-300 border border-purple-500/30";
    ctaLabel = t("previewOpenForm");
    ctaBtnClass = "form-btn";
    defaultTitle = p.title || "Online Application Form";
    defaultDesc = t("previewFormDesc");
  } else if (p.type === "whatsapp") {
    icon = ICON.whatsapp;
    themeClass = "wa-theme";
    badgeLabel = t("previewApplyWa");
    badgeClass = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
    ctaLabel = t("previewChat");
    ctaBtnClass = "wa-btn";
    defaultTitle = `WhatsApp (${p.displayPhone || "Direct"})`;
    defaultDesc = t("previewWaDesc");
  }

  const finalTitle = cached?.title || defaultTitle;
  const finalDesc = cached?.description || cached?.publisher || defaultDesc;
  const imgUrl = cached?.image?.url || cached?.logo?.url || "";

  // Display URL (truncated neatly without scheme)
  const displayUrl = p.url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

  return `
  <div class="alone-preview-box">
    <a id="${cardId}" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer"
       class="alone-preview-card ${themeClass} glow-border group og-fetchable"
       data-og-url="${escapeHtml(p.url)}">
      
      <!-- Top header: Badge + Hostname + External Arrow -->
      <div class="flex items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold ${badgeClass}">
            ${icon}
            <span>${escapeHtml(badgeLabel)}</span>
          </span>
          <span class="text-xs text-slate-400 font-mono truncate" dir="ltr">${escapeHtml(p.hostname)}</span>
        </div>
        <span class="text-slate-400 group-hover:text-teal-300 transition-colors">${ICON.external}</span>
      </div>

      <!-- Main body: Thumbnail (if any) + Title + Description -->
      <div class="flex flex-col sm:flex-row gap-3.5 items-start">
        <div class="og-thumb-wrap ${imgUrl ? '' : 'hidden'} shrink-0">
          ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" class="alone-thumb-img" alt="Preview" loading="lazy" />` : ""}
        </div>
        <div class="min-w-0 flex-1 space-y-1.5">
          <h3 class="og-title text-[15px] sm:text-base font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-2 leading-snug" dir="auto">
            ${escapeHtml(finalTitle)}
          </h3>
          <p class="og-desc text-xs sm:text-[13px] text-slate-300 line-clamp-3 leading-relaxed" dir="auto">
            ${escapeHtml(finalDesc)}
          </p>
        </div>
      </div>

      <!-- Footer: Clean URL + CTA Button -->
      <div class="mt-3.5 pt-2.5 border-t border-white/5 flex items-center justify-between gap-3 text-xs">
        <span class="text-slate-400 truncate max-w-[55%] font-mono text-[11px]" dir="ltr">${escapeHtml(displayUrl)}</span>
        <span class="alone-cta-btn ${ctaBtnClass}">
          <span>${ctaLabel}</span>
          ${ICON.external}
        </span>
      </div>
    </a>
  </div>`;
}

function renderPreviewsHtml(previews, vid) {
  if (!previews || !previews.length) return "";

  const cardsHtml = previews.map((p, idx) => {
    if (p.type === "mail") {
      return `
      <a href="${escapeHtml(p.url)}" class="preview-card mail-card flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="preview-icon-wrapper mail">${ICON.mail}</span>
          <div class="min-w-0">
            <div class="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              ${t("previewApplyMail")}
              <span class="text-[10px] bg-amber-500/20 text-amber-200 px-1.5 py-0.5 rounded font-mono">Email</span>
            </div>
            <div class="text-[13px] text-slate-300 font-medium truncate font-mono" dir="ltr">${escapeHtml(p.displayEmail)}</div>
          </div>
        </div>
        <span class="preview-badge-btn bg-amber-500/15 text-amber-200 border border-amber-500/30">
          ${t("previewSendMail")} ${ICON.external}
        </span>
      </a>`;
    }

    if (p.type === "whatsapp") {
      return `
      <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="preview-card wa-card flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="preview-icon-wrapper wa">${ICON.whatsapp}</span>
          <div class="min-w-0">
            <div class="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              ${t("previewApplyWa")}
              <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">WhatsApp</span>
            </div>
            <div class="text-[13px] text-slate-300 font-medium truncate font-mono" dir="ltr">${escapeHtml(p.displayPhone)}</div>
          </div>
        </div>
        <span class="preview-badge-btn bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          ${t("previewChat")} ${ICON.external}
        </span>
      </a>`;
    }

    if (p.type === "form") {
      return `
      <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="preview-card form-card flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="preview-icon-wrapper form">${ICON.form}</span>
          <div class="min-w-0">
            <div class="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
              ${t("previewForm")}
              <span class="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">Online Form</span>
            </div>
            <div class="text-[13px] text-slate-300 font-medium truncate">${escapeHtml(p.hostname)}</div>
          </div>
        </div>
        <span class="preview-badge-btn bg-purple-500/15 text-purple-300 border border-purple-500/30">
          ${t("previewOpenForm")} ${ICON.external}
        </span>
      </a>`;
    }

    if (p.type === "linkedin") {
      return `
      <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="preview-card linkedin-card flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <span class="preview-icon-wrapper linkedin">${ICON.linkedin}</span>
          <div class="min-w-0">
            <div class="text-xs font-semibold text-sky-400 flex items-center gap-1.5">
              ${t("previewLinkedIn")}
              <span class="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-mono">LinkedIn</span>
            </div>
            <div class="text-[13px] text-slate-300 font-medium truncate">${escapeHtml(p.url)}</div>
          </div>
        </div>
        <span class="preview-badge-btn bg-sky-600/20 text-sky-200 border border-sky-500/30">
          ${t("previewOpenLinkedIn")} ${ICON.external}
        </span>
      </a>`;
    }

    // Web OpenGraph Card (dynamic enricher)
    const cardId = `og-${vid}-${idx}`;
    return `
    <a id="${cardId}" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" 
       class="preview-card flex items-center justify-between gap-3 og-fetchable" 
       data-og-url="${escapeHtml(p.url)}">
      <div class="flex items-center gap-3 min-w-0">
        <div class="og-thumb-wrap preview-icon-wrapper web">
          ${ICON.link}
        </div>
        <div class="min-w-0">
          <div class="og-title text-[13px] font-semibold text-slate-200 truncate">
            ${escapeHtml(p.hostname)}
          </div>
          <div class="og-desc text-xs text-slate-400 truncate">
            ${escapeHtml(p.url)}
          </div>
        </div>
      </div>
      <span class="preview-badge-btn bg-sky-500/15 text-sky-300 border border-sky-500/30">
        ${t("previewVisit")} ${ICON.external}
      </span>
    </a>`;
  }).join("");

  return `<div class="link-preview-box">${cardsHtml}</div>`;
}

function enhanceLinkPreviews() {
  const cards = list.querySelectorAll(".og-fetchable");
  cards.forEach(async (cardEl) => {
    const url = cardEl.getAttribute("data-og-url");
    if (!url) return;

    // Apply from cache if available
    if (ogCache.has(url)) {
      applyOgData(cardEl, ogCache.get(url));
      return;
    }

    try {
      const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return;
      const json = await res.json();
      const data = json?.data;
      if (data && (data.title || data.image || data.description)) {
        saveOgCache(url, data);
        applyOgData(cardEl, data);
      }
    } catch {
      // Silent fallback
    }
  });
}

function applyOgData(cardEl, data) {
  if (!cardEl || !data) return;
  const titleEl = cardEl.querySelector(".og-title");
  const descEl = cardEl.querySelector(".og-desc");
  const thumbWrap = cardEl.querySelector(".og-thumb-wrap");

  if (titleEl && data.title) {
    titleEl.textContent = data.title;
  }
  if (descEl && (data.description || data.publisher)) {
    descEl.textContent = data.description || data.publisher;
  }
  const imgUrl = data.image?.url || data.logo?.url;
  if (thumbWrap && imgUrl) {
    thumbWrap.innerHTML = `<img src="${escapeHtml(imgUrl)}" class="alone-thumb-img preview-thumb" alt="Preview" loading="lazy" />`;
    thumbWrap.classList.remove("hidden");
    thumbWrap.classList.remove("preview-icon-wrapper");
  }
}

function card(v, i) {
  const isVerified = v.source === "web" || v.is_verified_recruiter === true || v.source === "admin";
  const src = v.source === "web" ? t("srcAdmin") : (v.source === "telegram" ? t("srcTelegram") : t("srcWeb"));
  const alone = isLinkAlone(v.content);
  const previews = extractPreviews(v.content);
  const long = !alone && (v.content.length > 420 || v.content.split("\n").length > 11);
  const captionText = alone ? v.content.replace(URL_REGEX, "").trim() : "";

  return `
  <article id="v-${escapeHtml(v.id)}" class="glass-card hoverable glow-border p-6 flex flex-col reveal ${alone ? "alone-card" : ""} ${isVerified ? "verified-card" : ""}" style="animation-delay:${(i % 6) * 60}ms">
    <div class="flex items-center justify-between gap-3 mb-4">
      <span class="inline-flex items-center gap-2 text-xs text-slate-400">${ICON.clock}<time datetime="${v.created_at}" title="${fullDate(v.created_at)}">${timeAgo(v.created_at)}</time></span>
      <div class="flex items-center gap-2">
        ${isVerified ? `
          <span class="badge-verified" title="${t("verifiedRecruiterTip")}">
            <span class="badge-verified-icon">${ICON.verified}</span>
            <span class="badge-verified-text">${t("verifiedRecruiter")}</span>
          </span>` : ""}
        ${isNew(v.created_at) ? `<span class="badge-new">${t("newBadge")}</span>` : ""}
      </div>
    </div>

    ${alone ? `
      ${captionText ? `<div class="text-xs text-slate-400 mb-2 font-medium" dir="auto">${escapeHtml(captionText)}</div>` : ""}
      ${renderAlonePreviewHtml(previews, v.id)}
    ` : `
      <div class="post-body text-[15px] ${long ? "clamp" : ""}" dir="auto">${linkify(v.content)}</div>
      ${long ? `<button type="button" class="expand-btn self-start mt-2 text-sm font-semibold text-teal-300 hover:text-teal-200" data-more>+ ${t("showMore")}</button>` : ""}
      ${renderPreviewsHtml(previews, v.id)}
    `}

    ${isVerified ? `
      <div class="mt-4 pt-3 border-t border-emerald-500/15 flex items-center justify-between gap-3 flex-wrap">
        <span class="text-xs text-emerald-300 font-medium flex items-center gap-1.5">
          ${ICON.verified}
          <span>${t("verifiedApplyDirect")}</span>
        </span>
        <button type="button" class="btn-submit-cv" data-submit-cv="${escapeHtml(v.id)}" data-title="${escapeHtml(v.content.slice(0, 60))}">
          ${ICON.uploadCv}
          <span>${t("submitCv")}</span>
        </button>
      </div>
    ` : ""}

    <div class="grow"></div>
    <footer class="mt-5 pt-5 border-t border-white/5 flex items-center justify-between gap-3 text-xs text-slate-400">
      <span class="inline-flex items-center gap-1.5">${isVerified ? ICON.verifiedShield : (v.source === "telegram" ? ICON.telegram : ICON.globe)}${t("via")} ${src} · ${fullDate(v.created_at)}</span>
      <span class="flex gap-1 items-center">
        <span class="font-mono bg-slate-800/50 px-1.5 py-0.5 rounded select-all mr-2" title="Vacancy UUID">${v.id}</span>
        <button type="button" class="btn-ghost !p-2" data-copy title="${t("copy")}" aria-label="${t("copy")}">${ICON.copy}</button>
        <button type="button" class="btn-ghost !p-2" data-share title="${t("share")}" aria-label="${t("share")}">${ICON.share}</button>
      </span>
    </footer>
  </article>`;
}

function render() {
  if (!items.length) {
    list.innerHTML = `<div class="md:col-span-2 glass-card p-12 text-center text-slate-400">${query ? t("noResults") : t("emptyVac")}</div>`;
  } else {
    list.innerHTML = items.map(card).join("");
    revealOnScroll(list);
    enhanceLinkPreviews();
  }
  moreBtn.classList.toggle("hidden", done || !items.length);
  countEl.textContent = items.length ? `${items.length}${done ? "" : "+"}` : "";
}

async function fetchPage(reset = false) {
  if (loading) return;
  loading = true;
  if (reset) { page = 0; done = false; items = []; list.innerHTML = skeleton(); }
  moreBtn.disabled = true;

  try {
    let rows;
    if (!supabase) {
      const q = query.toLowerCase();
      rows = DEMO.vacancies.filter((v) => v.content.toLowerCase().includes(q));
      done = true;
    } else {
      const from = page * CONFIG.PAGE_SIZE;
      let req = supabase
        .from("vacancies")
        .select("id, content, source, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .range(from, from + CONFIG.PAGE_SIZE - 1);
      if (query) req = req.ilike("content", `%${query.replace(/[%_]/g, "\\$&")}%`);
      const { data, error } = await req;
      if (error) throw error;
      rows = data;
      done = rows.length < CONFIG.PAGE_SIZE;
      page++;
    }
    items = items.concat(rows);
    render();
  } catch (e) {
    console.error(e);
    list.innerHTML = `<div class="md:col-span-2 glass-card p-12 text-center text-red-300">${t("loadError")}</div>`;
  } finally {
    loading = false;
    moreBtn.disabled = false;
  }
}

/* events */
let debounce;
search.addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => { query = search.value.trim(); fetchPage(true); }, 300);
});
moreBtn.addEventListener("click", () => fetchPage());

list.addEventListener("click", async (e) => {
  const art = e.target.closest("article");
  if (!art) return;
  const v = items.find((x) => `v-${x.id}` === art.id);
  if (e.target.closest("[data-more]")) {
    const body = art.querySelector(".post-body");
    const open = body.classList.toggle("clamp");
    e.target.closest("[data-more]").textContent = open ? `+ ${t("showMore")}` : `− ${t("showLess")}`;
  } else if (e.target.closest("[data-submit-cv]")) {
    const btn = e.target.closest("[data-submit-cv]");
    const vid = btn.getAttribute("data-submit-cv");
    openCvModal(vid, v);
  } else if (e.target.closest("[data-copy]")) {
    await navigator.clipboard.writeText(v.content);
    toast(t("copied"));
  } else if (e.target.closest("[data-share]")) {
    const url = `${location.origin}${location.pathname}#${art.id}`;
    if (navigator.share) navigator.share({ title: t("vacTitle"), text: v.content.slice(0, 140), url }).catch(() => {});
    else { await navigator.clipboard.writeText(url); toast(t("copied")); }
  }
});

/* ───────────── CV Submission Modal & Storage ───────────── */
const cvModal = document.getElementById("cv-modal");
const cvModalClose = document.getElementById("cv-modal-close");
const cvModalSub = document.getElementById("cv-modal-sub");
const cvForm = document.getElementById("cv-form");
const cvVacancyId = document.getElementById("cv-vacancy-id");
const cvDropzone = document.getElementById("cv-dropzone");
const cvFileInput = document.getElementById("cv-file-input");
const cvDropzoneContent = document.getElementById("cv-dropzone-content");
const cvFileSelected = document.getElementById("cv-file-selected");
const cvFilename = document.getElementById("cv-filename");
const cvFilesize = document.getElementById("cv-filesize");
const cvRemoveFile = document.getElementById("cv-remove-file");
const cvSubmitBtn = document.getElementById("cv-submit-btn");

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function openCvModal(vid, v) {
  if (!cvModal) return;
  cvForm.reset();
  clearSelectedFile();
  cvVacancyId.value = vid;
  const firstLine = (v?.content || "").trim().split("\n")[0].slice(0, 48);
  cvModalSub.textContent = firstLine ? `${t("submitCvModalSub")}: ${firstLine}...` : `${t("submitCvModalSub")} #${vid.slice(0, 8)}...`;
  cvModal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeCvModal() {
  if (!cvModal) return;
  cvModal.classList.remove("open");
  document.body.style.overflow = "";
}

function setSelectedFile(file) {
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["pdf", "doc", "docx"].includes(ext)) {
    toast(t("invalidFileType"), "err");
    cvFileInput.value = "";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast(t("fileTooLarge"), "err");
    cvFileInput.value = "";
    return;
  }
  cvFilename.textContent = file.name;
  cvFilesize.textContent = formatBytes(file.size);
  cvDropzoneContent.classList.add("hidden");
  cvFileSelected.classList.remove("hidden");
  cvFileSelected.classList.add("flex");
}

function clearSelectedFile() {
  if (cvFileInput) cvFileInput.value = "";
  if (cvDropzoneContent) cvDropzoneContent.classList.remove("hidden");
  if (cvFileSelected) {
    cvFileSelected.classList.add("hidden");
    cvFileSelected.classList.remove("flex");
  }
}

if (cvModal) {
  cvModalClose.addEventListener("click", closeCvModal);
  cvModal.addEventListener("click", (e) => {
    if (e.target === cvModal) closeCvModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && cvModal.classList.contains("open")) closeCvModal();
  });

  cvDropzone.addEventListener("click", (e) => {
    if (e.target.closest("#cv-remove-file")) return;
    cvFileInput.click();
  });

  cvFileInput.addEventListener("change", () => {
    if (cvFileInput.files.length) setSelectedFile(cvFileInput.files[0]);
  });

  cvRemoveFile.addEventListener("click", (e) => {
    e.stopPropagation();
    clearSelectedFile();
  });

  // Drag and drop
  cvDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    cvDropzone.classList.add("dragover");
  });
  cvDropzone.addEventListener("dragleave", () => {
    cvDropzone.classList.remove("dragover");
  });
  cvDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    cvDropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      cvFileInput.files = e.dataTransfer.files;
      setSelectedFile(e.dataTransfer.files[0]);
    }
  });

  // Form submit
  cvForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = cvFileInput.files[0];
    if (!file) {
      toast(t("invalidFileType"), "err");
      return;
    }

    const name = cvForm.applicant_name.value.trim();
    const phone = cvForm.applicant_phone.value.trim();
    const email = cvForm.applicant_email.value.trim();
    const note = cvForm.note.value.trim();
    const vid = cvVacancyId.value;

    if (name.length < 2 || phone.length < 5) {
      toast(t("validation"), "err");
      return;
    }

    cvSubmitBtn.disabled = true;
    cvSubmitBtn.innerHTML = `<span>${t("cvSubmitting")}</span>`;

    try {
      let cvUrl = "";
      if (supabase) {
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${vid}/${Date.now()}_${cleanName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("cv_files")
          .upload(filePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("cv_files")
          .getPublicUrl(filePath);

        cvUrl = urlData?.publicUrl || filePath;

        // Record in vacancy_applications table (safe try/catch)
        try {
          await supabase.from("vacancy_applications").insert({
            vacancy_id: vid.length === 36 ? vid : null,
            applicant_name: name,
            applicant_phone: phone,
            applicant_email: email,
            cv_url: cvUrl,
            file_name: file.name,
            file_size: file.size,
            note: note
          });
        } catch (dbErr) {
          console.warn("Could not record in vacancy_applications table:", dbErr);
        }
      } else {
        // Demo mode fallback
        await new Promise((r) => setTimeout(r, 700));
        const demoCvs = JSON.parse(localStorage.getItem("mih_demo_cvs") || "[]");
        demoCvs.push({
          vacancy_id: vid,
          applicant_name: name,
          applicant_phone: phone,
          applicant_email: email,
          file_name: file.name,
          created_at: new Date().toISOString()
        });
        localStorage.setItem("mih_demo_cvs", JSON.stringify(demoCvs));
      }

      toast(t("cvSuccessMsg"));
      closeCvModal();
      cvForm.reset();
      clearSelectedFile();
    } catch (err) {
      console.error("CV upload failed:", err);
      toast(t("cvErrorMsg"), "err");
    } finally {
      cvSubmitBtn.disabled = false;
      cvSubmitBtn.innerHTML = `${ICON.uploadCv}<span data-i18n="cvSubmitBtn">${t("cvSubmitBtn")}</span>`;
    }
  });
}

onLangChange(() => items.length && render());

await fetchPage(true);

// deep-link highlight (#v-<id>)
if (location.hash.startsWith("#v-")) {
  const el = document.getElementById(location.hash.slice(1));
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("ring-2", "ring-teal-400"); }
}

