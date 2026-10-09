import { supabase, DEMO } from "./supabase.js";
import { CONFIG } from "./config.js";
import { t, getLang, onLangChange } from "./i18n.js";
import { linkify, timeAgo, fullDate, toast, ICON, revealOnScroll, escapeHtml, initials } from "./ui.js";

const feed = document.getElementById("community-feed");
const form = document.getElementById("community-form");
const nameIn = document.getElementById("author-name");
const msgIn = document.getElementById("message");
const counter = document.getElementById("char-count");
const submitBtn = document.getElementById("submit-post");
const moreBtn = document.getElementById("load-more-community");

const MAX = 2000;
const REPLY_MAX = 1000;
const COOLDOWN_MS = 60_000;
const REPLY_COOLDOWN_MS = 30_000;

let posts = [];
let page = 0;
let done = false;
const openThreads = new Set();   // post ids with expanded replies
const comments = new Map();      // post id → approved replies (oldest first)
const loadingThreads = new Set();

const savedName = () => localStorage.getItem("mih-name") || "";
const ICON_REPLY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

const replyLabel = (n) => {
  if (getLang() === "ar") return n === 0 ? t("reply") : `${n.toLocaleString("ar-EG")} ${n >= 3 && n <= 10 ? t("replyMany") : t("replyOne")}`;
  return n === 0 ? t("reply") : `${n} ${n === 1 ? t("replyOne") : t("replyMany")}`;
};

/* ───────────── templates ───────────── */
const skeleton = () =>
  Array.from({ length: 3 }, () => `
    <div class="glass-card p-5 flex gap-4">
      <div class="skeleton w-11 h-11 !rounded-xl shrink-0"></div>
      <div class="flex-1 space-y-3"><div class="skeleton h-4 w-1/4"></div><div class="skeleton h-4 w-full"></div><div class="skeleton h-4 w-3/4"></div></div>
    </div>`).join("");

const commentItem = (c) => `
  <li class="flex gap-3 reply-in">
    <div class="avatar avatar-sm" aria-hidden="true">${escapeHtml(initials(c.author_name))}</div>
    <div class="min-w-0 flex-1 reply-bubble">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span class="font-semibold text-sm" dir="auto">${escapeHtml(c.author_name || "—")}</span>
        <time class="text-xs text-slate-500" datetime="${c.created_at}" title="${fullDate(c.created_at)}">${timeAgo(c.created_at)}</time>
      </div>
      <p class="post-body text-sm mt-1" dir="auto">${linkify(c.message)}</p>
    </div>
  </li>`;

function threadPanel(p) {
  if (!openThreads.has(p.id)) return "";
  const list = comments.get(p.id);
  const body = loadingThreads.has(p.id) || !list
    ? `<div class="space-y-2"><div class="skeleton h-4 w-2/3"></div><div class="skeleton h-4 w-1/2"></div></div>`
    : list.length
      ? `<ul class="space-y-3">${list.map(commentItem).join("")}</ul>`
      : `<p class="text-sm text-slate-500">${t("noReplies")}</p>`;
  return `
    <div class="thread mt-4 ps-4 border-s-2 border-teal-400/25 space-y-4" data-thread="${p.id}">
      ${body}
      <form class="reply-form space-y-2" data-reply-form="${p.id}" novalidate>
        <div class="flex flex-col sm:flex-row gap-2">
          <input name="author_name" type="text" maxlength="60" dir="auto" autocomplete="name"
                 class="field !py-2 text-sm sm:max-w-[11rem]" placeholder="${t("namePh")}" aria-label="${t("nameLabel")}" value="${escapeHtml(savedName())}" />
          <input name="message" type="text" maxlength="${REPLY_MAX}" dir="auto"
                 class="field !py-2 text-sm flex-1" placeholder="${t("replyPh")}" aria-label="${t("replyPh")}" />
          <button type="submit" class="btn-primary !py-2 text-sm">${t("sendReply")}</button>
        </div>
        <input name="website" type="text" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true" />
      </form>
    </div>`;
}

