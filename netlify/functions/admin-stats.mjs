/**
 * netlify/functions/admin-stats.mjs
 * GET /api/admin/stats  →  { counts, rows, totalViews }
 */

import { getSupabase, json, corsOptions, isAdmin } from "./_utils.mjs";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return corsOptions();
  if (!isAdmin(event.headers)) return json({ error: "არაავტორიზებული" }, 401);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("clicks")
    .select("delegate_id, count, updated_at")
    .order("count", { ascending: false });

  if (error) {
    console.error("admin-stats error:", error);
    return json({ error: "db error" }, 500);
  }

  const rows = data || [];
  const counts = {};
  let totalViews = 0;

  rows.forEach((row) => {
    counts[row.delegate_id] = row.count;
    totalViews += row.count;
  });

  return json({ counts, rows, totalViews });
};

