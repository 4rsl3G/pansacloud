import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { pool } from "../db.js";
import { requireLoginJson } from "../middleware/auth.js";
import { ensureUserDir, makeStorageName } from "../crypto/paths.js";
import { createDownloadToken } from "../crypto/token.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300*1024*1024 }});
export const filesRouter = express.Router();

filesRouter.post("/api/files/upload", requireLoginJson, upload.single("encfile"), async (req,res)=>{
  const uid = req.session.user.id;
  const base = process.env.STORAGE_DIR || "./storage";
  if(!req.file) return res.json({ ok:false, msg:"File wajib" });

  const nameEnc = req.body.nameEnc;
  const mimeEnc = req.body.mimeEnc;
  if(!nameEnc || !mimeEnc) return res.json({ ok:false, msg:"Metadata encrypt wajib" });

  const dir = ensureUserDir(base, uid);
  const fname = makeStorageName();
  const storagePath = path.join(dir, fname);
  fs.writeFileSync(storagePath, req.file.buffer);

  await pool.query(
    `INSERT INTO files (user_id, storage_path, blob_size, name_enc, mime_enc)
     VALUES (?,?,?,?,?)`,
    [uid, storagePath, req.file.size, Buffer.from(nameEnc,"base64"), Buffer.from(mimeEnc,"base64")]
  );

  res.json({ ok:true, msg:"Upload terenkripsi ✅" });
});

filesRouter.get("/api/files/list", requireLoginJson, async (req,res)=>{
  const uid = req.session.user.id;
  const [rows] = await pool.query(
    `SELECT id, blob_size, created_at,
            TO_BASE64(name_enc) nameEnc,
            TO_BASE64(mime_enc) mimeEnc
     FROM files WHERE user_id=? ORDER BY id DESC LIMIT 500`,
    [uid]
  );
  res.json({ ok:true, data: rows });
});

filesRouter.get("/api/files/raw/:id", requireLoginJson, async (req,res)=>{
  const uid = req.session.user.id;
  const id = Number(req.params.id);
  const [rows] = await pool.query("SELECT storage_path, blob_size FROM files WHERE id=? AND user_id=? LIMIT 1", [id, uid]);
  if(!rows.length) return res.status(404).end();
  res.setHeader("Content-Type","application/octet-stream");
  res.setHeader("Content-Length", String(rows[0].blob_size));
  fs.createReadStream(rows[0].storage_path).pipe(res);
});

filesRouter.delete("/api/files/:id", requireLoginJson, async (req,res)=>{
  const uid = req.session.user.id;
  const id = Number(req.params.id);
  const [rows] = await pool.query("SELECT storage_path FROM files WHERE id=? AND user_id=? LIMIT 1", [id, uid]);
  if(!rows.length) return res.json({ ok:false, msg:"Not found" });
  try { fs.unlinkSync(rows[0].storage_path); } catch {}
  await pool.query("DELETE FROM files WHERE id=? AND user_id=?", [id, uid]);
  res.json({ ok:true, msg:"Deleted ✅" });
});

// Create public link (single)
filesRouter.post("/api/files/link/:id", requireLoginJson, async (req,res)=>{
  const uid = req.session.user.id;
  const id = Number(req.params.id);
  const [rows] = await pool.query("SELECT id FROM files WHERE id=? AND user_id=? LIMIT 1", [id, uid]);
  if(!rows.length) return res.json({ ok:false, msg:"Not found" });
  const token = await createDownloadToken(uid, "single", id, Number(process.env.TOKEN_EXPIRE_MIN||10));
  res.json({ ok:true, url: `${process.env.APP_BASE_URL}/dl/${token}` });
});

// Create public link (all)
filesRouter.post("/api/files/link-all", requireLoginJson, async (req,res)=>{
  const uid = req.session.user.id;
  const token = await createDownloadToken(uid, "zip_all", null, Number(process.env.TOKEN_EXPIRE_MIN||10));
  res.json({ ok:true, url: `${process.env.APP_BASE_URL}/dl/${token}` });
});
