import express from "express";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import { pool } from "../db.js";

export const downloadRouter = express.Router();

async function getToken(token) {
  const [rows] = await pool.query("SELECT * FROM download_tokens WHERE token=? LIMIT 1", [token]);
  return rows[0] || null;
}

downloadRouter.get("/dl/:token", async (req,res)=>{
  const t = await getToken(req.params.token);
  if(!t) return res.status(404).render("public/download", { layout:false, token:req.params.token, invalid:true, title:"PansaCloud Download" });
  if(new Date(t.expires_at).getTime() < Date.now()) return res.status(410).render("public/download", { layout:false, token:req.params.token, expired:true, title:"PansaCloud Download" });

  if (t.kind === "zip_all") {
    return res.render("public/pack", { layout:false, token:req.params.token, title:"PansaCloud Decrypt Pack" });
  }
  return res.render("public/download", { layout:false, token:req.params.token, title:"PansaCloud Download" });
});

downloadRouter.get("/api/dl/:token/meta", async (req,res)=>{
  const t = await getToken(req.params.token);
  if(!t) return res.json({ ok:false, msg:"Token invalid" });
  if(new Date(t.expires_at).getTime() < Date.now()) return res.json({ ok:false, msg:"Token expired" });

  if(t.kind === "single") {
    const [rows] = await pool.query(
      `SELECT id, blob_size,
              TO_BASE64(name_enc) nameEnc,
              TO_BASE64(mime_enc) mimeEnc
       FROM files WHERE id=? AND user_id=? LIMIT 1`,
      [t.file_id, t.user_id]
    );
    if(!rows.length) return res.json({ ok:false, msg:"File not found" });
    return res.json({ ok:true, kind:"single", ...rows[0] });
  }

  return res.json({ ok:true, kind:"zip_all" });
});

// ciphertext stream for token
downloadRouter.get("/api/dl/:token/raw", async (req,res)=>{
  const t = await getToken(req.params.token);
  if(!t) return res.status(404).end();
  if(new Date(t.expires_at).getTime() < Date.now()) return res.status(410).end();

  if(t.kind === "single") {
    const [rows] = await pool.query("SELECT storage_path, blob_size FROM files WHERE id=? AND user_id=? LIMIT 1", [t.file_id, t.user_id]);
    if(!rows.length) return res.status(404).end();
    res.setHeader("Content-Type","application/octet-stream");
    res.setHeader("Content-Length", String(rows[0].blob_size));
    return fs.createReadStream(rows[0].storage_path).pipe(res);
  }

  // zip_all: stream zip containing ciphertext + manifest (encrypted metadata)
  const [files] = await pool.query(
    `SELECT id, storage_path, blob_size, created_at,
            TO_BASE64(name_enc) nameEnc, TO_BASE64(mime_enc) mimeEnc
     FROM files WHERE user_id=? ORDER BY id DESC`,
    [t.user_id]
  );

  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="pansacloud_encrypted_pack.zip"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", () => res.status(500).end());
  archive.pipe(res);

  archive.append(JSON.stringify(files.map(f => ({
    id: f.id,
    blob_size: f.blob_size,
    created_at: f.created_at,
    nameEnc: f.nameEnc,
    mimeEnc: f.mimeEnc,
    file: path.basename(f.storage_path)
  })), null, 2), { name: "manifest.json" });

  for (const f of files) {
    archive.file(f.storage_path, { name: `files/${path.basename(f.storage_path)}` });
  }

  archive.finalize();
});
