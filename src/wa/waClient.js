import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { pool } from "../db.js";
import { useMysqlAuthState } from "./authStateMysql.js";
import { verifyPin } from "../crypto/pinCrypto.js";
import { createDownloadToken } from "../crypto/token.js";

const TOKEN_MIN = Number(process.env.TOKEN_EXPIRE_MIN || 10);

async function getUserByPhone(phone_e164) {
  const [rows] = await pool.query(
    "SELECT id, pin_hash FROM users WHERE phone_e164=? LIMIT 1",
    [phone_e164]
  );
  return rows[0] || null;
}

async function isUnlocked(userId) {
  const [r] = await pool.query("SELECT is_unlocked FROM wa_unlocks WHERE user_id=? LIMIT 1", [userId]);
  return r[0]?.is_unlocked === 1;
}

async function setUnlocked(userId, val) {
  await pool.query(
    `INSERT INTO wa_unlocks (user_id, is_unlocked, unlocked_at)
     VALUES (?, ?, IF(?, NOW(), NULL))
     ON DUPLICATE KEY UPDATE is_unlocked=VALUES(is_unlocked), unlocked_at=VALUES(unlocked_at)`,
    [userId, val ? 1 : 0, val ? 1 : 0]
  );
}

export async function startWa(io, sessionName) {
  const { state, saveCreds } = await useMysqlAuthState(sessionName);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    version = undefined; // fallback internal
  }

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: { creds: state.creds, keys: state.keys }
  });

  sock.ev.on("creds.update", async () => saveCreds(sock.authState.creds));

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) io.emit("wa:qr", { qr });
    if (connection === "open") io.emit("wa:status", { status: "connected" });

    if (connection === "close") {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      io.emit("wa:status", { status: "disconnected", shouldReconnect, code });
      if (shouldReconnect) setTimeout(() => startWa(io, sessionName), 2000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid;

      // ignore group
      if (remoteJid.endsWith("@g.us")) continue;

      const jid = jidNormalizedUser(remoteJid);
      const phone = jid.split("@")[0]; // assume phone_e164 stored like 62812...

      const user = await getUserByPhone(phone);
      if (!user) continue; // only registered users responded

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      if (!text.startsWith(".")) continue;

      const reply = (t) => sock.sendMessage(remoteJid, { text: t });
      const [cmdRaw, ...args] = text.trim().split(/\s+/);
      const cmd = cmdRaw.toLowerCase();

      if (cmd === ".help") {
        return reply(["Perintah:",
          ".pin <PIN>",
          ".logout",
          ".list",
          ".get <id>",
          ".downloadall"
        ].join("\n"));
      }

      if (cmd === ".pin") {
        const pin = args[0] || "";
        if (!user.pin_hash) return reply("Kamu belum set PIN di panel web.");
        const ok = await verifyPin(pin, user.pin_hash);
        if (!ok) return reply("PIN salah ❌");
        await setUnlocked(user.id, true);
        return reply("Unlocked ✅ (tetap aktif sampai kamu kirim .logout)");
      }

      if (cmd === ".logout") {
        await setUnlocked(user.id, false);
        return reply("Logout ✅ akses terkunci kembali.");
      }

      const unlocked = await isUnlocked(user.id);
      if (!unlocked) return reply("Terkunci 🔒 Kirim .pin <PIN> dulu.");

      if (cmd === ".list") {
        const [rows] = await pool.query(
          "SELECT id, blob_size, created_at FROM files WHERE user_id=? ORDER BY id DESC LIMIT 20",
          [user.id]
        );
        if (!rows.length) return reply("Belum ada file.");
        return reply(rows.map(r => `#${r.id} (${r.blob_size} bytes)`).join("\n"));
      }

      if (cmd === ".get") {
        const fileId = Number(args[0]);
        if (!fileId) return reply("Format: .get <id>");
        const [exists] = await pool.query(
          "SELECT id FROM files WHERE id=? AND user_id=? LIMIT 1",
          [fileId, user.id]
        );
        if (!exists.length) return reply("File tidak ditemukan.");
        const token = await createDownloadToken(user.id, "single", fileId, TOKEN_MIN);
        return reply(`Link download (decrypt pakai PIN): ${process.env.APP_BASE_URL}/dl/${token}`);
      }

      if (cmd === ".downloadall") {
        const token = await createDownloadToken(user.id, "zip_all", null, TOKEN_MIN);
        return reply(`Link download semua (Decrypt Pack): ${process.env.APP_BASE_URL}/dl/${token}`);
      }
    }
  });

  return sock;
}
