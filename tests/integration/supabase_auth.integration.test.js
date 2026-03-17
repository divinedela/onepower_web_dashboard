const test = require("node:test");
const assert = require("node:assert/strict");

const API_BASE_URL = String(process.env.INTEGRATION_BASE_URL || "").replace(/\/+$/, "");
const ADMIN_BASE_URL = String(
  process.env.INTEGRATION_ADMIN_BASE_URL || API_BASE_URL.replace(/\/api$/, "")
).replace(/\/+$/, "");

function has(value) {
  return String(value || "").trim().length > 0;
}

async function postJson(url, body, token = "") {
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

test("Forgot password -> reset -> sign in", { skip: !has(API_BASE_URL) }, async (t) => {
  const email = process.env.INTEGRATION_RESET_EMAIL;
  const newPassword = process.env.INTEGRATION_RESET_NEW_PASSWORD;
  const accessToken = process.env.INTEGRATION_RESET_ACCESS_TOKEN;

  if (!has(email) || !has(newPassword) || !has(accessToken)) {
    t.skip(
      "Missing INTEGRATION_RESET_EMAIL / INTEGRATION_RESET_NEW_PASSWORD / INTEGRATION_RESET_ACCESS_TOKEN"
    );
    return;
  }

  const forgot = await postJson(`${API_BASE_URL}/forgotPassword`, { email });
  assert.equal(Number(forgot.json?.data?.success || 0), 1);

  const reset = await postJson(
    `${API_BASE_URL}/resetPassword`,
    {
      new_password: newPassword,
      confirm_password: newPassword,
    },
    accessToken
  );
  assert.equal(Number(reset.json?.data?.success || 0), 1);

  const signIn = await postJson(`${API_BASE_URL}/signIn`, {
    email,
    password: newPassword,
  });
  assert.equal(Number(signIn.json?.data?.success || 0), 1);
});

test("Token-protected endpoint access", { skip: !has(API_BASE_URL) }, async (t) => {
  const token = process.env.INTEGRATION_USER_ACCESS_TOKEN;
  if (!has(token)) {
    t.skip("Missing INTEGRATION_USER_ACCESS_TOKEN");
    return;
  }

  const result = await postJson(`${API_BASE_URL}/getUserDetails`, {}, token);
  assert.equal(Number(result.json?.data?.success || 0), 1);
  assert.ok(result.json?.data?.user);
});

test("Admin login + password change", { skip: !has(ADMIN_BASE_URL) }, async (t) => {
  const email = process.env.INTEGRATION_ADMIN_EMAIL;
  const oldPassword = process.env.INTEGRATION_ADMIN_OLD_PASSWORD;
  const newPassword = process.env.INTEGRATION_ADMIN_NEW_PASSWORD;

  if (!has(email) || !has(oldPassword) || !has(newPassword)) {
    t.skip(
      "Missing INTEGRATION_ADMIN_EMAIL / INTEGRATION_ADMIN_OLD_PASSWORD / INTEGRATION_ADMIN_NEW_PASSWORD"
    );
    return;
  }

  const loginResp = await fetch(`${ADMIN_BASE_URL}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      email,
      password: oldPassword,
    }),
    redirect: "manual",
  });

  const setCookie = loginResp.headers.get("set-cookie") || "";
  assert.ok(has(setCookie), "Admin login should return session cookie");

  const changeResp = await fetch(`${ADMIN_BASE_URL}/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: setCookie,
    },
    body: new URLSearchParams({
      oldpassword: oldPassword,
      newpassword: newPassword,
      comfirmpassword: newPassword,
    }),
    redirect: "manual",
  });

  assert.ok([302, 303].includes(changeResp.status));
});