function item(p, i) {
  const n = comments.get(p.id)?.length ?? p.reply_count ?? 0;
  const open = openThreads.has(p.id);
  return `
  <article id="p-${escapeHtml(p.id)}" data-post="${escapeHtml(p.id)}" class="glass-card hoverable p-5 flex gap-4 reveal" style="animation-delay:${(i % 6) * 60}ms">
    <div class="avatar" aria-hidden="true">${escapeHtml(initials(p.author_name))}</div>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 class="font-semibold" dir="auto">${escapeHtml(p.author_name || "—")}</h3>
        <span class="inline-flex items-center gap-1 text-xs text-slate-500">${p.source === "telegram" ? ICON.telegram : ICON.globe}
          <time datetime="${p.created_at}" title="${fullDate(p.created_at)}">${timeAgo(p.created_at)}</time></span>
      </div>
      <p class="post-body mt-2 text-[15px]" dir="auto">${linkify(p.message)}</p>
      <button type="button" class="reply-toggle ${open ? "is-open" : ""}" data-toggle-thread aria-expanded="${open}">
        ${ICON_REPLY}<span>${open ? t("hideReplies") : replyLabel(n)}</span>
      </button>
      ${threadPanel(p)}
    </div>
  </article>`;
}

/* ───────────── rendering ───────────── */
function render() {
  feed.innerHTML = posts.length
    ? posts.map(item).join("")
    : `<div class="glass-card p-12 text-center text-slate-400">${t("emptyCom")}</div>`;
  revealOnScroll(feed);
  moreBtn.classList.toggle("hidden", done || !posts.length);
}

/** Re-render a single post card in place (keeps scroll position & other threads intact). */
function rerenderPost(id, focusReply = false) {
  const idx = posts.findIndex((p) => p.id === id);
  const el = feed.querySelector(`[data-post="${CSS.escape(id)}"]`);
  if (idx < 0 || !el) return;
  const tpl = document.createElement("template");
  tpl.innerHTML = item(posts[idx], 0).trim();
  const fresh = tpl.content.firstElementChild;
  fresh.classList.add("in");
  fresh.style.animation = "none";
  el.replaceWith(fresh);
  if (focusReply) fresh.querySelector('[data-reply-form] input[name="message"]')?.focus();
}

/* ───────────── data ───────────── */
async function load(reset = false) {
  if (reset) { page = 0; posts = []; done = false; feed.innerHTML = skeleton(); }
  try {
    if (!supabase) {
      posts = DEMO.community.map((p) => ({ ...p, reply_count: DEMO.comments.filter((c) => c.post_id === p.id).length }));
      done = true;
      return render();
    }
    const from = page * CONFIG.PAGE_SIZE;
    const { data, error } = await supabase
      .from("community_posts")
      .select("id, author_name, message, source, created_at, community_comments(count)")
      .eq("is_approved", true)
      .order("created_at", { ascending: false })
      .range(from, from + CONFIG.PAGE_SIZE - 1);
    if (error) throw error;
    posts = posts.concat(data.map((p) => ({ ...p, reply_count: p.community_comments?.[0]?.count ?? 0 })));
    done = data.length < CONFIG.PAGE_SIZE;
    page++;
    render();
  } catch (e) {
    console.error(e);
    feed.innerHTML = `<div class="glass-card p-12 text-center text-red-300">${t("loadError")}</div>`;
  }
}

async function loadComments(postId) {
  loadingThreads.add(postId);
  rerenderPost(postId);
  try {
    if (!supabase) {
      await new Promise((r) => setTimeout(r, 250));
      comments.set(postId, DEMO.comments.filter((c) => c.post_id === postId));
    } else {
      const { data, error } = await supabase
        .from("community_comments")
        .select("id, post_id, author_name, message, source, created_at")
        .eq("post_id", postId)
        .eq("is_approved", true)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      comments.set(postId, data);
    }
  } catch (e) {
    console.error(e);
    toast(t("loadError"), "err");
    openThreads.delete(postId);
  } finally {
    loadingThreads.delete(postId);
    rerenderPost(postId, true);
  }
}

