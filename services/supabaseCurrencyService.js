const axios = require("axios");

function getSupabaseRestClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase currency service requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
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

function normalizeCurrencyTimezone(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    currency: row.currency,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getCurrencyTimezone() {
  const client = getSupabaseRestClient();
  const response = await client.get("/currency_timezones", {
    params: {
      select: "*",
      order: "updated_at.desc",
      limit: 1,
    },
  });
  return normalizeCurrencyTimezone(response.data?.[0]);
}

module.exports = {
  getCurrencyTimezone,
};
