const axios = require("axios");

function getSupabaseRestClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase auth service requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return axios.create({
    baseURL: `${supabaseUrl}/rest/v1`,
    timeout: 15000,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });
}

function normalizeUser(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    image: row.image || "",
    firstname: row.firstname,
    lastname: row.lastname,
    email: row.email,
    country_code: row.country_code,
    phone_number: row.phone_number,
    password: row.password_hash,
    isVerified: !!row.is_verified,
    is_active: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function findUserByEmail(email) {
  const client = getSupabaseRestClient();
  const response = await client.get("/users", {
    params: {
      select: "*",
      email: `eq.${normalizeEmail(email)}`,
      limit: 1,
    },
  });
  return normalizeUser(response.data?.[0]);
}

async function findUserById(id) {
  const client = getSupabaseRestClient();
  const response = await client.get("/users", {
    params: {
      select: "*",
      id: `eq.${id}`,
      limit: 1,
    },
  });
  return normalizeUser(response.data?.[0]);
}

async function createUser({
  firstname,
  lastname,
  email,
  countryCode,
  phoneNumber,
  passwordHash,
}) {
  const client = getSupabaseRestClient();
  const response = await client.post(
    "/users",
    {
      firstname,
      lastname,
      email: normalizeEmail(email),
      country_code: countryCode,
      phone_number: phoneNumber,
      password_hash: passwordHash,
      is_verified: false,
      is_active: true,
    },
    {
      headers: {
        Prefer: "return=representation",
      },
    }
  );
  return normalizeUser(response.data?.[0]);
}

async function updateUserById(id, updates = {}) {
  const payload = {};
  if (updates.firstname !== undefined) payload.firstname = updates.firstname;
  if (updates.lastname !== undefined) payload.lastname = updates.lastname;
  if (updates.countryCode !== undefined) payload.country_code = updates.countryCode;
  if (updates.phoneNumber !== undefined) payload.phone_number = updates.phoneNumber;
  if (updates.passwordHash !== undefined) payload.password_hash = updates.passwordHash;
  if (updates.email !== undefined) payload.email = normalizeEmail(updates.email);
  if (updates.image !== undefined) payload.image = updates.image;
  if (updates.isVerified !== undefined) payload.is_verified = !!updates.isVerified;
  if (updates.isActive !== undefined) payload.is_active = !!updates.isActive;

  const client = getSupabaseRestClient();
  const response = await client.patch("/users", payload, {
    params: {
      id: `eq.${id}`,
      select: "*",
      limit: 1,
    },
    headers: {
      Prefer: "return=representation",
    },
  });
  return normalizeUser(response.data?.[0]);
}

async function findOtpByEmail(email) {
  const client = getSupabaseRestClient();
  const response = await client.get("/otps", {
    params: {
      select: "*",
      email: `eq.${normalizeEmail(email)}`,
      limit: 1,
    },
  });
  return response.data?.[0] || null;
}

async function upsertOtp(email, otp) {
  const client = getSupabaseRestClient();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const response = await client.post(
    "/otps",
    [
      {
        email: normalizeEmail(email),
        otp: Number(otp),
        expires_at: expiresAt,
      },
    ],
    {
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
    }
  );
  return response.data?.[0] || null;
}

async function deleteOtpByEmail(email) {
  const client = getSupabaseRestClient();
  await client.delete("/otps", {
    params: {
      email: `eq.${normalizeEmail(email)}`,
    },
  });
}

async function findForgotPasswordOtpByEmail(email) {
  const client = getSupabaseRestClient();
  const response = await client.get("/forgot_password_otps", {
    params: {
      select: "*",
      email: `eq.${normalizeEmail(email)}`,
      limit: 1,
    },
  });
  return response.data?.[0] || null;
}

async function upsertForgotPasswordOtp(email, otp) {
  const client = getSupabaseRestClient();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const response = await client.post(
    "/forgot_password_otps",
    [
      {
        email: normalizeEmail(email),
        otp: Number(otp),
        is_verified: false,
        expires_at: expiresAt,
      },
    ],
    {
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
    }
  );

  return response.data?.[0] || null;
}

async function markForgotPasswordOtpVerified(email) {
  const client = getSupabaseRestClient();
  const response = await client.patch(
    "/forgot_password_otps",
    { is_verified: true },
    {
      params: {
        email: `eq.${normalizeEmail(email)}`,
        select: "*",
        limit: 1,
      },
      headers: {
        Prefer: "return=representation",
      },
    }
  );
  return response.data?.[0] || null;
}

async function deleteForgotPasswordOtpByEmail(email) {
  const client = getSupabaseRestClient();
  await client.delete("/forgot_password_otps", {
    params: {
      email: `eq.${normalizeEmail(email)}`,
    },
  });
}

async function upsertUserNotificationDevice({
  userId,
  deviceId,
  registrationToken,
  platform = "unknown",
}) {
  if (!userId || !deviceId || !registrationToken) return;

  const client = getSupabaseRestClient();
  await client.post(
    "/user_notification_devices",
    [
      {
        user_id: userId,
        device_id: deviceId,
        registration_token: registrationToken,
        platform,
      },
    ],
    {
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
    }
  );
}

async function deleteUserNotificationDevicesByUserId(userId) {
  const client = getSupabaseRestClient();
  await client.delete("/user_notification_devices", {
    params: {
      user_id: `eq.${userId}`,
    },
  });
}

async function deleteFavouriteCampaignsByUserId(userId) {
  const client = getSupabaseRestClient();
  await client.delete("/favourite_campaigns", {
    params: {
      user_id: `eq.${userId}`,
    },
  });
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  updateUserById,
  findOtpByEmail,
  upsertOtp,
  deleteOtpByEmail,
  findForgotPasswordOtpByEmail,
  upsertForgotPasswordOtp,
  markForgotPasswordOtpVerified,
  deleteForgotPasswordOtpByEmail,
  upsertUserNotificationDevice,
  deleteUserNotificationDevicesByUserId,
  deleteFavouriteCampaignsByUserId,
};
