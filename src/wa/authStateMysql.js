import { pool } from "../db.js";

export async function useMysqlAuthState(sessionName) {
  const [rows] = await pool.query(
    "SELECT creds_json FROM wa_sessions WHERE session_name=? LIMIT 1",
    [sessionName]
  );

  const state = {
    creds: rows.length ? rows[0].creds_json : null,
    keys: {
      get: async (type, ids) => {
        if (!ids?.length) return {};
        const placeholders = ids.map(() => "?").join(",");
        const params = [sessionName, type, ...ids];
        const [krows] = await pool.query(
          `SELECT id, value_json FROM wa_keys
           WHERE session_name=? AND type=? AND id IN (${placeholders})`,
          params
        );
        const out = {};
        for (const r of krows) out[r.id] = r.value_json;
        return out;
      },
      set: async (data) => {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              if (value === null) {
                await conn.query(
                  "DELETE FROM wa_keys WHERE session_name=? AND type=? AND id=?",
                  [sessionName, type, id]
                );
              } else {
                await conn.query(
                  `INSERT INTO wa_keys (session_name, type, id, value_json)
                   VALUES (?,?,?,?)
                   ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)`,
                  [sessionName, type, id, JSON.stringify(value)]
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

  const saveCreds = async (credsToSave) => {
    await pool.query(
      `INSERT INTO wa_sessions (session_name, creds_json)
       VALUES (?,?)
       ON DUPLICATE KEY UPDATE creds_json=VALUES(creds_json)`,
      [sessionName, JSON.stringify(credsToSave)]
    );
  };

  return { state, saveCreds };
}
