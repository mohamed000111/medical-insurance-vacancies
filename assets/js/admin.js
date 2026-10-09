import { supabase } from "./supabase.js";

const loginScreen = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

const pendingPostsEl = document.getElementById("pending-posts");
const postsCountEl = document.getElementById("posts-count");

const pendingCommentsEl = document.getElementById("pending-comments");
const commentsCountEl = document.getElementById("comments-count");

const postVacancyForm = document.getElementById("post-vacancy-form");
const vacancyContent = document.getElementById("vacancy-content");
const vacancySubmitBtn = document.getElementById("vacancy-submit-btn");
const vacancyFeedback = document.getElementById("vacancy-feedback");

const manageVacancyForm = document.getElementById("manage-vacancy-form");
const manageUuid = document.getElementById("manage-uuid");
const manageError = document.getElementById("manage-error");

const editVacancyForm = document.getElementById("edit-vacancy-form");
const editVacancyContent = document.getElementById("edit-vacancy-content");
const updateVacancyBtn = document.getElementById("update-vacancy-btn");
const deleteVacancyBtn = document.getElementById("delete-vacancy-btn");
const manageFeedback = document.getElementById("manage-feedback");

const addAdminForm = document.getElementById("add-admin-form");
const newAdminEmail = document.getElementById("new-admin-email");
const newAdminPassword = document.getElementById("new-admin-password");
const addAdminBtn = document.getElementById("add-admin-btn");
const addAdminFeedback = document.getElementById("add-admin-feedback");

let currentEditingUuid = null;

// Escape HTML securely
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    loginScreen.classList.add("hidden");
    dashboardScreen.classList.remove("hidden");
    loadDashboard();
  } else {
    loginScreen.classList.remove("hidden");
    dashboardScreen.classList.add("hidden");
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.textContent = error.message;
    loginError.classList.remove("hidden");
  } else {
    checkSession();
  }
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  checkSession();
});

async function loadDashboard() {
  loadPosts();
  loadComments();
}

