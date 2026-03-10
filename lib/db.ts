import { createClient } from "@libsql/client";

if (!process.env.TURSO_DATABASE_URL) {
  throw new Error("TURSO_DATABASE_URL is not set");
}
if (!process.env.TURSO_AUTH_TOKEN) {
  throw new Error("TURSO_AUTH_TOKEN is not set");
}

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function isAllowedUser(email: string): Promise<boolean> {
  const result = await db.execute({
    sql: "SELECT id FROM allowed_users WHERE email = ?",
    args: [email],
  });
  return result.rows.length > 0;
}
