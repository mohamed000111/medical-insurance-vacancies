import { supabase } from "./supabase.js";
import { CONFIG } from "./config.js";

// The super admin is the only account allowed to create new admins.
// NOTE: this is mirrored server-side in public.is_super_admin() (migration 0011),
// which is what actually enforces permissions. The UI check is for display only.
const SUPER_ADMIN_EMAIL = "mrby20647@gmail.com";

const $ = (id) => document.getElementById(id);

const authContainer = $("auth-container");
const loginCard = $("login-card");
const resetRequestCard = $("reset-request-card");
const verifyOtpCard = $("verify-otp-card");
const newPasswordCard = $("new-password-card");

const loginForm = $("login-form");
const loginError = $("login-error");
const logoutBtn = $("logout-btn");
const dashboardScreen = $("dashboard-screen");

// Auth Tabs & Magic Link elements
const tabPassword = $("tab-password");
const tabMagicLink = $("tab-magic-link");
const magicLinkForm = $("magic-link-form");
const magicEmailInput = $("magic-email");
const sendMagicLinkBtn = $("send-magic-link-btn");
const magicLinkFeedback = $("magic-link-feedback");
const magicLinkError = $("magic-link-error");
const magicOtpSection = $("magic-otp-section");
const magicOtpInput = $("magic-otp-input");
const magicOtpVerifyBtn = $("magic-otp-verify-btn");
const magicOtpError = $("magic-otp-error");

// Password Reset elements
const forgotPasswordBtn = $("forgot-password-btn");
const resetRequestForm = $("reset-request-form");
const resetEmailInput = $("reset-email");
const sendOtpBtn = $("send-otp-btn");
const resetRequestError = $("reset-request-error");
const backToLoginFromReq = $("back-to-login-from-req");

const verifyOtpForm = $("verify-otp-form");
const otpSentTo = $("otp-sent-to");
const otpInput = $("otp-input");
const verifyOtpBtn = $("verify-otp-btn");
const verifyOtpError = $("verify-otp-error");
const resendOtpBtn = $("resend-otp-btn");
const backToReqBtn = $("back-to-req-btn");

const newPasswordForm = $("new-password-form");
const newPassInput = $("new-pass");
const confirmPassInput = $("confirm-pass");
const savePasswordBtn = $("save-password-btn");
const newPasswordFeedback = $("new-password-feedback");
const newPasswordError = $("new-password-error");

let pendingResetEmail = "";

function showAuthCard(card) {
  [loginCard, resetRequestCard, verifyOtpCard, newPasswordCard].forEach((c) => {
    if (c) c.classList.toggle("hidden", c !== card);
  });
}

const currentUserEmailEl = $("current-user-email");
const currentUserRoleEl = $("current-user-role");
const postingAsEl = $("posting-as");

const postVacancyForm = $("post-vacancy-form");
const vacancyContent = $("vacancy-content");
const vacancySubmitBtn = $("vacancy-submit-btn");
const vacancyFeedback = $("vacancy-feedback");

const manageTitle = $("manage-title");
const myVacCount = $("my-vac-count");
const myVacanciesEl = $("my-vacancies");
const manageVacancyForm = $("manage-vacancy-form");
const manageUuid = $("manage-uuid");
const manageError = $("manage-error");

const editVacancyForm = $("edit-vacancy-form");
const editingUuidEl = $("editing-uuid");
const editingOwnerEl = $("editing-owner");
const editVacancyContent = $("edit-vacancy-content");
const editVacancyVerified = $("edit-vacancy-verified");
const editVacancyActive = $("edit-vacancy-active");
const updateVacancyBtn = $("update-vacancy-btn");
const deleteVacancyBtn = $("delete-vacancy-btn");
const cancelEditBtn = $("cancel-edit-btn");
const manageFeedback = $("manage-feedback");

const addAdminSection = $("add-admin-section");
const addAdminForm = $("add-admin-form");
const newAdminEmail = $("new-admin-email");
const newAdminPassword = $("new-admin-password");
const addAdminBtn = $("add-admin-btn");
const addAdminFeedback = $("add-admin-feedback");

const appsTbody = $("apps-tbody");
const cvsCountEl = $("cvs-count");
const appsFilter = $("apps-filter");
const refreshCvsBtn = $("refresh-cvs-btn");
const exportHtmlBtn = $("export-html-btn");
const exportCsvBtn = $("export-csv-btn");

let currentUser = null;
let isSuper = false;
let myVacancies = [];
let applications = [];
let currentEditingUuid = null;
let hasOwnershipMigration = true;

// Escape HTML securely
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const snippet = (s, n = 90) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
const flash = (el, msg, ms = 3000) => { el.textContent = msg; el.classList.remove("hidden"); setTimeout(() => el.classList.add("hidden"), ms); };

