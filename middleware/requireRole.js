function requireRole(roles = []) {
  const allowed = roles.map((r) => String(r || "").toLowerCase());
  return (req, res, next) => {
    const role = String(req.authRole || req.authUser?.app_metadata?.role || "").toLowerCase();
    if (!allowed.length || allowed.includes(role)) return next();
    return res.status(403).json({
      data: {
        success: 0,
        message: "Forbidden",
        error: 1,
      },
    });
  };
}

module.exports = { requireRole };
