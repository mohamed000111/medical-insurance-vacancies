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
const ogCache = new Map();
const URL_REGEX = /(https?:\/\/[^\s<)\]"'\*]+)/gi;
const EGYPT_PHONE_REGEX = /(?:\+?20[\s-]?|\b0)(1[0125](?:[\s-]?\d){8})\b/g;

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

  // Capped at 2 previews to keep card compact and clean
  return previews.slice(0, 2);
}

function renderPreviewsHtml(previews, vid) {
  if (!previews || !previews.length) return "";

  const cardsHtml = previews.map((p, idx) => {
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
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok) return;
      const json = await res.json();
      const data = json?.data;
      if (data && (data.title || data.image)) {
        ogCache.set(url, data);
        applyOgData(cardEl, data);
      }
    } catch {
      // Silent fallback
    }
  });
}

function applyOgData(cardEl, data) {
  const titleEl = cardEl.querySelector(".og-title");
  const descEl = cardEl.querySelector(".og-desc");
  const thumbWrap = cardEl.querySelector(".og-thumb-wrap");

  if (titleEl && data.title) {
    titleEl.textContent = data.title;
  }
  if (descEl && (data.description || data.publisher)) {
    descEl.textContent = data.description || data.publisher;
  }
  if (thumbWrap && data.image?.url) {
    thumbWrap.innerHTML = `<img src="${escapeHtml(data.image.url)}" class="preview-thumb" alt="Preview" loading="lazy" />`;
    thumbWrap.classList.remove("preview-icon-wrapper");
  } else if (thumbWrap && data.logo?.url) {
    thumbWrap.innerHTML = `<img src="${escapeHtml(data.logo.url)}" class="w-6 h-6 object-contain" alt="Logo" loading="lazy" />`;
  }
}

function card(v, i) {
  const src = v.source === "web" ? t("srcWeb") : t("srcTelegram");
  const long = v.content.length > 420 || v.content.split("\n").length > 11;
  const previews = extractPreviews(v.content);

  return `
  <article id="v-${escapeHtml(v.id)}" class="glass-card hoverable glow-border p-6 flex flex-col reveal" style="animation-delay:${(i % 6) * 60}ms">
    <div class="flex items-center justify-between gap-3 mb-4">
      <span class="inline-flex items-center gap-2 text-xs text-slate-400">${ICON.clock}<time datetime="${v.created_at}" title="${fullDate(v.created_at)}">${timeAgo(v.created_at)}</time></span>
      ${isNew(v.created_at) ? `<span class="badge-new">${t("newBadge")}</span>` : ""}
    </div>
    <div class="post-body text-[15px] ${long ? "clamp" : ""}" dir="auto">${linkify(v.content)}</div>
    ${long ? `<button type="button" class="expand-btn self-start mt-2 text-sm font-semibold text-teal-300 hover:text-teal-200" data-more>+ ${t("showMore")}</button>` : ""}
    
    ${renderPreviewsHtml(previews, v.id)}

    <div class="grow"></div>
    <footer class="mt-5 pt-5 border-t border-white/5 flex items-center justify-between gap-3 text-xs text-slate-400">
      <span class="inline-flex items-center gap-1.5">${v.source === "web" ? ICON.globe : ICON.telegram}${t("via")} ${src} · ${fullDate(v.created_at)}</span>
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
  } else if (e.target.closest("[data-copy]")) {
    await navigator.clipboard.writeText(v.content);
    toast(t("copied"));
  } else if (e.target.closest("[data-share]")) {
    const url = `${location.origin}${location.pathname}#${art.id}`;
    if (navigator.share) navigator.share({ title: t("vacTitle"), text: v.content.slice(0, 140), url }).catch(() => {});
    else { await navigator.clipboard.writeText(url); toast(t("copied")); }
  }
});

onLangChange(() => items.length && render());

await fetchPage(true);

// deep-link highlight (#v-<id>)
if (location.hash.startsWith("#v-")) {
  const el = document.getElementById(location.hash.slice(1));
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("ring-2", "ring-teal-400"); }
}
