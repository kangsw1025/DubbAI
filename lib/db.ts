import { createClient } from "@libsql/client";

let _db: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (!_db) {
    if (!process.env.TURSO_DATABASE_URL) {
      throw new Error("TURSO_DATABASE_URL is not set");
    }
    if (!process.env.TURSO_AUTH_TOKEN) {
      throw new Error("TURSO_AUTH_TOKEN is not set");
    }
    _db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _db;
}

export async function isAllowedUser(email: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT id FROM allowed_users WHERE email = ?",
    args: [email],
  });
  return result.rows.length > 0;
}
