import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";

export const authRouter = express.Router();

authRouter.get("/login", (req, res) =>
  res.render("auth/login", { page: "login", title: "Login" })
);

authRouter.get("/register", (req, res) =>
  res.render("auth/register", { page: "register", title: "Register" })
);

/** (Opsional) debug cek session */
authRouter.get("/api/me", (req, res) => {
  res.json({ ok: true, session: req.session?.user || null });
});

authRouter.post("/api/register", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const emailRaw = String(req.body?.email || "").trim().toLowerCase();
    const phone_e164 = String(req.body?.phone_e164 || "").trim();
    const password = String(req.body?.password || "");

    if (!name || !emailRaw || !phone_e164 || !password) {
      return res.status(400).json({ ok: false, msg: "Lengkapi data" });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, msg: "Password min 6" });
    }
    if (!/^\d{10,16}$/.test(phone_e164)) {
      return res.status(400).json({ ok: false, msg: "phone_e164 harus angka (contoh 62812...)" });
    }
    // simple email check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return res.status(400).json({ ok: false, msg: "Format email tidak valid" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [r] = await pool.query(
      "INSERT INTO users (name,email,phone_e164,password_hash,role) VALUES (?,?,?,?,?)",
      [name, emailRaw, phone_e164, password_hash, "user"]
    );

    // set session -> langsung login
    req.session.user = {
      id: r.insertId,
      name,
      email: emailRaw,
      phone: phone_e164,
      role: "user"
    };

    return res.json({ ok: true, redirect: "/dashboard", msg: "Register sukses" });
  } catch (e) {
    // duplicate entry handling
    if (e && e.code === "ER_DUP_ENTRY") {
      const msg = String(e.message || "").includes("email")
        ? "Email sudah dipakai"
        : String(e.message || "").includes("phone")
          ? "No HP sudah dipakai"
          : "Email/No HP sudah dipakai";
      return res.status(409).json({ ok: false, msg });
    }
    console.error("REGISTER ERROR:", e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

authRouter.post("/api/login", async (req, res) => {
  try {
    const emailRaw = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!emailRaw || !password) {
      return res.status(400).json({ ok: false, msg: "Email & password wajib diisi" });
    }

    const [rows] = await pool.query(
      "SELECT id,name,email,phone_e164,password_hash,role FROM users WHERE email=? LIMIT 1",
      [emailRaw]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, msg: "Akun tidak ditemukan" });
    }

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, msg: "Password salah" });
    }

    req.session.user = {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone_e164,
      role: u.role || "user"
    };

    return res.json({ ok: true, redirect: "/dashboard", msg: "Login sukses" });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return res.status(500).json({ ok: false, msg: "Server error" });
  }
});

authRouter.post("/logout", (req, res) => {
  // clear cookie + destroy session
  res.clearCookie("connect.sid");
  req.session.destroy(() => res.redirect("/login"));
});
