export function requireLogin(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  next();
}
export function requireLoginJson(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ ok: false, msg: "Unauthorized" });
  next();
}
