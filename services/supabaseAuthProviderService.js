const axios = require("axios");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getRequiredEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Supabase auth provider requires SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return { supabaseUrl, anonKey, serviceRoleKey };
}

function getPublicAuthClient() {
  const { supabaseUrl, anonKey } = getRequiredEnv();
  return axios.create({
    baseURL: `${supabaseUrl}/auth/v1`,
    timeout: 15000,
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
  });
}

function getAdminAuthClient() {
  const { supabaseUrl, serviceRoleKey } = getRequiredEnv();
  return axios.create({
    baseURL: `${supabaseUrl}/auth/v1`,
    timeout: 15000,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });
}

function getSupabaseErrorMessage(error, fallback = "Supabase auth request failed") {
  const data = error?.response?.data;
  return (
    data?.msg ||
    data?.message ||
    data?.error_description ||
    data?.error ||
    error?.message ||
    fallback
  );
}

function getSupabaseErrorCode(error) {
  const data = error?.response?.data;
  return (
    data?.code ||
    data?.error_code ||
    data?.error ||
    error?.code ||
    ""
  );
}

function getAuthRedirectUrl() {
  return String(process.env.SUPABASE_AUTH_REDIRECT_URL || "").trim();
}

async function signInWithPassword(email, password) {
  const client = getPublicAuthClient();
  const response = await client.post("/token?grant_type=password", {
    email: normalizeEmail(email),
    password: String(password || ""),
  });
  return response.data;
}

async function signUpWithPassword({
  email,
  password,
  userMetadata = {},
  emailRedirectTo = "",
}) {
  const targetEmail = normalizeEmail(email);
  const redirectTo = String(emailRedirectTo || "").trim() || getAuthRedirectUrl();
  const client = getPublicAuthClient();
  const response = await client.post(
    "/signup",
    {
      email: targetEmail,
      password: String(password || ""),
      data: userMetadata,
    },
    redirectTo
      ? {
          headers: {
            redirect_to: redirectTo,
          },
        }
      : undefined
  );
  return response.data || null;
}

async function resendSignupVerificationEmail({
  email,
  emailRedirectTo = "",
}) {
  const targetEmail = normalizeEmail(email);
  const redirectTo = String(emailRedirectTo || "").trim() || getAuthRedirectUrl();
  const client = getPublicAuthClient();
  const response = await client.post("/resend", {
    email: targetEmail,
    type: "signup",
    options: redirectTo
      ? {
          emailRedirectTo: redirectTo,
        }
      : undefined,
  });
  return response.data || null;
}

async function resetPasswordForEmail({
  email,
  redirectTo = "",
}) {
  const targetEmail = normalizeEmail(email);
  const redirectUrl = String(redirectTo || "").trim() || getAuthRedirectUrl();
  const client = getPublicAuthClient();
  const response = await client.post(
    "/recover",
    {
      email: targetEmail,
    },
    redirectUrl
      ? {
          headers: {
            redirect_to: redirectUrl,
          },
        }
      : undefined
  );
  return response.data || null;
}

async function getAuthUserByAccessToken(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) return null;

  const client = getPublicAuthClient();
  const response = await client.get("/user", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data || null;
}

async function updateUserPasswordWithAccessToken(accessToken, newPassword) {
  const token = String(accessToken || "").trim();
  if (!token) {
    throw new Error("Access token is required to update password");
  }

  const client = getPublicAuthClient();
  const response = await client.put(
    "/user",
    {
      password: String(newPassword || ""),
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data || null;
}

async function listAuthUsersPage(page = 1, perPage = 200) {
  const client = getAdminAuthClient();
  const response = await client.get("/admin/users", {
    params: {
      page,
      per_page: perPage,
    },
  });
  return response.data || {};
}

async function findAuthUserByEmail(email) {
  const targetEmail = normalizeEmail(email);
  if (!targetEmail) return null;

  let page = 1;
  const perPage = 200;
  while (page <= 30) {
    const pageData = await listAuthUsersPage(page, perPage);
    const users = Array.isArray(pageData?.users) ? pageData.users : [];
    if (!users.length) return null;

    const match = users.find(
      (user) => normalizeEmail(user?.email) === targetEmail
    );
    if (match) return match;

    if (users.length < perPage) return null;
    page += 1;
  }

  return null;
}

async function getAuthUserById(id) {
  const userId = String(id || "").trim();
  if (!userId) return null;

  const client = getAdminAuthClient();
  const response = await client.get(`/admin/users/${userId}`);
  return response.data?.user || response.data || null;
}

async function createAuthUser({
  email,
  password,
  emailConfirm = true,
  appMetadata = {},
  userMetadata = {},
}) {
  const client = getAdminAuthClient();
  const response = await client.post("/admin/users", {
    email: normalizeEmail(email),
    password: String(password || ""),
    email_confirm: !!emailConfirm,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  });
  return response.data?.user || response.data || null;
}

async function updateAuthUserById(id, updates = {}) {
  const client = getAdminAuthClient();
  const response = await client.put(`/admin/users/${id}`, updates);
  return response.data?.user || response.data || null;
}

async function deleteAuthUserById(id) {
  const client = getAdminAuthClient();
  await client.delete(`/admin/users/${id}`);
}

async function ensureAuthUser({
  email,
  password,
  appMetadata = {},
  userMetadata = {},
  updatePasswordIfExists = false,
}) {
  const targetEmail = normalizeEmail(email);
  const pwd = String(password || "");

  let existing = await findAuthUserByEmail(targetEmail);
  if (existing) {
    if (updatePasswordIfExists && pwd) {
      existing = await updateAuthUserById(existing.id, {
        password: pwd,
        app_metadata: {
          ...(existing.app_metadata || {}),
          ...appMetadata,
        },
        user_metadata: {
          ...(existing.user_metadata || {}),
          ...userMetadata,
        },
      });
    }
    return { user: existing, created: false };
  }

  try {
    const created = await createAuthUser({
      email: targetEmail,
      password: pwd,
      emailConfirm: true,
      appMetadata,
      userMetadata,
    });
    return { user: created, created: true };
  } catch (error) {
    const message = getSupabaseErrorMessage(error);
    // If another request created it at the same time, recover by re-querying.
    if (error?.response?.status === 422 || /already/i.test(message)) {
      existing = await findAuthUserByEmail(targetEmail);
      if (existing) return { user: existing, created: false };
    }
    throw error;
  }
}

module.exports = {
  normalizeEmail,
  getSupabaseErrorMessage,
  getSupabaseErrorCode,
  getAuthRedirectUrl,
  signInWithPassword,
  signUpWithPassword,
  resendSignupVerificationEmail,
  resetPasswordForEmail,
  updateUserPasswordWithAccessToken,
  getAuthUserByAccessToken,
  getAuthUserById,
  findAuthUserByEmail,
  createAuthUser,
  updateAuthUserById,
  deleteAuthUserById,
  ensureAuthUser,
};
