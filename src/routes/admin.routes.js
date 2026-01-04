import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAdmin, requireAdminJson } from "../middleware/admin.js";
import { makeSalt32, hashPin } from "../crypto/pinCrypto.js";

export const adminRouter = express.Router();

function render(res, view, data){
  if (res.locals.isAjaxNav) return res.render(view, { ...data, layout:false });
  return res.render(view, data);
}

adminRouter.get("/admin/users", requireAdmin, async (req,res)=>{
  const [rows] = await pool.query(
    `SELECT u.id,u.role,u.name,u.email,u.phone_e164,u.created_at,
            (SELECT COALESCE(SUM(blob_size),0) FROM files f WHERE f.user_id=u.id) storageBytes,
            (SELECT COUNT(*) FROM files f WHERE f.user_id=u.id) totalFiles
     FROM users u ORDER BY u.id DESC LIMIT 500`
  );
  render(res, "admin/users", { page:"admin-users", title:"Admin Users", users: rows });
});

adminRouter.post("/admin/api/users/:id/reset-password", requireAdminJson, async (req,res)=>{
  const id = Number(req.params.id);
  const { newPassword } = req.body || {};
  if(!newPassword || newPassword.length < 6) return res.json({ ok:false, msg:"Password min 6" });
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash=? WHERE id=?", [hash, id]);
  res.json({ ok:true, msg:"Password reset ✅" });
});

adminRouter.post("/admin/api/users/:id/reset-pin", requireAdminJson, async (req,res)=>{
  const id = Number(req.params.id);
  const { newPin } = req.body || {};
  if(!newPin || !/^\d{4,10}$/.test(newPin)) return res.json({ ok:false, msg:"PIN 4-10 digit" });
  const salt = makeSalt32();
  const ph = await hashPin(newPin, salt);
  await pool.query("UPDATE users SET pin_hash=?, pin_salt=? WHERE id=?", [ph, salt, id]);
  res.json({ ok:true, msg:"PIN reset ✅" });
});

adminRouter.get("/admin/whatsapp", requireAdmin, (req,res)=>{
  render(res, "admin/whatsapp", { page:"admin-wa", title:"Admin WhatsApp" });
});