/* ───────────── Auth ───────────── */
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    currentUser = null;
    authContainer.classList.remove("hidden");
    dashboardScreen.classList.add("hidden");
    showAuthCard(loginCard);
    return;
  }
  currentUser = session.user;
  isSuper = (currentUser.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;

  authContainer.classList.add("hidden");
  dashboardScreen.classList.remove("hidden");

  currentUserEmailEl.textContent = currentUser.email;
  postingAsEl.textContent = currentUser.email;
  currentUserRoleEl.textContent = isSuper ? "Super Admin" : "Admin";
  currentUserRoleEl.className = `role-pill ${isSuper
    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
    : "bg-teal-500/15 text-teal-300 border border-teal-500/30"}`;

  addAdminSection.classList.toggle("hidden", !isSuper);
  manageTitle.textContent = isSuper ? "Manage All Vacancies" : "Manage My Vacancies";

  loadDashboard();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  const email = $("email").value.trim();
  const password = $("password").value;

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
  closeEditor();
  showAuthCard(loginCard);
  checkSession();
});

/* ───────────── Auth Tabs (Password vs Magic Link) ───────────── */
function switchAuthTab(mode) {
  const isPassword = mode === "password";

  if (loginForm) loginForm.classList.toggle("hidden", !isPassword);
  if (magicLinkForm) magicLinkForm.classList.toggle("hidden", isPassword);

  if (isPassword) {
    if (tabPassword) tabPassword.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg transition text-teal-300 bg-slate-800 border border-teal-500/20 shadow-sm";
    if (tabMagicLink) tabMagicLink.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg transition text-slate-400 hover:text-slate-200";
    if (magicEmailInput && magicEmailInput.value.trim() && $("email")) {
      $("email").value = magicEmailInput.value.trim();
    }
  } else {
    if (tabMagicLink) tabMagicLink.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg transition text-teal-300 bg-slate-800 border border-teal-500/20 shadow-sm";
    if (tabPassword) tabPassword.className = "flex-1 py-1.5 text-xs font-semibold rounded-lg transition text-slate-400 hover:text-slate-200";
    if ($("email") && $("email").value.trim() && magicEmailInput) {
      magicEmailInput.value = $("email").value.trim();
    }
    if (magicEmailInput) magicEmailInput.focus();
  }
}

if (tabPassword) tabPassword.addEventListener("click", () => switchAuthTab("password"));
if (tabMagicLink) tabMagicLink.addEventListener("click", () => switchAuthTab("magic"));

/* ───────────── Magic Link Flow ───────────── */
if (magicLinkForm) {
  magicLinkForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (magicLinkError) magicLinkError.classList.add("hidden");
    if (magicLinkFeedback) magicLinkFeedback.classList.add("hidden");
    if (magicOtpError) magicOtpError.classList.add("hidden");

    const email = magicEmailInput ? magicEmailInput.value.trim() : "";
    if (!email) return;

    if (sendMagicLinkBtn) {
      sendMagicLinkBtn.disabled = true;
      sendMagicLinkBtn.innerHTML = `<span>⏳ Sending Magic Link...</span>`;
    }

    try {
      const redirectUrl = window.location.origin + window.location.pathname;
      const { data, error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: false
        }
      });

      if (error) throw error;

      if (magicLinkFeedback) {
        magicLinkFeedback.innerHTML = `✨ <strong>Magic login link sent!</strong><br><span class="text-xs text-slate-300">Check your inbox at <strong>${esc(email)}</strong> and click the link to log straight into the admin dashboard.</span>`;
        magicLinkFeedback.classList.remove("hidden");
      }

      if (magicOtpSection) {
        magicOtpSection.classList.remove("hidden");
        if (magicOtpInput) {
          magicOtpInput.value = "";
          magicOtpInput.focus();
        }
      }
    } catch (err) {
      let msg = err.message || "Failed to send magic link.";
      if (msg.toLowerCase().includes("signups not allowed") || msg.toLowerCase().includes("user not found")) {
        msg = `No admin account registered for "${email}". Please contact the super admin (${SUPER_ADMIN_EMAIL}) to create your account first.`;
      }
      if (magicLinkError) {
        magicLinkError.textContent = msg;
        magicLinkError.classList.remove("hidden");
      }
    } finally {
      if (sendMagicLinkBtn) {
        sendMagicLinkBtn.disabled = false;
        sendMagicLinkBtn.innerHTML = `<span>✨ Send Magic Login Link</span>`;
      }
    }
  });
}

// Optional 6-digit OTP verification from magic link tab
if (magicOtpVerifyBtn && magicOtpInput) {
  magicOtpVerifyBtn.addEventListener("click", async () => {
    const email = magicEmailInput ? magicEmailInput.value.trim() : "";
    const token = magicOtpInput.value.replace(/\D/g, "");
    if (!email) {
      if (magicOtpError) {
        magicOtpError.textContent = "Please enter your email address above.";
        magicOtpError.classList.remove("hidden");
      }
      return;
    }
    if (token.length !== 6) {
      if (magicOtpError) {
        magicOtpError.textContent = "Please enter the complete 6-digit code.";
        magicOtpError.classList.remove("hidden");
      }
      return;
    }

    magicOtpVerifyBtn.disabled = true;
    magicOtpVerifyBtn.textContent = "Verifying...";
    if (magicOtpError) magicOtpError.classList.add("hidden");

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email,
        token: token,
        type: "email"
      });

      if (error) throw error;

      if (magicLinkFeedback) {
        magicLinkFeedback.innerHTML = `🎉 <strong>Code verified! Logging you in...</strong>`;
        magicLinkFeedback.classList.remove("hidden");
      }
      setTimeout(() => {
        checkSession();
      }, 600);
    } catch (err) {
      if (magicOtpError) {
        magicOtpError.textContent = err.message || "Invalid or expired 6-digit code.";
        magicOtpError.classList.remove("hidden");
      }
    } finally {
      magicOtpVerifyBtn.disabled = false;
      magicOtpVerifyBtn.textContent = "Verify & Login";
    }
  });
}

