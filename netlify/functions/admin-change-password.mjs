/**
 * netlify/functions/admin-change-password.mjs
 * POST /api/admin/change-password  →  { ok, message }
 *
 * Body: { currentPassword, newPassword }
 */

import {
  json,
  corsOptions,
  isAdmin,
  verifyPassword,
  updatePassword,
  parseBody,
} from "./_utils.mjs";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return corsOptions();
  if (!isAdmin(event.headers)) return json({ error: "არაავტორიზებული" }, 401);
  if (event.httpMethod !== "POST") return json({ error: "method not allowed" }, 405);

  const body = parseBody(event);
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (!await verifyPassword(currentPassword)) {
    return json({ error: "მიმდინარე პაროლი არასწორია" }, 400);
  }

  if (!newPassword || newPassword.length < 4) {
    return json({ error: "ახალი პაროლი უნდა შეიცავდეს მინიმუმ 4 სიმბოლოს" }, 400);
  }

  await updatePassword(newPassword);
  return json({ ok: true, message: "პაროლი წარმატებით შეიცვალა" });
};

