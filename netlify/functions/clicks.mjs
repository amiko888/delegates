/**
 * netlify/functions/clicks.mjs
 *
 * Redirect targets:
 *   POST /api/clicks/:id  → POST /.netlify/functions/clicks?id=:id
 *   GET  /api/clicks      → GET  /.netlify/functions/clicks          (admin)
 *   GET  /api/clicks/:id  → GET  /.netlify/functions/clicks?id=:id   (admin)
 */

import { getSupabase, json, corsOptions, isAdmin } from "./_utils.mjs";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return corsOptions();

  const supabase = getSupabase();
  const idRaw = (event.queryStringParameters || {}).id;
  const id = parseInt(idRaw || "0", 10);

  // ── POST → ნახვის ჩაწერა (public) ──────────────────────────────────────
  if (event.httpMethod === "POST") {
    if (!id || id < 1) return json({ error: "invalid id" }, 400);

    const { error } = await supabase.rpc("increment_click", { did: id });
    if (error) {
      console.error("increment_click RPC error:", error);
      return json({ error: "db error" }, 500);
    }
    return json({ success: true });
  }

  // ── GET → ყველა ნახვა (admin only) ─────────────────────────────────────
  if (event.httpMethod === "GET") {
    if (!isAdmin(event.headers)) return json({ error: "unauthorized" }, 401);

    const query = supabase.from("clicks").select("delegate_id, count");
    if (id && id > 0) query.eq("delegate_id", id);

    const { data, error } = await query;
    if (error) return json({ error: "db error" }, 500);

    const counts = {};
    (data || []).forEach((row) => {
      counts[row.delegate_id] = row.count;
    });
    return json({ counts });
  }

  return json({ error: "method not allowed" }, 405);
};