/* ───────────── 6-Digit Code Password Reset Flow ───────────── */

// 1. Open request reset screen
if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", () => {
    const typedEmail = $("email").value.trim();
    if (typedEmail) resetEmailInput.value = typedEmail;
    resetRequestError.classList.add("hidden");
    showAuthCard(resetRequestCard);
    resetEmailInput.focus();
  });
}

if (backToLoginFromReq) {
  backToLoginFromReq.addEventListener("click", () => {
    showAuthCard(loginCard);
  });
}

// 2. Submit email to receive 6-digit OTP code
if (resetRequestForm) {
  resetRequestForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    resetRequestError.classList.add("hidden");
    const email = resetEmailInput.value.trim();
    if (!email) return;

    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = "Sending Code...";

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;

      pendingResetEmail = email;
      otpSentTo.textContent = email;
      otpInput.value = "";
      verifyOtpError.classList.add("hidden");
      showAuthCard(verifyOtpCard);
      otpInput.focus();
    } catch (err) {
      resetRequestError.textContent = err.message || "Failed to send reset code. Please try again.";
      resetRequestError.classList.remove("hidden");
    } finally {
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = "Send 6-Digit Code";
    }
  });
}

// 3. Verify 6-digit OTP code
if (backToReqBtn) {
  backToReqBtn.addEventListener("click", () => {
    showAuthCard(resetRequestCard);
    resetEmailInput.focus();
  });
}

if (resendOtpBtn) {
  resendOtpBtn.addEventListener("click", async () => {
    if (!pendingResetEmail) return;
    resendOtpBtn.disabled = true;
    resendOtpBtn.textContent = "Sending...";
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(pendingResetEmail, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;
      verifyOtpError.textContent = "A new 6-digit code has been sent to your email!";
      verifyOtpError.className = "text-emerald-400 text-sm mt-2 text-center";
      verifyOtpError.classList.remove("hidden");
      setTimeout(() => verifyOtpError.classList.add("hidden"), 4000);
    } catch (err) {
      verifyOtpError.textContent = err.message || "Failed to resend code.";
      verifyOtpError.className = "text-red-400 text-sm mt-2 text-center";
      verifyOtpError.classList.remove("hidden");
    } finally {
      resendOtpBtn.disabled = false;
      resendOtpBtn.textContent = "Resend Code";
    }
  });
}

if (verifyOtpForm) {
  verifyOtpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    verifyOtpError.classList.add("hidden");
    const token = otpInput.value.replace(/\D/g, "");

    if (token.length !== 6) {
      verifyOtpError.textContent = "Please enter the complete 6-digit code.";
      verifyOtpError.className = "text-red-400 text-sm mt-2 text-center";
      verifyOtpError.classList.remove("hidden");
      return;
    }

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.textContent = "Verifying...";

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: pendingResetEmail,
        token: token,
        type: "recovery"
      });

      if (error) throw error;

      // OTP verified successfully!
      newPasswordForm.reset();
      newPasswordError.classList.add("hidden");
      newPasswordFeedback.classList.add("hidden");
      showAuthCard(newPasswordCard);
      newPassInput.focus();
    } catch (err) {
      verifyOtpError.textContent = err.message || "Invalid or expired 6-digit code. Please try again.";
      verifyOtpError.className = "text-red-400 text-sm mt-2 text-center";
      verifyOtpError.classList.remove("hidden");
    } finally {
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.textContent = "Verify Code";
    }
  });
}

// 4. Set new password
if (newPasswordForm) {
  newPasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    newPasswordError.classList.add("hidden");
    newPasswordFeedback.classList.add("hidden");

    const newPass = newPassInput.value;
    const confirmPass = confirmPassInput.value;

    if (newPass.length < 6) {
      newPasswordError.textContent = "Password must be at least 6 characters.";
      newPasswordError.classList.remove("hidden");
      return;
    }

    if (newPass !== confirmPass) {
      newPasswordError.textContent = "Passwords do not match.";
      newPasswordError.classList.remove("hidden");
      return;
    }

    savePasswordBtn.disabled = true;
    savePasswordBtn.textContent = "Updating Password...";

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPass
      });

      if (error) throw error;

      newPasswordFeedback.textContent = "Password updated successfully! Redirecting to dashboard...";
      newPasswordFeedback.classList.remove("hidden");

      setTimeout(() => {
        checkSession();
      }, 1200);
    } catch (err) {
      newPasswordError.textContent = err.message || "Failed to update password.";
      newPasswordError.classList.remove("hidden");
      savePasswordBtn.disabled = false;
      savePasswordBtn.textContent = "Update Password & Login";
    }
  });
}

