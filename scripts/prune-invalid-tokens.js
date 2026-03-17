/**
 * Prune obviously invalid FCM tokens from Supabase.
 * Run with:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/prune-invalid-tokens.js
 */
const axios = require("axios");

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const client = axios.create({
    baseURL: `${supabaseUrl}/rest/v1`,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });

  // Delete rows with null/empty registration_token
  const deleteEmpty = await client.delete("/user_notification_devices", {
    params: { registration_token: "in.(\"\",null)" },
  });

  console.log("Pruned empty tokens:", deleteEmpty.status);
}

main().catch((err) => {
  console.error("Prune failed", err.message);
  process.exit(1);
});
