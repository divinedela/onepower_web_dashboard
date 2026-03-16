const axios = require("axios");

function getSupabaseRestClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase intro service requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
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

function normalizeIntro(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    image: row.image,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listIntros() {
  const client = getSupabaseRestClient();
  const response = await client.get("/intros", {
    params: {
      select: "*",
      order: "created_at.desc",
    },
  });
  return (response.data || []).map(normalizeIntro);
}

async function getIntroById(id) {
  const client = getSupabaseRestClient();
  const response = await client.get("/intros", {
    params: {
      select: "*",
      id: `eq.${id}`,
      limit: 1,
    },
  });
  return normalizeIntro(response.data?.[0]);
}

async function createIntro({ image, title, description, status = "Publish" }) {
  const client = getSupabaseRestClient();
  const response = await client.post(
    "/intros",
    {
      image,
      title,
      description,
      status,
    },
    {
      headers: {
        Prefer: "return=representation",
      },
    }
  );
  return normalizeIntro(response.data?.[0]);
}

async function updateIntroById(id, updates = {}) {
  const payload = {};
  if (updates.image !== undefined) payload.image = updates.image;
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.status !== undefined) payload.status = updates.status;

  const client = getSupabaseRestClient();
  const response = await client.patch("/intros", payload, {
    params: {
      id: `eq.${id}`,
      select: "*",
      limit: 1,
    },
    headers: {
      Prefer: "return=representation",
    },
  });
  return normalizeIntro(response.data?.[0]);
}

async function deleteIntroById(id) {
  const client = getSupabaseRestClient();
  await client.delete("/intros", {
    params: {
      id: `eq.${id}`,
    },
  });
}

async function toggleIntroStatus(id) {
  const intro = await getIntroById(id);
  if (!intro) return null;
  const nextStatus = intro.status === "Publish" ? "UnPublish" : "Publish";
  return updateIntroById(id, { status: nextStatus });
}

module.exports = {
  listIntros,
  getIntroById,
  createIntro,
  updateIntroById,
  deleteIntroById,
  toggleIntroStatus,
};
