import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser
} from "baileys";
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
  const [r] = await pool.query(
    "SELECT is_unlocked FROM wa_unlocks WHERE user_id=? LIMIT 1",
    [userId]
  );
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

function getText(msg) {
  return (
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    ""
  ).trim();
}

export async function startWa(io, sessionName) {
  const { state, saveCreds } = await useMysqlAuthState(sessionName);

  // get latest WA Web version (optional but good)
  let version;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v?.version;
  } catch {
    version = undefined;
  }

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: { creds: state.creds, keys: state.keys },
    // recommended in many deployments
    generateHighQualityLinkPreview: true,
    syncFullHistory: false
  });

  // persist creds
  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds(sock.authState.creds);
    } catch (e) {
      console.error("saveCreds error:", e);
    }
  });

  // QR + status for admin panel
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) io.emit("wa:qr", { qr });
    if (connection === "open") io.emit("wa:status", { status: "connected" });

    if (connection === "close") {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;

      // reconnect unless logged out
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      io.emit("wa:status", { status: "disconnected", shouldReconnect, code });

      if (shouldReconnect) {
        // slight delay for stability
        setTimeout(() => startWa(io, sessionName), 2000);
      } else {
        io.emit("wa:status", { status: "logged_out" });
      }
    }
  });

  // messages
  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages || []) {
      try {
        if (!msg?.message) continue;
        if (msg.key?.fromMe) continue;

        const remoteJid = msg.key?.remoteJid || "";
        if (!remoteJid) continue;

        // ignore group
        if (remoteJid.endsWith("@g.us")) continue;

        const jid = jidNormalizedUser(remoteJid);
        const phone = jid.split("@")[0]; // store phone_e164 like 62812...

        const user = await getUserByPhone(phone);
        if (!user) continue; // only registered user responded

        const text = getText(msg);
        if (!text.startsWith(".")) continue;

        const reply = (t) => sock.sendMessage(remoteJid, { text: t });

        const [cmdRaw, ...args] = text.split(/\s+/);
        const cmd = cmdRaw.toLowerCase();

        if (cmd === ".help") {
          await reply(
            [
              "PansaCloud Bot:",
              ".pin <PIN>",
              ".logout",
              ".list",
              ".get <id>",
              ".downloadall"
            ].join("\n")
          );
          continue;
        }

        if (cmd === ".pin") {
          const pin = args[0] || "";
          if (!user.pin_hash) {
            await reply("Kamu belum set PIN di panel web.");
            continue;
          }
          const ok = await verifyPin(pin, user.pin_hash);
          if (!ok) {
            await reply("PIN salah ❌");
            continue;
          }
          await setUnlocked(user.id, true);
          await reply("Unlocked ✅ (tetap aktif sampai kamu kirim .logout)");
          continue;
        }

        if (cmd === ".logout") {
          await setUnlocked(user.id, false);
          await reply("Logout ✅ akses terkunci kembali.");
          continue;
        }

        // must be unlocked
        const unlocked = await isUnlocked(user.id);
        if (!unlocked) {
          await reply("Terkunci 🔒 Kirim .pin <PIN> dulu.");
          continue;
        }

        if (cmd === ".list") {
          const [rows] = await pool.query(
            "SELECT id, blob_size, created_at FROM files WHERE user_id=? ORDER BY id DESC LIMIT 20",
            [user.id]
          );
          if (!rows.length) {
            await reply("Belum ada file.");
            continue;
          }
          const lines = rows.map(
            (r) => `#${r.id} • ${r.blob_size} bytes • ${new Date(r.created_at).toLocaleString()}`
          );
          await reply(lines.join("\n"));
          continue;
        }

        if (cmd === ".get") {
          const fileId = Number(args[0]);
          if (!fileId) {
            await reply("Format: .get <id>");
            continue;
          }

          const [exists] = await pool.query(
            "SELECT id FROM files WHERE id=? AND user_id=? LIMIT 1",
            [fileId, user.id]
          );
          if (!exists.length) {
            await reply("File tidak ditemukan.");
            continue;
          }

          const token = await createDownloadToken(user.id, "single", fileId, TOKEN_MIN);
          await reply(`Link download (decrypt pakai PIN): ${process.env.APP_BASE_URL}/dl/${token}`);
          continue;
        }

        if (cmd === ".downloadall") {
          const token = await createDownloadToken(user.id, "zip_all", null, TOKEN_MIN);
          await reply(`Link download semua (Decrypt Pack): ${process.env.APP_BASE_URL}/dl/${token}`);
          continue;
        }

        // unknown command
        await reply("Perintah tidak dikenal. Kirim .help");
      } catch (e) {
        console.error("WA handler error:", e);
      }
    }
  });

  return sock;
}
