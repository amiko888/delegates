/**
 * netlify/functions/admin-login.mjs
 * POST /api/admin/login  →  { ok, token }
 */

import { json, corsOptions, signToken, verifyPassword, parseBody } from "./_utils.mjs";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return corsOptions();
  if (event.httpMethod !== "POST") return json({ error: "method not allowed" }, 405);

  const body = parseBody(event);
  const password = String(body.password || "");

  if (!password) return json({ ok: false, error: "პაროლი აუცილებელია" }, 400);

  const valid = await verifyPassword(password);
  if (!valid) return json({ ok: false, error: "პაროლი არასწორია" }, 401);

  const token = signToken();
  return json({ ok: true, token });
};

