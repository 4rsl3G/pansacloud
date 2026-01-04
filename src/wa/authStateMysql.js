import { pool } from "../db.js";
import { initAuthCreds, BufferJSON } from "baileys";

/**
 * Auth state MySQL untuk Baileys v7
 * - creds disimpan di wa_sessions
 * - keys disimpan di wa_keys
 * - JSON harus pakai BufferJSON.replacer/reviver
 */
export async function useMysqlAuthState(sessionName) {
  // 1) Load creds
  const [rows] = await pool.query(
    "SELECT creds_json FROM wa_sessions WHERE session_name=? LIMIT 1",
    [sessionName]
  );

  let creds;
  if (rows.length && rows[0]?.creds_json) {
    // parse with BufferJSON.reviver to restore buffers
    try {
      creds =
        typeof rows[0].creds_json === "string"
          ? JSON.parse(rows[0].creds_json, BufferJSON.reviver)
          : JSON.parse(JSON.stringify(rows[0].creds_json), BufferJSON.reviver);
    } catch {
      creds = null;
    }
  }

  // IMPORTANT: init creds if missing
  if (!creds) {
    creds = initAuthCreds();
    // persist initial creds so next boot won't be null
    await pool.query(
      `INSERT INTO wa_sessions (session_name, creds_json)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE creds_json=VALUES(creds_json)`,
      [sessionName, JSON.stringify(creds, BufferJSON.replacer)]
    );
  }

  const state = {
    creds,
    keys: {
      /**
       * get(type, ids) => { [id]: value }
       */
      get: async (type, ids) => {
        if (!ids?.length) return {};

        const placeholders = ids.map(() => "?").join(",");
        const params = [sessionName, type, ...ids];

        const [krows] = await pool.query(
          `SELECT id, value_json
             FROM wa_keys
            WHERE session_name=? AND type=? AND id IN (${placeholders})`,
          params
        );

        const out = {};
        for (const r of krows) {
          // revive buffers
          const parsed =
            typeof r.value_json === "string"
              ? JSON.parse(r.value_json, BufferJSON.reviver)
              : JSON.parse(JSON.stringify(r.value_json), BufferJSON.reviver);

          out[r.id] = parsed;
        }
        return out;
      },

      /**
       * set({ type: { id: value|null } })
       */
      set: async (data) => {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          for (const [type, entries] of Object.entries(data || {})) {
            for (const [id, value] of Object.entries(entries || {})) {
              if (value === null) {
                await conn.query(
                  "DELETE FROM wa_keys WHERE session_name=? AND type=? AND id=?",
                  [sessionName, type, id]
                );
              } else {
                const valueStr = JSON.stringify(value, BufferJSON.replacer);
                await conn.query(
                  `INSERT INTO wa_keys (session_name, type, id, value_json)
                   VALUES (?,?,?,?)
                   ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)`,
                  [sessionName, type, id, valueStr]
                );
              }
            }
          }

          await conn.commit();
        } catch (e) {
          await conn.rollback();
          throw e;
        } finally {
          conn.release();
        }
      }
    }
  };

  // save creds event
  const saveCreds = async (credsToSave) => {
    const credsStr = JSON.stringify(credsToSave, BufferJSON.replacer);
    await pool.query(
      `INSERT INTO wa_sessions (session_name, creds_json)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE creds_json=VALUES(creds_json)`,
      [sessionName, credsStr]
    );
  };

  return { state, saveCreds };
}
