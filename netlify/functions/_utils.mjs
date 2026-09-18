/**
 * netlify/functions/_utils.mjs
 * Shared utilities for all Netlify Functions.
 * Files with leading underscore are NOT exposed as endpoints by Netlify.
 */

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase client ───────────────────────────────────────────────────────
export function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY   // service_role key — server-side only
  );
}

// ─── CORS / Response helpers ───────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
};

export function json(data, statusCode = 200) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
    body: JSON.stringify(data),
  };
}

export function corsOptions() {
  return { statusCode: 204, headers: CORS, body: "" };
}

// ─── JWT (Node.js crypto — no extra deps) ─────────────────────────────────
const TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

function b64url(str) {
  return Buffer.from(str).toString("base64url");
}
function hmac(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function signToken() {
  const secret = process.env.ADMIN_SECRET || "changeme_set_ADMIN_SECRET";
  const hdr = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const pay = b64url(
    JSON.stringify({
      admin: true,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL,
    })
  );
  const sig = hmac(secret, `${hdr}.${pay}`);
  return `${hdr}.${pay}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return false;
  const secret = process.env.ADMIN_SECRET || "changeme_set_ADMIN_SECRET";
  const parts = String(token).split(".");
  if (parts.length !== 3) return false;
  const [hdr, pay, sig] = parts;
  if (hmac(secret, `${hdr}.${pay}`) !== sig) return false;
  try {
    const data = JSON.parse(Buffer.from(pay, "base64url").toString("utf8"));
    return typeof data.exp === "number" && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function getBearer(headers) {
  const auth = headers["authorization"] || headers["Authorization"] || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const xToken = headers["x-admin-token"] || headers["X-Admin-Token"] || "";
  return xToken.trim();
}

export function isAdmin(headers) {
  return verifyToken(getBearer(headers));
}

// ─── Password helpers (scrypt — same algorithm as original server.js) ──────
export function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
export function newSalt() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Verify admin password.
 * Priority: Supabase admin_settings table → ADMIN_PASSWORD env var (fallback).
 */
export async function verifyPassword(password) {
  const supabase = getSupabase();

  // 1. Try Supabase-stored hash
  const { data } = await supabase
    .from("admin_settings")
    .select("key, value")
    .in("key", ["password_hash", "password_salt"]);

  if (data && data.length === 2) {
    const hashRow = data.find((r) => r.key === "password_hash");
    const saltRow = data.find((r) => r.key === "password_salt");
    if (hashRow && saltRow) {
      const computed = hashPassword(password, saltRow.value);
      return crypto.timingSafeEqual(
        Buffer.from(computed, "hex"),
        Buffer.from(hashRow.value, "hex")
      );
    }
  }

  // 2. Fallback: plain ADMIN_PASSWORD env var (constant-time via SHA-256)
  const envPass = process.env.ADMIN_PASSWORD || "admin123";
  const a = crypto.createHash("sha256").update(password).digest();
  const b = crypto.createHash("sha256").update(envPass).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Persist new password hash to Supabase (enables future logins to use DB).
 */
export async function updatePassword(newPassword) {
  const supabase = getSupabase();
  const salt = newSalt();
  const hash = hashPassword(newPassword, salt);
  await supabase
    .from("admin_settings")
    .upsert({ key: "password_hash", value: hash });
  await supabase
    .from("admin_settings")
    .upsert({ key: "password_salt", value: salt });
}

// ─── Body parser ───────────────────────────────────────────────────────────
export function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return {};
  }
}

