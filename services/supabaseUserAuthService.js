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
    auth_user_id: row.auth_user_id || null,
    image: row.image || "",
    firstname: row.firstname,
    lastname: row.lastname,
    email: row.email,
    country_code: row.country_code,
    phone_number: row.phone_number,
    isVerified: !!row.is_verified,
    is_active: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingAuthUserIdColumnError(error) {
  const data = error?.response?.data || {};
  const text = [
    String(error?.message || ""),
    String(data?.message || ""),
    String(data?.details || ""),
    String(data?.hint || ""),
    String(data?.code || ""),
  ]
    .join(" ")
    .toLowerCase();

  return (
    text.includes("auth_user_id") &&
    (text.includes("column") ||
      text.includes("schema cache") ||
      text.includes("does not exist") ||
      text.includes("pgrst"))
  );
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

async function findUserByAuthUserId(authUserId) {
  const authId = String(authUserId || "").trim();
  if (!authId) return null;

  const client = getSupabaseRestClient();
  try {
    const response = await client.get("/users", {
      params: {
        select: "*",
        auth_user_id: `eq.${authId}`,
        limit: 1,
      },
    });
    return normalizeUser(response.data?.[0]);
  } catch (error) {
    if (isMissingAuthUserIdColumnError(error)) {
      return null;
    }
    throw error;
  }
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
  authUserId,
}) {
  const client = getSupabaseRestClient();
  const payload = {
    firstname,
    lastname,
    email: normalizeEmail(email),
    country_code: countryCode,
    phone_number: phoneNumber,
    auth_user_id: authUserId || null,
    is_verified: false,
    is_active: true,
  };
  const requestConfig = {
    headers: {
      Prefer: "return=representation",
    },
  };

  try {
    const response = await client.post("/users", payload, requestConfig);
    return normalizeUser(response.data?.[0]);
  } catch (error) {
    if (!isMissingAuthUserIdColumnError(error)) {
      throw error;
    }

    const { auth_user_id, ...fallbackPayload } = payload;
    const fallbackResponse = await client.post(
      "/users",
      fallbackPayload,
      requestConfig
    );
    return normalizeUser(fallbackResponse.data?.[0]);
  }
}

async function updateUserById(id, updates = {}) {
  const payload = {};
  if (updates.firstname !== undefined) payload.firstname = updates.firstname;
  if (updates.lastname !== undefined) payload.lastname = updates.lastname;
  if (updates.countryCode !== undefined) payload.country_code = updates.countryCode;
  if (updates.phoneNumber !== undefined) payload.phone_number = updates.phoneNumber;
  if (updates.email !== undefined) payload.email = normalizeEmail(updates.email);
  if (updates.authUserId !== undefined) payload.auth_user_id = updates.authUserId;
  if (updates.image !== undefined) payload.image = updates.image;
  if (updates.isVerified !== undefined) payload.is_verified = !!updates.isVerified;
  if (updates.isActive !== undefined) payload.is_active = !!updates.isActive;

  const client = getSupabaseRestClient();
  const requestConfig = {
    params: {
      id: `eq.${id}`,
      select: "*",
      limit: 1,
    },
    headers: {
      Prefer: "return=representation",
    },
  };

  try {
    const response = await client.patch("/users", payload, requestConfig);
    return normalizeUser(response.data?.[0]);
  } catch (error) {
    if (
      !isMissingAuthUserIdColumnError(error) ||
      !Object.prototype.hasOwnProperty.call(payload, "auth_user_id")
    ) {
      throw error;
    }

    const { auth_user_id, ...fallbackPayload } = payload;
    const fallbackResponse = await client.patch(
      "/users",
      fallbackPayload,
      requestConfig
    );
    return normalizeUser(fallbackResponse.data?.[0]);
  }
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
      params: {
        on_conflict: "user_id,device_id",
      },
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
  findUserByAuthUserId,
  findUserById,
  createUser,
  updateUserById,
  upsertUserNotificationDevice,
  deleteUserNotificationDevicesByUserId,
  deleteFavouriteCampaignsByUserId,
};