// Listen to Supabase Auth state changes (including direct recovery links and magic links)
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    authContainer.classList.remove("hidden");
    dashboardScreen.classList.add("hidden");
    showAuthCard(newPasswordCard);
    if (newPassInput) newPassInput.focus();
  } else if (event === "SIGNED_IN") {
    checkSession();
  }
});

function loadDashboard() {
  loadMyVacancies();
  loadApplications();
}

/* ───────────── 1. Publish ───────────── */
postVacancyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = vacancyContent.value.trim();
  if (!content) return;

  vacancySubmitBtn.disabled = true;
  vacancySubmitBtn.textContent = "Publishing...";

  let insertPayload = { content, source: "web" };
  if (hasOwnershipMigration && currentUser) {
    insertPayload.posted_by = currentUser.id;
    insertPayload.posted_by_email = currentUser.email;
  }

  let { data, error } = await supabase
    .from("vacancies")
    .insert(insertPayload)
    .select("id")
    .single();

  // If column posted_by does not exist in DB yet, retry without it
  if (error && String(error.message || "").toLowerCase().includes("posted_by")) {
    hasOwnershipMigration = false;
    const retry = await supabase
      .from("vacancies")
      .insert({ content, source: "web" })
      .select("id")
      .single();
    data = retry.data;
    error = retry.error;
  }

  vacancySubmitBtn.disabled = false;
  vacancySubmitBtn.textContent = "Publish Vacancy";

  if (error) {
    alert("Failed to publish vacancy: " + error.message);
    return;
  }
  vacancyContent.value = "";
  flash(vacancyFeedback, `Published! UUID: ${data.id}`, 6000);
  loadMyVacancies();
});

/* ───────────── 2. Manage own vacancies ───────────── */
async function loadMyVacancies() {
  let req;
  if (hasOwnershipMigration) {
    req = supabase
      .from("vacancies")
      .select("id, content, source, is_active, created_at, posted_by, posted_by_email")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!isSuper && currentUser) req = req.eq("posted_by", currentUser.id);
  } else {
    req = supabase
      .from("vacancies")
      .select("id, content, source, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
  }

  let { data, error } = await req;

  // Gracefully fall back if migration 0011 hasn't been executed in Supabase SQL editor yet
  if (error && String(error.message || "").toLowerCase().includes("posted_by")) {
    hasOwnershipMigration = false;
    const fallback = await supabase
      .from("vacancies")
      .select("id, content, source, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    myVacanciesEl.innerHTML = `<p class="text-red-400 text-sm">Couldn't load vacancies: ${esc(error.message)}</p>`;
    return;
  }
  myVacancies = data || [];
  myVacCount.textContent = myVacancies.length;

  if (!myVacancies.length) {
    myVacanciesEl.innerHTML = '<p class="text-slate-500 text-sm sm:col-span-2">No vacancies published yet.</p>';
    return;
  }

  const migrationNotice = !hasOwnershipMigration
    ? `<div class="sm:col-span-2 p-3 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-start gap-2">
         <span class="text-base">⚠️</span>
         <div>
           <strong>Database Migration Notice:</strong> Please run <code class="bg-slate-900 px-1 py-0.5 rounded text-amber-200">supabase/migrations/0011_vacancy_ownership.sql</code> in your Supabase SQL Editor to enable per-admin ownership columns.
         </div>
       </div>`
    : "";

  myVacanciesEl.innerHTML = migrationNotice + myVacancies.map((v) => {
    const appCount = applications.filter((a) => a.vacancy_id === v.id).length;
    return `
    <div class="my-vac bg-slate-900 border border-slate-800 rounded-lg p-3 ${v.id === currentEditingUuid ? "active" : ""}" data-id="${esc(v.id)}">
      <div class="flex items-center justify-between gap-2 mb-1.5 text-[11px]">
        <span class="font-mono text-slate-500 truncate">${esc(v.id)}</span>
        <span class="shrink-0 ${v.is_active ? "text-emerald-400" : "text-slate-500"}">${v.is_active ? "● Active" : "○ Hidden"}</span>
      </div>
      <p class="text-sm text-slate-200 leading-snug" dir="auto">${esc(snippet(v.content))}</p>
      <div class="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>${new Date(v.created_at).toLocaleDateString()}${isSuper ? ` · ${esc(v.posted_by_email || (v.source === "telegram" ? "Telegram" : "—"))}` : ""}</span>
        <span class="text-emerald-300">${appCount} applicant${appCount === 1 ? "" : "s"}</span>
      </div>
    </div>`;
  }).join("");
}

myVacanciesEl.addEventListener("click", (e) => {
  const card = e.target.closest(".my-vac");
  if (!card) return;
  const v = myVacancies.find((x) => x.id === card.dataset.id);
  if (v) openEditor(v);
});

manageVacancyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  manageError.classList.add("hidden");
  const id = manageUuid.value.trim();

  let req = hasOwnershipMigration
    ? supabase.from("vacancies").select("id, content, source, is_active, created_at, posted_by, posted_by_email").eq("id", id).maybeSingle()
    : supabase.from("vacancies").select("id, content, source, is_active, created_at").eq("id", id).maybeSingle();

  let { data, error } = await req;
  if (error && String(error.message || "").toLowerCase().includes("posted_by")) {
    hasOwnershipMigration = false;
    const fallback = await supabase.from("vacancies").select("id, content, source, is_active, created_at").eq("id", id).maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    flash(manageError, "Vacancy not found.", 4000);
    return;
  }
  if (hasOwnershipMigration && !isSuper && data.posted_by && data.posted_by !== currentUser.id) {
    flash(manageError, "You can only edit vacancies that you published.", 5000);
    return;
  }
  openEditor(data);
});

