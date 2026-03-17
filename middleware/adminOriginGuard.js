const url = require("url");

function isSameOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const base = process.env.BASE_URL || "/";
  const expectedHost = url.parse(base).host || req.headers.host;

  const check = (value) => {
    if (!value) return false;
    try {
      const parsed = new url.URL(value, `http://${req.headers.host}`);
      return parsed.host === expectedHost;
    } catch (_) {
      return false;
    }
  };

  return check(origin) || check(referer);
}

function adminOriginGuard(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }

  if (isSameOrigin(req)) return next();

  return res.status(403).send("Forbidden");
}

module.exports = { adminOriginGuard };
