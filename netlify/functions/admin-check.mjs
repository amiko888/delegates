/**
 * netlify/functions/admin-check.mjs
 * GET /api/admin/check  →  { authenticated: bool }
 */

import { json, corsOptions, isAdmin } from "./_utils.mjs";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return corsOptions();
  const authenticated = isAdmin(event.headers);
  return json({ authenticated }, authenticated ? 200 : 401);
};