/* ───────────── thread interactions ───────────── */
feed.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-toggle-thread]");
  if (!btn) return;
  const id = btn.closest("[data-post]").dataset.post;
  if (openThreads.has(id)) {
    openThreads.delete(id);
    rerenderPost(id);
  } else {
    openThreads.add(id);
    comments.has(id) ? rerenderPost(id, true) : loadComments(id);
  }
});

feed.addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-reply-form]");
  if (!f) return;
  e.preventDefault();
  if (f.website.value) return; // honeypot

  const post_id = f.dataset.replyForm;
  const author_name = f.author_name.value.trim();
  const message = f.message.value.trim();
  if (author_name.length < 2 || message.length < 2) return toast(t("replyValidation"), "err");

  const last = Number(localStorage.getItem("mih-last-reply") || 0);
  if (Date.now() - last < REPLY_COOLDOWN_MS) return toast(t("cooldown"), "err");

  const btn = f.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = t("sending");
  try {
    if (supabase) {
      const { error } = await supabase.from("community_comments").insert({ post_id, author_name, message, source: "web", is_approved: true });
      if (error) throw error;
    } else {
      await new Promise((r) => setTimeout(r, 500));
    }
    localStorage.setItem("mih-last-reply", String(Date.now()));
    localStorage.setItem("mih-name", author_name);
    f.message.value = "";
    toast(t("replySubmitted"));
    
    // Automatically reload replies for this thread
    if (supabase) loadReplies(post_id, f.closest(".post-card").querySelector(".replies-container"));
  } catch (err) {
    console.error(err);
    toast(t("submitError"), "err");
  } finally {
    btn.disabled = false;
    btn.textContent = t("sendReply");
  }
});

/* ───────────── new thread form ───────────── */
const updateCounter = () => {
  counter.textContent = `${msgIn.value.length} / ${MAX}`;
  counter.classList.toggle("text-red-300", msgIn.value.length > MAX * 0.95);
};
msgIn.addEventListener("input", updateCounter);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (form.website.value) return; // honeypot — silently drop bots

  const author_name = nameIn.value.trim();
  const message = msgIn.value.trim();
  if (author_name.length < 2 || message.length < 3) return toast(t("validation"), "err");

  const last = Number(localStorage.getItem("mih-last-post") || 0);
  if (Date.now() - last < COOLDOWN_MS) return toast(t("cooldown"), "err");

  submitBtn.disabled = true;
  submitBtn.textContent = t("sending");
  try {
    if (supabase) {
      const { error } = await supabase.from("community_posts").insert({ author_name, message, source: "web", is_approved: true });
      if (error) throw error;
    } else {
      await new Promise((r) => setTimeout(r, 600));
    }
    localStorage.setItem("mih-last-post", String(Date.now()));
    localStorage.setItem("mih-name", author_name);
    msgIn.value = "";
    updateCounter();
    toast(t("submitted"));
    
    // Automatically reload the feed
    if (supabase) fetchPage(true);
  } catch (err) {
    console.error(err);
    toast(t("submitError"), "err");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t("submit");
  }
});

nameIn.value = savedName();
moreBtn.addEventListener("click", () => load());
onLangChange(() => { posts.length && render(); submitBtn.textContent = t("submit"); });
updateCounter();
await load(true);

// Deep link: community.html#p-<id> opens that thread.
if (location.hash.startsWith("#p-")) {
  const id = decodeURIComponent(location.hash.slice(3));
  if (posts.some((p) => p.id === id)) {
    openThreads.add(id);
    await loadComments(id);
    document.getElementById(`p-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
