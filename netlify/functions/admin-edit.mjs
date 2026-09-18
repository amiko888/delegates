/**
 * netlify/functions/admin-edit.mjs
 * POST /api/admin/clicks/:id  →  { ok, id, count }
 *
 * Body: { count: number }   (set absolute value, not increment)
 */

import { getSupabase, json, corsOptions, isAdmin, parseBody } from "./_utils.mjs";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return corsOptions();
  if (!isAdmin(event.headers)) return json({ error: "არაავტორიზებული" }, 401);
  if (event.httpMethod !== "POST") return json({ error: "method not allowed" }, 405);

  const id = parseInt((event.queryStringParameters || {}).id || "0", 10);
  if (!id || id < 1) return json({ error: "invalid id" }, 400);

  const body = parseBody(event);
  const count = Math.max(0, Number(body.count) || 0);

  const supabase = getSupabase();
  const { error } = await supabase.from("clicks").upsert(
    { delegate_id: id, count, updated_at: new Date().toISOString() },
    { onConflict: "delegate_id" }
  );

  if (error) {
    console.error("admin-edit upsert error:", error);
    return json({ error: "db error" }, 500);
  }

  return json({ ok: true, id, count });
};

