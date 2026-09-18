/**
 * netlify/functions/admin-logout.mjs
 * POST /api/admin/logout  →  { ok: true }
 *
 * JWTs are stateless — actual logout is handled client-side by deleting
 * the token from localStorage/sessionStorage.  This endpoint just returns
 * 200 so the existing admin.js code path continues to work unchanged.
 */

import { json, corsOptions } from "./_utils.mjs";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return corsOptions();
  return json({ ok: true });
};

