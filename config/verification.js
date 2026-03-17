// Supabase-only: verification gates are no-ops now.
const verifyAccess = async (_req, _res, next) => next();
const verifyAdminAccess = async (_req, _res, next) => next();

module.exports = {
  verifyAccess,
  verifyAdminAccess,
};