function openEditor(v) {
  currentEditingUuid = v.id;
  editingUuidEl.textContent = v.id;
  editingOwnerEl.textContent = v.posted_by_email ? `Posted by ${v.posted_by_email}` : (v.source === "telegram" ? "From Telegram" : "");
  editVacancyContent.value = v.content;
  editVacancyVerified.checked = v.source === "web";
  editVacancyActive.checked = v.is_active !== false;
  editVacancyForm.classList.remove("hidden");
  myVacanciesEl.querySelectorAll(".my-vac").forEach((el) => el.classList.toggle("active", el.dataset.id === v.id));
  editVacancyForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeEditor() {
  currentEditingUuid = null;
  editVacancyForm.classList.add("hidden");
  manageUuid.value = "";
  myVacanciesEl.querySelectorAll(".my-vac.active").forEach((el) => el.classList.remove("active"));
}

cancelEditBtn.addEventListener("click", closeEditor);

editVacancyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentEditingUuid) return;

  updateVacancyBtn.disabled = true;
  updateVacancyBtn.textContent = "Saving...";

  const patch = {
    content: editVacancyContent.value.trim(),
    source: editVacancyVerified.checked ? "web" : "telegram",
    is_active: editVacancyActive.checked,
  };

  let req = supabase.from("vacancies").update(patch).eq("id", currentEditingUuid);
  if (hasOwnershipMigration && !isSuper) req = req.eq("posted_by", currentUser.id);
  let { data, error } = await req.select("id");

  if (error && String(error.message || "").toLowerCase().includes("posted_by")) {
    hasOwnershipMigration = false;
    const retry = await supabase.from("vacancies").update(patch).eq("id", currentEditingUuid).select("id");
    data = retry.data;
    error = retry.error;
  }

  updateVacancyBtn.disabled = false;
  updateVacancyBtn.textContent = "Save Changes";

  if (error) return alert("Failed to update: " + error.message);
  if (!data || !data.length) return alert("Not allowed: you can only edit vacancies that you published.");

  flash(manageFeedback, "Updated successfully!");
  loadMyVacancies();
});

deleteVacancyBtn.addEventListener("click", async () => {
  if (!currentEditingUuid) return;
  const vacancyId = currentEditingUuid;

  const countApps = applications.filter((a) => a.vacancy_id === vacancyId).length;
  const confirmMsg = countApps > 0
    ? `Are you sure you want to permanently delete this vacancy?\n\n⚠️ This will also permanently delete ${countApps} candidate application${countApps === 1 ? "" : "s"} and all their uploaded CV files.`
    : "Are you sure you want to permanently delete this vacancy?";

  if (!confirm(confirmMsg)) return;

  deleteVacancyBtn.disabled = true;
  deleteVacancyBtn.textContent = "Deleting vacancy & CVs...";

  try {
    // 1. Delete all CV files in the storage bucket under this vacancy ID folder
    try {
      const { data: fileList } = await supabase.storage
        .from("cv_files")
        .list(vacancyId);

      if (fileList && fileList.length) {
        const filePaths = fileList.map((f) => `${vacancyId}/${f.name}`);
        const { error: storageDelErr } = await supabase.storage
          .from("cv_files")
          .remove(filePaths);
        if (storageDelErr) console.warn("Storage files delete warning:", storageDelErr);
      }
    } catch (storageErr) {
      console.warn("Storage deletion error (non-fatal):", storageErr);
    }

    // 2. Delete applicant records from public.vacancy_applications in DB
    try {
      const { error: appsDelErr } = await supabase
        .from("vacancy_applications")
        .delete()
        .eq("vacancy_id", vacancyId);
      if (appsDelErr) console.warn("Applications DB delete warning:", appsDelErr);
    } catch (appErr) {
      console.warn("Database applications deletion error (non-fatal):", appErr);
    }

    // 3. Delete the vacancy row
    let req = supabase.from("vacancies").delete().eq("id", vacancyId);
    if (hasOwnershipMigration && !isSuper) req = req.eq("posted_by", currentUser.id);
    let { data, error } = await req.select("id");

    if (error && String(error.message || "").toLowerCase().includes("posted_by")) {
      hasOwnershipMigration = false;
      const retry = await supabase.from("vacancies").delete().eq("id", vacancyId).select("id");
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    if (!data || !data.length) throw new Error("Not allowed: you can only delete vacancies that you published.");

    closeEditor();
    loadMyVacancies();
    loadApplications();
    alert("Vacancy and all its related applicant CVs have been deleted.");
  } catch (err) {
    alert("Failed to delete vacancy: " + (err.message || err));
  } finally {
    deleteVacancyBtn.disabled = false;
    deleteVacancyBtn.textContent = "Delete Vacancy";
  }
});

/* ───────────── 3. Add admin (super admin only) ───────────── */
addAdminForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isSuper) return alert("Only the super admin can create new admins.");

  addAdminBtn.disabled = true;
  addAdminBtn.textContent = "Creating...";

  const email = newAdminEmail.value.trim();
  const password = newAdminPassword.value;

  try {
    // Raw fetch instead of supabase.auth.signUp so the current admin isn't logged out
    const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.error_description || "Signup failed");

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

