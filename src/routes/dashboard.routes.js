import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireLogin, requireLoginJson } from "../middleware/auth.js";
import { makeSalt32, hashPin, verifyPin } from "../crypto/pinCrypto.js";

export const dashboardRouter = express.Router();

function render(res, view, data){
  if (res.locals.isAjaxNav) return res.render(view, { ...data, layout:false });
  return res.render(view, data);
}

dashboardRouter.get("/dashboard", requireLogin, async (req,res)=>{
  render(res, "dashboard/index", { page:"dashboard", title:"Dashboard" });
});

dashboardRouter.get("/dashboard/files", requireLogin, async (req,res)=>{
  const [r] = await pool.query("SELECT pin_hash FROM users WHERE id=? LIMIT 1", [req.session.user.id]);
  render(res, "dashboard/files", { page:"files", title:"Files", pinSet: !!r[0]?.pin_hash });
});

dashboardRouter.get("/dashboard/profile", requireLogin, async (req,res)=>{
  const [r] = await pool.query("SELECT name,email,phone_e164 FROM users WHERE id=? LIMIT 1", [req.session.user.id]);
  render(res, "dashboard/profile", { page:"profile", title:"Profile", u:r[0] });
});

dashboardRouter.get("/dashboard/security", requireLogin, async (req,res)=>{
  const [r] = await pool.query("SELECT pin_hash FROM users WHERE id=? LIMIT 1", [req.session.user.id]);
  render(res, "dashboard/security", { page:"security", title:"Security", pinSet: !!r[0]?.pin_hash });
});

// stats (server can compute without decrypt)
dashboardRouter.get("/api/dashboard/stats", requireLoginJson, async (req,res)=>{
  const uid = req.session.user.id;
  const [[a]] = await pool.query("SELECT COUNT(*) totalFiles, COALESCE(SUM(blob_size),0) totalBytes FROM files WHERE user_id=?", [uid]);
  const [recent] = await pool.query("SELECT id, blob_size, created_at FROM files WHERE user_id=? ORDER BY id DESC LIMIT 5", [uid]);
  res.json({ ok:true, totalFiles: a.totalFiles, totalBytes: a.totalBytes, recent });
});

// profile update
dashboardRouter.post("/api/profile/update", requireLoginJson, async (req,res)=>{
  const { name, phone_e164 } = req.body || {};
  if(!name || !phone_e164) return res.json({ ok:false, msg:"Lengkapi data" });
  if(!/^\d{10,16}$/.test(phone_e164)) return res.json({ ok:false, msg:"phone_e164 harus angka (contoh 62812...)" });

  try{
    await pool.query("UPDATE users SET name=?, phone_e164=? WHERE id=?", [name, phone_e164, req.session.user.id]);
    req.session.user.name = name;
    res.json({ ok:true, msg:"Profile updated ✅" });
  } catch {
    res.json({ ok:false, msg:"No HP sudah dipakai" });
  }
});

// change password
dashboardRouter.post("/api/security/change-password", requireLoginJson, async (req,res)=>{
  const { oldPassword, newPassword } = req.body || {};
  if(!oldPassword || !newPassword) return res.json({ ok:false, msg:"Lengkapi data" });
  if(newPassword.length < 6) return res.json({ ok:false, msg:"Password min 6" });

  const [rows] = await pool.query("SELECT password_hash FROM users WHERE id=? LIMIT 1", [req.session.user.id]);
  const ok = await bcrypt.compare(oldPassword, rows[0].password_hash);
  if(!ok) return res.json({ ok:false, msg:"Password lama salah" });

  const nh = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash=? WHERE id=?", [nh, req.session.user.id]);
  res.json({ ok:true, msg:"Password diganti ✅" });
});

// set/change pin (server only stores hash, PIN plaintext never stored)
dashboardRouter.post("/api/security/set-pin", requireLoginJson, async (req,res)=>{
  const { pin } = req.body || {};
  if(!pin || !/^\d{4,10}$/.test(pin)) return res.json({ ok:false, msg:"PIN 4-10 digit" });

  const salt = makeSalt32();
  const ph = await hashPin(pin, salt);
  await pool.query("UPDATE users SET pin_hash=?, pin_salt=? WHERE id=?", [ph, salt, req.session.user.id]);
  res.json({ ok:true, msg:"PIN diset ✅" });
});

dashboardRouter.post("/api/security/change-pin", requireLoginJson, async (req,res)=>{
  const { currentPin, newPin } = req.body || {};
  if(!currentPin || !newPin) return res.json({ ok:false, msg:"Lengkapi data" });
  if(!/^\d{4,10}$/.test(newPin)) return res.json({ ok:false, msg:"PIN baru 4-10 digit" });

  const [rows] = await pool.query("SELECT pin_hash FROM users WHERE id=? LIMIT 1", [req.session.user.id]);
  if(!rows[0]?.pin_hash) return res.json({ ok:false, msg:"Belum set PIN" });

  const ok = await verifyPin(currentPin, rows[0].pin_hash);
  if(!ok) return res.json({ ok:false, msg:"PIN lama salah" });

  const salt = makeSalt32();
  const ph = await hashPin(newPin, salt);
  await pool.query("UPDATE users SET pin_hash=?, pin_salt=? WHERE id=?", [ph, salt, req.session.user.id]);
  res.json({ ok:true, msg:"PIN diganti ✅" });
});
