#!/usr/bin/env node

require("dotenv").config();
const axios = require("axios");

function parseArgs(argv) {
  const out = {
    email: "",
    name: "",
    contact: "",
    avatar: "",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--email" && argv[i + 1]) out.email = String(argv[++i] || "");
    else if (a === "--name" && argv[i + 1]) out.name = String(argv[++i] || "");
    else if (a === "--contact" && argv[i + 1]) out.contact = String(argv[++i] || "");
    else if (a === "--avatar" && argv[i + 1]) out.avatar = String(argv[++i] || "");
    else if (a === "--dry-run") out.dryRun = true;
  }

  out.email = out.email.trim().toLowerCase();
  out.name = out.name.trim();
  out.contact = out.contact.trim();
  out.avatar = out.avatar.trim();
  return out;
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function getRestClient() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return axios.create({
    baseURL: `${supabaseUrl}/rest/v1`,
    timeout: 20000,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });
}

function getAuthAdminClient() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return axios.create({
    baseURL: `${supabaseUrl}/auth/v1`,
    timeout: 20000,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });
}

async function findAuthUserByEmail(authAdminClient, email) {
  const perPage = 200;
  for (let page = 1; page <= 30; page += 1) {
    const resp = await authAdminClient.get("/admin/users", {
      params: { page, per_page: perPage },
    });
    const users = Array.isArray(resp.data?.users) ? resp.data.users : [];
    if (!users.length) return null;
    const hit = users.find(
      (u) => String(u?.email || "").trim().toLowerCase() === email
    );
    if (hit) return hit;
    if (users.length < perPage) return null;
  }
  return null;
}

async function getSingleRowByEmail(restClient, table, email) {
  const resp = await restClient.get(`/${table}`, {
    params: {
      select: "*",
      email: `eq.${email}`,
      limit: 1,
    },
  });
  return resp.data?.[0] || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email) {
    throw new Error(
      "Usage: node scripts/promote-user-admin.js --email user@example.com [--name \"Admin Name\"] [--contact \"...\"] [--avatar \"...\"] [--dry-run]"
    );
  }

  const restClient = getRestClient();
  const authAdminClient = getAuthAdminClient();

  const authUser = await findAuthUserByEmail(authAdminClient, args.email);
  if (!authUser?.id) {
    throw new Error(
      `No Supabase auth user found for ${args.email}. Ask the user to sign up first.`
    );
  }

  const userProfile = await getSingleRowByEmail(restClient, "users", args.email);
  const adminRow = await getSingleRowByEmail(restClient, "admin_logins", args.email);

  const fallbackNameFromEmail = args.email.split("@")[0] || "admin";
  const inferredName = [userProfile?.firstname, userProfile?.lastname]
    .filter(Boolean)
    .join(" ")
    .trim();
  const name = args.name || adminRow?.name || inferredName || fallbackNameFromEmail;
  const contact = args.contact || adminRow?.contact || userProfile?.phone_number || "";
  const avatar = args.avatar || adminRow?.avatar || userProfile?.image || "";

  const authUserUpdatePayload = {
    app_metadata: {
      ...(authUser.app_metadata || {}),
      role: "admin",
    },
    user_metadata: {
      ...(authUser.user_metadata || {}),
      name,
    },
  };

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          email: args.email,
          authUserId: authUser.id,
          willUpdateAuthMetadata: authUserUpdatePayload,
          adminRowExists: !!adminRow,
          adminRowPayloadPreview: {
            email: args.email,
            name,
            contact,
            avatar,
            is_admin: 1,
            auth_user_id: authUser.id,
          },
        },
        null,
        2
      )
    );
    return;
  }

  await authAdminClient.put(`/admin/users/${authUser.id}`, authUserUpdatePayload);

  if (adminRow?.id) {
    await restClient.patch(
      "/admin_logins",
      {
        name,
        contact,
        avatar,
        is_admin: 1,
        auth_user_id: authUser.id,
      },
      {
        params: {
          id: `eq.${adminRow.id}`,
        },
      }
    );
  } else {
    await restClient.post("/admin_logins", {
      name,
      email: args.email,
      contact,
      avatar,
      is_admin: 1,
      auth_user_id: authUser.id,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        email: args.email,
        authUserId: authUser.id,
        action: adminRow?.id ? "updated_admin_row" : "created_admin_row",
        message:
          "Admin access granted. User can sign in at admin login with their Supabase credentials.",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error?.message || "Unknown error",
      },
      null,
      2
    )
  );
  process.exit(1);
});