/* ───────────── 4. Applicants table ───────────── */
async function loadApplications() {
  appsTbody.innerHTML = '<tr><td colspan="7" class="text-slate-500">Loading applications…</td></tr>';

  // RLS returns only applicants for vacancies this admin posted (super admin sees all).
  const { data, error } = await supabase
    .from("vacancy_applications")
    .select("id, vacancy_id, applicant_name, applicant_phone, applicant_email, note, cv_url, file_name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    appsTbody.innerHTML = `<tr><td colspan="7" class="text-red-400">Couldn't load applications: ${esc(error.message)}</td></tr>`;
    cvsCountEl.textContent = 0;
    return;
  }

  applications = data || [];
  renderApplications();
  // refresh applicant counts on vacancy cards
  if (myVacancies.length) loadMyVacancies();
}

/* ───────────── CV Helpers & Export ───────────── */
function getFullCvUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const path = String(url).replace(/^\/+/, "");
  return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/cv_files/${path}`;
}

function getFileExt(name) {
  const m = String(name || "").match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toUpperCase() : "CV";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderApplications() {
  const q = appsFilter.value.trim().toLowerCase();
  const rows = q
    ? applications.filter((a) =>
        [a.vacancy_id, a.applicant_name, a.applicant_phone, a.applicant_email, a.note].some((f) => String(f || "").toLowerCase().includes(q)))
    : applications;

  cvsCountEl.textContent = applications.length;

  if (!rows.length) {
    appsTbody.innerHTML = `<tr><td colspan="7" class="text-slate-500">${q ? "No applicants match your filter." : "No applications yet."}</td></tr>`;
    return;
  }

  appsTbody.innerHTML = rows.map((a) => {
    const fullCvUrl = getFullCvUrl(a.cv_url);
    const cleanPhone = String(a.applicant_phone || "").replace(/\D/g, "");
    const waPhone = cleanPhone.startsWith("0") ? "2" + cleanPhone : cleanPhone;

    return `
    <tr>
      <td><span class="font-mono text-[11px] text-slate-400 select-all" title="${esc(a.vacancy_id)}">${esc(a.vacancy_id || "—")}</span></td>
      <td class="font-semibold text-emerald-300" dir="auto">${esc(a.applicant_name)}</td>
      <td>
        <div class="flex items-center gap-1.5">
          <a href="https://wa.me/${esc(waPhone)}" target="_blank" rel="noopener noreferrer" class="font-mono text-slate-200 hover:text-teal-300">${esc(a.applicant_phone)}</a>
          <a href="https://wa.me/${esc(waPhone)}" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:text-emerald-300 text-xs" title="Chat on WhatsApp">💬</a>
        </div>
      </td>
      <td>${a.applicant_email ? `<a href="mailto:${esc(a.applicant_email)}" class="text-slate-300 hover:text-teal-300">${esc(a.applicant_email)}</a>` : '<span class="text-slate-600">—</span>'}</td>
      <td class="text-slate-400 max-w-[220px]" dir="auto">${a.note ? esc(snippet(a.note, 120)) : '<span class="text-slate-600">—</span>'}</td>
      <td class="text-slate-500 whitespace-nowrap">${new Date(a.created_at).toLocaleString()}</td>
      <td>
        <div class="flex items-center gap-1.5">
          ${fullCvUrl ? `<a href="${esc(fullCvUrl)}" target="_blank" rel="noopener noreferrer" download="${esc(a.file_name || 'CV')}" class="btn btn-green text-xs whitespace-nowrap" title="${esc(a.file_name || '')}">Download</a>` : '<span class="text-slate-600 text-xs">—</span>'}
          <button type="button" class="del-app-btn p-1 text-slate-500 hover:text-red-400 rounded transition-colors" data-id="${esc(a.id)}" data-name="${esc(a.applicant_name)}" data-cv="${esc(a.cv_url || '')}" title="Delete application and CV">
            <svg class="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

// Single applicant deletion
appsTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest(".del-app-btn");
  if (!btn) return;

  const appId = btn.dataset.id;
  const appName = btn.dataset.name;
  const cvUrl = btn.dataset.cv;

  if (!confirm(`Are you sure you want to delete applicant "${appName}" and remove their CV file?`)) return;

  try {
    // Delete file from storage bucket if it has a valid path
    if (cvUrl && cvUrl.includes("/cv_files/")) {
      const path = cvUrl.split("/cv_files/")[1]?.split("?")[0];
      if (path) {
        await supabase.storage.from("cv_files").remove([decodeURIComponent(path)]);
      }
    }

    const { error } = await supabase
      .from("vacancy_applications")
      .delete()
      .eq("id", appId);

    if (error) throw error;

    applications = applications.filter((x) => x.id !== appId);
    renderApplications();
    if (myVacancies.length) loadMyVacancies();
  } catch (err) {
    alert("Failed to delete applicant: " + (err.message || err));
  }
});

