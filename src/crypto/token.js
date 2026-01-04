import crypto from "crypto";
import { pool } from "../db.js";

export async function createDownloadToken(userId, kind, fileId=null, minutes=10) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  await pool.query(
    `INSERT INTO download_tokens (token, user_id, kind, file_id, expires_at)
     VALUES (?,?,?,?,?)`,
    [token, userId, kind, fileId, expiresAt]
  );

  return token;
}
