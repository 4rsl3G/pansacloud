import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";

export const authRouter = express.Router();

authRouter.get("/login", (req,res)=> res.render("auth/login", { page:"login", title:"Login" }));
authRouter.get("/register", (req,res)=> res.render("auth/register", { page:"register", title:"Register" }));

authRouter.post("/api/register", async (req,res)=>{
  const { name, email, phone_e164, password } = req.body || {};
  if(!name || !email || !phone_e164 || !password) return res.json({ ok:false, msg:"Lengkapi data" });
  if(password.length < 6) return res.json({ ok:false, msg:"Password min 6" });
  if(!/^\d{10,16}$/.test(phone_e164)) return res.json({ ok:false, msg:"phone_e164 harus angka (contoh 62812...)" });

  const password_hash = await bcrypt.hash(password, 10);
  try{
    const [r] = await pool.query(
      "INSERT INTO users (name,email,phone_e164,password_hash) VALUES (?,?,?,?)",
      [name, email.toLowerCase(), phone_e164, password_hash]
    );
    req.session.user = { id:r.insertId, name, email: email.toLowerCase(), role:"user" };
    res.json({ ok:true, redirect:"/dashboard", msg:"Register sukses" });
  } catch {
    res.json({ ok:false, msg:"Email/No HP sudah dipakai" });
  }
});

authRouter.post("/api/login", async (req,res)=>{
  const { email, password } = req.body || {};
  const [rows] = await pool.query("SELECT * FROM users WHERE email=? LIMIT 1", [String(email||"").toLowerCase()]);
  if(!rows.length) return res.json({ ok:false, msg:"Akun tidak ditemukan" });
  const u = rows[0];
  const ok = await bcrypt.compare(password||"", u.password_hash);
  if(!ok) return res.json({ ok:false, msg:"Password salah" });

  req.session.user = { id:u.id, name:u.name, email:u.email, role:u.role };
  res.json({ ok:true, redirect:"/dashboard", msg:"Login sukses" });
});

authRouter.post("/logout", (req,res)=> {
  req.session.destroy(()=> res.redirect("/login"));
});
