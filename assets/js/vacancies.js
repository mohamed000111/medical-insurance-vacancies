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

function card(v, i) {
  const src = v.source === "web" ? t("srcWeb") : t("srcTelegram");
  const long = v.content.length > 420 || v.content.split("\n").length > 11;
  return `
  <article id="v-${escapeHtml(v.id)}" class="glass-card hoverable glow-border p-6 flex flex-col reveal" style="animation-delay:${(i % 6) * 60}ms">
    <div class="flex items-center justify-between gap-3 mb-4">
      <span class="inline-flex items-center gap-2 text-xs text-slate-400">${ICON.clock}<time datetime="${v.created_at}" title="${fullDate(v.created_at)}">${timeAgo(v.created_at)}</time></span>
      ${isNew(v.created_at) ? `<span class="badge-new">${t("newBadge")}</span>` : ""}
    </div>
    <div class="post-body text-[15px] ${long ? "clamp" : ""}" dir="auto">${linkify(v.content)}</div>
    ${long ? `<button type="button" class="expand-btn self-start mt-2 text-sm font-semibold text-teal-300 hover:text-teal-200" data-more>+ ${t("showMore")}</button>` : ""}
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
