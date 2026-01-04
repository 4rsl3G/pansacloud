export function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.role !== "admin") return res.redirect("/login");
  next();
}
export function requireAdminJson(req, res, next) {
  if (!req.session?.user || req.session.user.role !== "admin") return res.status(403).json({ ok:false, msg:"Forbidden" });
  next();
}
