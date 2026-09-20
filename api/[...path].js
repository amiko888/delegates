"use strict";

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminSecret = process.env.ADMIN_SECRET || "change-this-admin-secret";
const defaultPassword = process.env.ADMIN_PASSWORD || "admin123";

function json(res, status, body) {
  res.status(status).setHeader("Cache-Control", "no-store");
  return res.json(body);
}

function db() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch (error) {
    return {};
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: hashPassword(password, salt) };
}

function validPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const actual = Buffer.from(hashPassword(password, record.salt), "hex");
  const expected = Buffer.from(record.hash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function createToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 30 * 86400000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", adminSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function isAdmin(req) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", adminSecret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return false;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch (error) {
    return false;
  }
}

function requestPath(req) {
  return new URL(req.url, "https://vercel.local").pathname.replace(/^\/api\/?/, "");
}

async function getAdminRecord(client) {
  const { data, error } = await client.from("admin_settings").select("password_hash, password_salt").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data;
}

module.exports = async function handler(req, res) {
  try {
    const path = requestPath(req);
    const client = db();

    if (req.method === "OPTIONS") return res.status(204).end();

    if (path === "admin/login" && req.method === "POST") {
      const password = String(readBody(req).password || "");
      const record = await getAdminRecord(client);
      const valid = record ? validPassword(password, { salt: record.password_salt, hash: record.password_hash }) : password === defaultPassword;
      if (!valid) return json(res, 401, { ok: false, error: "პაროლი არასწორია" });
      if (!record) {
        const initial = passwordRecord(defaultPassword);
        await client.from("admin_settings").upsert({ id: 1, password_hash: initial.hash, password_salt: initial.salt });
      }
      return json(res, 200, { ok: true, token: createToken() });
    }

    if (path === "admin/check" && req.method === "GET") {
      return json(res, isAdmin(req) ? 200 : 401, { authenticated: isAdmin(req) });
    }

    if (path === "admin/logout" && req.method === "POST") return json(res, 200, { ok: true });

    if (path === "clicks" && req.method === "GET") {
      if (!isAdmin(req)) return json(res, 401, { error: "unauthorized" });
      const { data, error } = await client.from("delegate_clicks").select("delegate_id, count").order("count", { ascending: false });
      if (error) throw error;
      return json(res, 200, { counts: Object.fromEntries((data || []).map((row) => [row.delegate_id, row.count])) });
    }

    const clickMatch = path.match(/^clicks\/(\d+)$/);
    if (clickMatch && req.method === "POST") {
      const { data, error } = await client.rpc("increment_delegate_click", { delegate_id_input: Number(clickMatch[1]) });
      if (error) throw error;
      return json(res, 200, { success: true, count: data });
    }

    if (path === "admin/stats" && req.method === "GET") {
      if (!isAdmin(req)) return json(res, 401, { error: "არაავტორიზებული" });
      const { data, error } = await client.from("delegate_clicks").select("delegate_id, count, updated_at").order("count", { ascending: false });
      if (error) throw error;
      const counts = Object.fromEntries((data || []).map((row) => [row.delegate_id, row.count]));
      return json(res, 200, { counts, rows: data || [], totalViews: Object.values(counts).reduce((sum, count) => sum + Number(count), 0) });
    }

    const editMatch = path.match(/^admin\/clicks\/(\d+)$/);
    if (editMatch && req.method === "POST") {
      if (!isAdmin(req)) return json(res, 401, { error: "არაავტორიზებული" });
      const count = Math.max(0, Number(readBody(req).count) || 0);
      const { error } = await client.from("delegate_clicks").upsert({ delegate_id: Number(editMatch[1]), count, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json(res, 200, { ok: true, id: Number(editMatch[1]), count });
    }

    if (path === "admin/change-password" && req.method === "POST") {
      if (!isAdmin(req)) return json(res, 401, { error: "არაავტორიზებული" });
      const body = readBody(req);
      const current = await getAdminRecord(client);
      const currentValid = current ? validPassword(String(body.currentPassword || ""), { salt: current.password_salt, hash: current.password_hash }) : String(body.currentPassword || "") === defaultPassword;
      const newPassword = String(body.newPassword || "");
      if (!currentValid) return json(res, 400, { error: "მიმდინარე პაროლი არასწორია" });
      if (newPassword.length < 4) return json(res, 400, { error: "ახალი პაროლი უნდა შეიცავდეს მინიმუმ 4 სიმბოლოს" });
      const next = passwordRecord(newPassword);
      const { error } = await client.from("admin_settings").upsert({ id: 1, password_hash: next.hash, password_salt: next.salt });
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: "server error" });
  }
};
