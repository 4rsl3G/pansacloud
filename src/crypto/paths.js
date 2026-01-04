import fs from "fs";
import path from "path";
import crypto from "crypto";

export function ensureUserDir(baseDir, userId) {
  const dir = path.join(baseDir, String(userId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function makeStorageName() {
  return crypto.randomUUID() + ".bin";
}
