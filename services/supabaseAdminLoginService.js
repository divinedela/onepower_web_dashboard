const axios = require("axios");

function getSupabaseRestClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase admin auth requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
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

function normalizeAdmin(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password_hash,
    contact: row.contact,
    avatar: row.avatar,
    isAdmin: Number(row.is_admin || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findAdminByEmail(email) {
  const client = getSupabaseRestClient();
  const response = await client.get("/admin_logins", {
    params: {
      select: "*",
      email: `eq.${String(email || "").trim().toLowerCase()}`,
      limit: 1,
    },
  });
  return normalizeAdmin(response.data?.[0]);
}

async function findAdminById(id) {
  const client = getSupabaseRestClient();
  const response = await client.get("/admin_logins", {
    params: {
      select: "*",
      id: `eq.${id}`,
      limit: 1,
    },
  });
  return normalizeAdmin(response.data?.[0]);
}

async function updateAdminById(id, updates) {
  const payload = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.contact !== undefined) payload.contact = updates.contact;
  if (updates.avatar !== undefined) payload.avatar = updates.avatar;
  if (updates.passwordHash !== undefined) {
    payload.password_hash = updates.passwordHash;
  }

  const client = getSupabaseRestClient();
  const response = await client.patch("/admin_logins", payload, {
    params: {
      id: `eq.${id}`,
      select: "*",
      limit: 1,
    },
    headers: {
      Prefer: "return=representation",
    },
  });
  return normalizeAdmin(response.data?.[0]);
}

module.exports = {
  findAdminByEmail,
  findAdminById,
  updateAdminById,
};
