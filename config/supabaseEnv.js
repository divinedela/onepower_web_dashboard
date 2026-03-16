const REQUIRED_SUPABASE_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function maskValue(value) {
  if (!value) return "";
  if (value.length <= 10) return "***";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getSupabaseEnvStatus(env = process.env) {
  const missing = REQUIRED_SUPABASE_ENV.filter((key) => !env[key]);
  return {
    ok: missing.length === 0,
    missing,
    values: {
      SUPABASE_URL: env.SUPABASE_URL || "",
      SUPABASE_ANON_KEY: maskValue(env.SUPABASE_ANON_KEY || ""),
      SUPABASE_SERVICE_ROLE_KEY: maskValue(env.SUPABASE_SERVICE_ROLE_KEY || ""),
    },
  };
}

function logSupabaseEnvStatus(logger, env = process.env) {
  const status = getSupabaseEnvStatus(env);
  if (status.ok) {
    logger.info("Supabase env check passed");
  } else {
    logger.warn("Supabase env check failed", {
      missing: status.missing,
      values: status.values,
    });
  }
  return status;
}

module.exports = {
  REQUIRED_SUPABASE_ENV,
  getSupabaseEnvStatus,
  logSupabaseEnvStatus,
};