/* ───────────── Export Applicants to Standalone HTML Report ───────────── */
function generateApplicantsHtmlReport(rows) {
  const now = new Date();
  const formattedDate = now.toLocaleString();
  const userEmail = currentUser?.email || "Admin";

  const rowsHtml = rows.map((a, idx) => {
    const fullCvUrl = getFullCvUrl(a.cv_url);
    const cleanPhone = String(a.applicant_phone || "").replace(/\D/g, "");
    const waPhone = cleanPhone.startsWith("0") ? "2" + cleanPhone : cleanPhone;
    const fileExt = getFileExt(a.file_name);
    const vac = myVacancies.find((v) => v.id === a.vacancy_id);
    const jobSnippet = vac ? snippet(vac.content, 60) : "";

    return `
      <tr class="app-row" data-search="${esc(`${a.applicant_name} ${a.applicant_phone} ${a.applicant_email || ''} ${a.vacancy_id || ''} ${a.note || ''}`).toLowerCase()}">
        <td class="col-num">${idx + 1}</td>
        <td>
          <div class="applicant-name" dir="auto">${esc(a.applicant_name)}</div>
          ${a.applicant_email ? `<a href="mailto:${esc(a.applicant_email)}" class="email-link">${esc(a.applicant_email)}</a>` : ""}
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <a href="tel:${esc(a.applicant_phone)}" class="phone-link">${esc(a.applicant_phone)}</a>
            ${cleanPhone ? `<a href="https://wa.me/${esc(waPhone)}" target="_blank" class="wa-btn" title="Chat on WhatsApp">💬 WhatsApp</a>` : ""}
          </div>
        </td>
        <td>
          <span class="uuid-tag" title="${esc(a.vacancy_id || '—')}">${esc(a.vacancy_id ? a.vacancy_id.slice(0, 8) + '…' : '—')}</span>
          ${jobSnippet ? `<div class="job-snippet" dir="auto">${esc(jobSnippet)}</div>` : ""}
        </td>
        <td>
          <div class="note-box" dir="auto">${a.note ? esc(a.note) : '<span style="color:#64748b">—</span>'}</div>
        </td>
        <td>
          <div class="time-tag">${new Date(a.created_at).toLocaleString()}</div>
        </td>
        <td>
          ${fullCvUrl ? `
            <a href="${esc(fullCvUrl)}" target="_blank" rel="noopener noreferrer" download="${esc(a.file_name || 'candidate_cv')}" class="btn-download" title="${esc(a.file_name || 'Download Candidate CV')}">
              📥 Download CV (${esc(fileExt)})
            </a>
            <div style="margin-top:4px;">
              <a href="${esc(fullCvUrl)}" target="_blank" class="direct-link" title="Open direct link in browser">Direct link ↗</a>
            </div>
          ` : '<span style="color:#64748b">No CV</span>'}
        </td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MedInsure Hub — Candidate Applications Report</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --border: #1f293d;
      --teal: #14b8a6;
      --emerald: #10b981;
      --text: #f3f4f6;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      line-height: 1.5;
    }
    .container { max-width: 1440px; margin: 0 auto; }
    header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .brand h1 { font-size: 22px; font-weight: 700; color: #34d399; display: flex; align-items: center; gap: 8px; }
    .brand p { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
    .stats { display: flex; gap: 12px; flex-wrap: wrap; }
    .stat-badge {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      color: #6ee7b7;
      font-weight: 600;
    }
    .toolbar {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 20px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .search-box {
      background: #0b1120;
      border: 1px solid #334155;
      color: #fff;
      padding: 9px 16px;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      min-width: 320px;
      transition: border-color 0.2s;
    }
    .search-box:focus { border-color: var(--teal); }
    .btn {
      padding: 9px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
    .btn-print { background: #1e293b; color: #e2e8f0; }
    .btn-download {
      background: linear-gradient(135deg, #10b981, #14b8a6);
      color: #042f2e !important;
      font-weight: 700;
      padding: 6px 12px;
      font-size: 12px;
      border-radius: 6px;
      text-decoration: none;
      display: inline-block;
      white-space: nowrap;
      transition: transform 0.15s, opacity 0.2s;
    }
    .btn-download:hover { opacity: 0.92; transform: translateY(-1px); }
    .wa-btn {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #6ee7b7;
      text-decoration: none;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
    }
    .wa-btn:hover { background: rgba(16, 185, 129, 0.25); }
    .direct-link { font-size: 11px; color: #38bdf8; text-decoration: none; }
    .direct-link:hover { text-decoration: underline; }
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th {
      background: #0f172a;
      color: var(--text-muted);
      font-weight: 600;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
    }
    td {
      padding: 14px 16px;
      border-bottom: 1px solid #1e293b;
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .col-num { font-family: monospace; color: #475569; font-size: 12px; width: 36px; }
    .applicant-name { font-weight: 700; color: #6ee7b7; font-size: 14px; margin-bottom: 2px; }
    .phone-link { color: #38bdf8; text-decoration: none; font-family: monospace; font-size: 13px; }
    .phone-link:hover { text-decoration: underline; }
    .email-link { color: #94a3b8; text-decoration: none; font-size: 12px; display: block; }
    .email-link:hover { color: var(--teal); }
    .uuid-tag {
      font-family: monospace;
      font-size: 11px;
      color: #94a3b8;
      background: #0b1120;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #1e293b;
    }
    .job-snippet { font-size: 11px; color: #64748b; margin-top: 4px; max-width: 220px; line-height: 1.3; }
    .note-box { max-width: 280px; color: #cbd5e1; font-size: 12px; line-height: 1.4; word-break: break-word; }
    .time-tag { font-size: 12px; color: #64748b; white-space: nowrap; }
    .footer-note { margin-top: 24px; text-align: center; font-size: 12px; color: #64748b; }
    @media print {
      body { background: #fff; color: #000; padding: 10px; }
      header, .toolbar, .table-card { border: none; background: #fff; box-shadow: none; }
      th { background: #f1f5f9; color: #334155; }
      td { border-bottom: 1px solid #e2e8f0; color: #0f172a; }
      .applicant-name { color: #047857; }
      .phone-link, .email-link { color: #0369a1; }
      .uuid-tag { background: #f1f5f9; color: #475569; }
      .toolbar, .btn-print, .wa-btn { display: none; }
      .btn-download { background: #047857 !important; color: #fff !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <h1>
          <span>🏥</span> MedInsure Hub — Candidate Applications Report
        </h1>
        <p>Exported on <strong>${formattedDate}</strong> · Generated by <strong>${esc(userEmail)}</strong></p>
      </div>
      <div class="stats">
        <div class="stat-badge">Total Applicants: <span id="visible-count">${rows.length}</span></div>
      </div>
    </header>

    <div class="toolbar">
      <input type="search" id="report-search" class="search-box" placeholder="Filter by candidate name, phone, email, notes, or vacancy…" oninput="filterReport(this.value)" />
      <button type="button" class="btn btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Applicant Details</th>
            <th>Phone / WhatsApp</th>
            <th>Vacancy UUID</th>
            <th>Candidate Note</th>
            <th>Submitted At</th>
            <th>Resume / CV</th>
          </tr>
        </thead>
        <tbody id="report-tbody">
          ${rowsHtml || '<tr><td colspan="7" style="text-align:center;padding:30px;color:#64748b;">No applicants found.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="footer-note">
      <p>💡 <em>Note:</em> The "Download CV" buttons contain direct links to Supabase Cloud Storage. Anyone opening this HTML file can download the attached CV files as long as they remain in the database storage bucket.</p>
    </div>
  </div>

  <script>
    function filterReport(q) {
      q = (q || '').toLowerCase().trim();
      const rows = document.querySelectorAll('.app-row');
      let visible = 0;
      rows.forEach(r => {
        const text = r.getAttribute('data-search') || '';
        const match = !q || text.includes(q);
        r.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      document.getElementById('visible-count').textContent = visible;
    }
  </script>
</body>
</html>`;
}

function exportApplicantsToHtml() {
  const q = appsFilter.value.trim().toLowerCase();
  const rows = q
    ? applications.filter((a) =>
        [a.vacancy_id, a.applicant_name, a.applicant_phone, a.applicant_email, a.note].some((f) => String(f || "").toLowerCase().includes(q)))
    : applications;

  if (!rows.length) {
    alert("No applicants found to export.");
    return;
  }

  const htmlContent = generateApplicantsHtmlReport(rows);
  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
  const filename = `medinsure_applicants_${new Date().toISOString().slice(0, 10)}.html`;
  downloadBlob(blob, filename);
}

function exportApplicantsToCsv() {
  const q = appsFilter.value.trim().toLowerCase();
  const rows = q
    ? applications.filter((a) =>
        [a.vacancy_id, a.applicant_name, a.applicant_phone, a.applicant_email, a.note].some((f) => String(f || "").toLowerCase().includes(q)))
    : applications;

  if (!rows.length) {
    alert("No applicants found to export.");
    return;
  }

  const headers = ["#", "Applicant Name", "Phone", "Email", "Vacancy UUID", "Job Snippet", "Candidate Note", "Submitted At", "CV Download URL", "File Name"];
  const csvRows = [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(",")];

  rows.forEach((a, idx) => {
    const fullCvUrl = getFullCvUrl(a.cv_url);
    const vac = myVacancies.find((v) => v.id === a.vacancy_id);
    const jobSnippet = vac ? snippet(vac.content, 80) : "";

    const values = [
      idx + 1,
      a.applicant_name || "",
      a.applicant_phone || "",
      a.applicant_email || "",
      a.vacancy_id || "",
      jobSnippet,
      a.note || "",
      a.created_at ? new Date(a.created_at).toLocaleString() : "",
      fullCvUrl,
      a.file_name || ""
    ];

    csvRows.push(values.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
  });

  const blob = new Blob(["\uFEFF" + csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `medinsure_applicants_${new Date().toISOString().slice(0, 10)}.csv`);
}

appsFilter.addEventListener("input", renderApplications);
refreshCvsBtn.addEventListener("click", loadApplications);
if (exportHtmlBtn) exportHtmlBtn.addEventListener("click", exportApplicantsToHtml);
if (exportCsvBtn) exportCsvBtn.addEventListener("click", exportApplicantsToCsv);

checkSession();