async function loadPosts() {
  const { data, error } = await supabase
    .from("community_posts")
    .select("*")
    .eq("is_approved", false)
    .order("created_at", { ascending: false });
    
  if (error) return console.error(error);
  
  postsCountEl.textContent = data.length;
  pendingPostsEl.innerHTML = data.length ? "" : '<p class="text-slate-500">No pending posts.</p>';
  
  data.forEach(post => {
    const div = document.createElement("div");
    div.className = "bg-slate-900 border border-slate-800 p-4 rounded-lg";
    div.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <span class="font-bold text-slate-200">${esc(post.author_name)}</span>
        <span class="text-xs text-slate-500">${new Date(post.created_at).toLocaleString()}</span>
      </div>
      <p class="text-slate-300 text-sm mb-4 whitespace-pre-wrap">${esc(post.message)}</p>
      <div class="flex gap-2">
        <button class="btn btn-green approve-btn" data-id="${post.id}">Approve</button>
        <button class="btn btn-red reject-btn" data-id="${post.id}">Reject (Delete)</button>
      </div>
    `;
    
    div.querySelector(".approve-btn").onclick = () => handleAction("community_posts", post.id, "approve");
    div.querySelector(".reject-btn").onclick = () => handleAction("community_posts", post.id, "reject");
    
    pendingPostsEl.appendChild(div);
  });
}

async function loadComments() {
  const { data, error } = await supabase
    .from("community_comments")
    .select("*, community_posts(message)")
    .eq("is_approved", false)
    .order("created_at", { ascending: false });
    
  if (error) return console.error(error);
  
  commentsCountEl.textContent = data.length;
  pendingCommentsEl.innerHTML = data.length ? "" : '<p class="text-slate-500">No pending comments.</p>';
  
  data.forEach(comment => {
    const div = document.createElement("div");
    div.className = "bg-slate-900 border border-slate-800 p-4 rounded-lg";
    
    const parentMsg = comment.community_posts ? comment.community_posts.message : "Unknown Parent Post";
    const truncatedParent = parentMsg.length > 60 ? parentMsg.substring(0, 60) + '...' : parentMsg;
    
    div.innerHTML = `
      <div class="text-xs text-slate-500 mb-2 border-b border-slate-800 pb-2">
        <span class="text-violet-400">Replying to:</span> ${esc(truncatedParent)}
      </div>
      <div class="flex justify-between items-start mb-2">
        <span class="font-bold text-slate-200">${esc(comment.author_name)}</span>
        <span class="text-xs text-slate-500">${new Date(comment.created_at).toLocaleString()}</span>
      </div>
      <p class="text-slate-300 text-sm mb-4 whitespace-pre-wrap">${esc(comment.message)}</p>
      <div class="flex gap-2">
        <button class="btn btn-green approve-btn" data-id="${comment.id}">Approve</button>
        <button class="btn btn-red reject-btn" data-id="${comment.id}">Reject (Delete)</button>
      </div>
    `;
    
    div.querySelector(".approve-btn").onclick = () => handleAction("community_comments", comment.id, "approve");
    div.querySelector(".reject-btn").onclick = () => handleAction("community_comments", comment.id, "reject");
    
    pendingCommentsEl.appendChild(div);
  });
}

async function handleAction(table, id, action) {
  if (action === "approve") {
    await supabase.from(table).update({ is_approved: true }).eq("id", id);
  } else if (action === "reject") {
    if (confirm("Are you sure you want to delete this?")) {
      await supabase.from(table).delete().eq("id", id);
    } else {
      return;
    }
  }
  
  if (table === "community_posts") loadPosts();
  if (table === "community_comments") loadComments();
}

postVacancyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  vacancySubmitBtn.disabled = true;
  vacancySubmitBtn.textContent = "Publishing...";
  
  const content = vacancyContent.value.trim();
  
  const { error } = await supabase.from("vacancies").insert({ content, source: "web" });
  
  vacancySubmitBtn.disabled = false;
  vacancySubmitBtn.textContent = "Publish Vacancy";
  
  if (error) {
    alert("Failed to publish vacancy: " + error.message);
  } else {
    vacancyContent.value = "";
    vacancyFeedback.classList.remove("hidden");
    setTimeout(() => vacancyFeedback.classList.add("hidden"), 4000);
  }
});

manageVacancyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  manageError.classList.add("hidden");
  editVacancyForm.classList.add("hidden");
  const id = manageUuid.value.trim();
  
  const { data, error } = await supabase.from("vacancies").select("content").eq("id", id).single();
  
  if (error || !data) {
    manageError.classList.remove("hidden");
  } else {
    currentEditingUuid = id;
    editVacancyContent.value = data.content;
    editVacancyForm.classList.remove("hidden");
  }
});

editVacancyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentEditingUuid) return;
  
  updateVacancyBtn.disabled = true;
  updateVacancyBtn.textContent = "Saving...";
  
  const { error } = await supabase.from("vacancies").update({ content: editVacancyContent.value.trim() }).eq("id", currentEditingUuid);
  
  updateVacancyBtn.disabled = false;
  updateVacancyBtn.textContent = "Save Changes";
  
  if (error) {
    alert("Failed to update: " + error.message);
  } else {
    manageFeedback.textContent = "Updated successfully!";
    manageFeedback.classList.remove("hidden");
    setTimeout(() => manageFeedback.classList.add("hidden"), 3000);
  }
});

deleteVacancyBtn.addEventListener("click", async () => {
  if (!currentEditingUuid) return;
  if (!confirm("Are you sure you want to permanently delete this vacancy?")) return;
  
  const { error } = await supabase.from("vacancies").delete().eq("id", currentEditingUuid);
  
  if (error) {
    alert("Failed to delete: " + error.message);
  } else {
    editVacancyForm.classList.add("hidden");
    manageUuid.value = "";
    currentEditingUuid = null;
    alert("Vacancy deleted successfully.");
  }
});

addAdminForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addAdminBtn.disabled = true;
  addAdminBtn.textContent = "Creating...";

  const email = newAdminEmail.value.trim();
  const password = newAdminPassword.value;
  
  try {
    // We use a raw fetch instead of supabase.auth.signUp so it doesn't log the current admin out
    const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.msg || data.error_description || "Signup failed");
    }
    
    newAdminEmail.value = "";
    newAdminPassword.value = "";
    addAdminFeedback.classList.remove("hidden");
    setTimeout(() => addAdminFeedback.classList.add("hidden"), 5000);
  } catch (err) {
    alert("Failed to create admin: " + err.message);
  } finally {
    addAdminBtn.disabled = false;
    addAdminBtn.textContent = "Create Admin";
  }
});

checkSession();
