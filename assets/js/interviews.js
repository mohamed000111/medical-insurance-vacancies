import { supabase, DEMO } from "./supabase.js";
import { CONFIG } from "./config.js";
import { t, onLangChange } from "./i18n.js";
import { linkify, timeAgo, fullDate, toast, ICON, revealOnScroll, escapeHtml, initials } from "./ui.js";

const feed = document.getElementById("interview-feed");
const form = document.getElementById("interview-form");
const submitBtn = document.getElementById("submit-interview");
const moreBtn = document.getElementById("load-more-interview");

const search = document.getElementById("interview-search");

const COOLDOWN_MS = 60_000;

let interviews = [];
let page = 0;
let done = false;
let query = "";

/* ───────────── templates ───────────── */
const skeleton = () =>
  Array.from({ length: 3 }, () => `
    <div class="glass-card p-5 flex gap-4">
      <div class="skeleton w-11 h-11 !rounded-xl shrink-0"></div>
      <div class="flex-1 space-y-3"><div class="skeleton h-4 w-1/4"></div><div class="skeleton h-4 w-full"></div><div class="skeleton h-4 w-3/4"></div></div>
    </div>`).join("");

function item(p, i) {
  const hrDetails = [];
  if (p.hr_name) hrDetails.push(escapeHtml(p.hr_name));
  if (p.hr_phone) hrDetails.push(escapeHtml(p.hr_phone));
  if (p.hr_email) hrDetails.push(escapeHtml(p.hr_email));
  const hrString = hrDetails.length ? `<div class="mt-3 text-xs text-slate-400 bg-white/5 p-3 rounded-lg break-words"><b>HR Info:</b> ${hrDetails.join(" • ")}</div>` : "";
  
  const pdfString = p.pdf_link ? `<div class="mt-3"><a href="${escapeHtml(p.pdf_link)}" target="_blank" rel="noopener noreferrer" class="text-teal-400 hover:underline text-sm inline-flex items-center gap-1">${ICON.globe} Reference Link</a></div>` : "";

  return `
  <article class="glass-card hoverable p-5 flex gap-4 reveal" style="animation-delay:${(i % 6) * 60}ms">
    <div class="avatar" aria-hidden="true">${escapeHtml(initials(p.company_name))}</div>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 class="font-semibold text-lg text-teal-300" dir="auto">${escapeHtml(p.company_name)}</h3>
        <span class="inline-flex items-center gap-1 text-xs text-slate-500">
          <time datetime="${p.created_at}" title="${fullDate(p.created_at)}">${timeAgo(p.created_at)}</time>
        </span>
      </div>
      <p class="font-medium text-slate-200 mt-1" dir="auto">${escapeHtml(p.position)}</p>
      <div class="post-body mt-3 text-[15px] line-clamp-6 cursor-pointer" data-toggle-clamp dir="auto" title="Click to expand/collapse">${linkify(p.topics)}</div>
      ${pdfString}
      ${hrString}
    </div>
  </article>`;
}

/* ───────────── rendering ───────────── */
function render() {
  feed.innerHTML = interviews.length
    ? interviews.map(item).join("")
    : `<div class="glass-card p-12 text-center text-slate-400">${t("emptyInt")}</div>`;
  revealOnScroll(feed);
  moreBtn.classList.toggle("hidden", done || !interviews.length);
}

/* ───────────── data ───────────── */
async function load(reset = false) {
  if (reset) { page = 0; interviews = []; done = false; feed.innerHTML = skeleton(); }
  try {
    if (!supabase) {
      const q = query.toLowerCase();
      interviews = DEMO.interviews.filter(
        (i) => i.company_name.toLowerCase().includes(q) || i.position.toLowerCase().includes(q)
      );
      done = true;
      return render();
    }
    const from = page * CONFIG.PAGE_SIZE;
    let req = supabase
      .from("interviews")
      .select("*")
      .eq("is_approved", true)
      .order("created_at", { ascending: false })
      .range(from, from + CONFIG.PAGE_SIZE - 1);
    
    if (query) {
      const clean = query.replace(/[%_]/g, "\\$&");
      req = req.or(`company_name.ilike.%${clean}%,position.ilike.%${clean}%`);
    }

    const { data, error } = await req;
    interviews = interviews.concat(data);
    done = data.length < CONFIG.PAGE_SIZE;
    page++;
    render();
  } catch (e) {
    console.error(e);
    if (e.code === '42P01') {
      console.warn("Interviews table does not exist yet. Showing demo data.");
      interviews = DEMO.interviews;
      done = true;
      render();
    } else {
      feed.innerHTML = `<div class="glass-card p-12 text-center text-red-300">${t("loadError")}</div>`;
    }
  }
}

/* ───────────── form submission ───────────── */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (form.website.value) return; // honeypot

  const company_name = form.company_name.value.trim();
  const position = form.position.value.trim();
  const topics = form.topics.value.trim();
  const fileInput = form.pdf_link;
  const hr_name = form.hr_name.value.trim();
  const hr_phone = form.hr_phone.value.trim();
  const hr_email = form.hr_email.value.trim();

  if (company_name.length < 2 || position.length < 2 || topics.length < 3) {
    return toast(t("intValidation"), "err");
  }

  const last = Number(localStorage.getItem("mih-last-int") || 0);
  if (Date.now() - last < COOLDOWN_MS) return toast(t("cooldown"), "err");

  submitBtn.disabled = true;
  submitBtn.textContent = t("sending");
  try {
    let pdf_link = "";
    if (supabase && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('interview_files')
        .upload(fileName, file);
        
      if (uploadError) throw uploadError;
      
      const { data: publicUrlData } = supabase.storage
        .from('interview_files')
        .getPublicUrl(fileName);
        
      pdf_link = publicUrlData.publicUrl;
    }

    if (supabase) {
      const { error } = await supabase.from("interviews").insert({
        company_name,
        position,
        topics,
        pdf_link,
        hr_name,
        hr_phone,
        hr_email,
        is_approved: true
      });
      if (error) {
        if (error.code === '42P01') {
           // mock success if table not found yet
        } else {
           throw error;
        }
      }
    } else {
      await new Promise((r) => setTimeout(r, 600));
    }
    localStorage.setItem("mih-last-int", String(Date.now()));
    
    form.reset();
    toast(t("intSubmitted"));
    
    if (supabase) load(true);
  } catch (err) {
    console.error(err);
    toast(t("submitError"), "err");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t("submit");
  }
});

feed.addEventListener("click", (e) => {
  const clampEl = e.target.closest("[data-toggle-clamp]");
  if (clampEl) {
    if (e.target.tagName.toLowerCase() === 'a') return; // let links work naturally
    clampEl.classList.toggle("line-clamp-6");
  }
});

let debounce;
search?.addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    query = search.value.trim();
    load(true);
  }, 300);
});

moreBtn.addEventListener("click", () => load());
onLangChange(() => { interviews.length && render(); submitBtn.textContent = t("submit"); });
await load(true);

async function loadCompanies() {
  const dl = document.getElementById('company-list');
  if (!dl) return;
  
  if (!supabase) {
    const unique = [...new Set(DEMO.interviews.map(i => i.company_name.trim()))];
    dl.innerHTML = unique.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");
    return;
  }
  
  try {
    const { data } = await supabase.from('interviews').select('company_name');
    if (data) {
      const unique = [...new Set(data.map(i => i.company_name.trim()))];
      dl.innerHTML = unique.map(c => `<option value="${escapeHtml(c)}"></option>`).join("");
    }
  } catch (e) { console.error(e); }
}
loadCompanies();
