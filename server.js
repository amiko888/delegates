"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "clicks.db");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

// --- ადმინისტრატორის პაროლის ინიციალიზაცია ---
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function initAdminAuth() {
  if (!fs.existsSync(ADMIN_FILE)) {
    const salt = crypto.randomBytes(16).toString("hex");
    const defaultPassword = process.env.ADMIN_PASSWORD || "admin123";
    const hash = hashPassword(defaultPassword, salt);
    fs.writeFileSync(ADMIN_FILE, JSON.stringify({ salt, hash }, null, 2), "utf-8");
  }
}
initAdminAuth();

function verifyAdminPassword(password) {
  try {
    const data = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf-8"));
    const hash = hashPassword(password, data.salt);
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(data.hash, "hex"));
  } catch (err) {
    console.error("Auth verify error:", err);
    return false;
  }
}

function updateAdminPassword(newPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(newPassword, salt);
  fs.writeFileSync(ADMIN_FILE, JSON.stringify({ salt, hash }, null, 2), "utf-8");
}

// --- სესიების მართვა ---
const sessions = new Map(); // token -> { createdAt: timestamp }
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 დღე

function getAuthToken(req) {
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  if (req.headers["x-admin-token"]) {
    return String(req.headers["x-admin-token"]).trim();
  }
  const cookie = req.headers["cookie"];
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

function isAdmin(req) {
  const token = getAuthToken(req);
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    sessions.delete(token);
    return false;
  }
  return true;
}

// --- მონაცემთა ბაზა (SQLite) ---
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS clicks (
    delegate_id INTEGER PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const incrementStmt = db.prepare(`
  INSERT INTO clicks (delegate_id, count, updated_at)
  VALUES (?, 1, datetime('now'))
  ON CONFLICT(delegate_id) DO UPDATE SET
    count = count + 1,
    updated_at = datetime('now')
`);
const getStmt = db.prepare("SELECT count, updated_at FROM clicks WHERE delegate_id = ?");
const allStmt = db.prepare("SELECT delegate_id, count, updated_at FROM clicks ORDER BY count DESC");
const setCountStmt = db.prepare(`
  INSERT INTO clicks (delegate_id, count, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(delegate_id) DO UPDATE SET
    count = excluded.count,
    updated_at = datetime('now')
`);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function send(res, status, body, headers) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, data, extraHeaders) {
  send(
    res,
    status,
    JSON.stringify(data),
    Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
      },
      extraHeaders || {}
    )
  );
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) return null;
  return id;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  // --- ადმინ ავთენტიფიკაციის ენდფოინთები ---

  // 1. ლოგინი
  if (pathname === "/api/admin/login" && req.method === "POST") {
    const body = await readJsonBody(req);
    const password = String(body.password || "");
    if (!password) {
      return sendJson(res, 400, { ok: false, error: "პაროლი აუცილებელია" });
    }
    if (!verifyAdminPassword(password)) {
      return sendJson(res, 401, { ok: false, error: "პაროლი არასწორია" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { createdAt: Date.now() });

    const cookieHeader = `admin_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`;
    return sendJson(res, 200, { ok: true, token }, { "Set-Cookie": cookieHeader });
  }

  // 2. სტატუსის შემოწმება
  if (pathname === "/api/admin/check" && req.method === "GET") {
    const authenticated = isAdmin(req);
    return sendJson(res, authenticated ? 200 : 401, { authenticated });
  }

  // 3. გამოსვლა (Logout)
  if (pathname === "/api/admin/logout" && req.method === "POST") {
    const token = getAuthToken(req);
    if (token) sessions.delete(token);
    const clearCookie = `admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearCookie });
  }

  // 4. პაროლის შეცვლა
  if (pathname === "/api/admin/change-password" && req.method === "POST") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "არაავტორიზებული" });
    const body = await readJsonBody(req);
    const currentPass = String(body.currentPassword || "");
    const newPass = String(body.newPassword || "");

    if (!verifyAdminPassword(currentPass)) {
      return sendJson(res, 400, { error: "მიმდინარე პაროლი არასწორია" });
    }
    if (!newPass || newPass.length < 4) {
      return sendJson(res, 400, { error: "ახალი პაროლი უნდა შეიცავდეს მინიმუმ 4 სიმბოლოს" });
    }
    updateAdminPassword(newPass);
    return sendJson(res, 200, { ok: true, message: "პაროლი წარმატებით შეიცვალა" });
  }

  // 5. ადმინ სტატისტიკა (დეტალური მონაცემები)
  if (pathname === "/api/admin/stats" && req.method === "GET") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "არაავტორიზებული" });
    const rows = allStmt.all();
    const counts = {};
    let totalViews = 0;
    rows.forEach((row) => {
      counts[row.delegate_id] = row.count;
      totalViews += row.count;
    });
    return sendJson(res, 200, { counts, rows, totalViews });
  }

  // 6. დელეგატის ნახვების განულება ან შეცვლა
  const adminResetMatch = pathname.match(/^\/api\/admin\/clicks\/(\d+)$/);
  if (adminResetMatch && req.method === "POST") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "არაავტორიზებული" });
    const id = parseId(adminResetMatch[1]);
    if (!id) return sendJson(res, 400, { error: "არასწორი ID" });
    const body = await readJsonBody(req);
    const newCount = Number(body.count) || 0;
    setCountStmt.run(id, Math.max(0, newCount));
    return sendJson(res, 200, { ok: true, id, count: Math.max(0, newCount) });
  }

  // 7. კლიენტის მონაცემების სინქრონიზაცია ბაზასთან
  if (pathname === "/api/admin/sync" && req.method === "POST") {
    if (!isAdmin(req)) return sendJson(res, 401, { error: "არაავტორიზებული" });
    const body = await readJsonBody(req);
    const clientCounts = body.counts || {};
    for (const [idStr, count] of Object.entries(clientCounts)) {
      const id = parseId(idStr);
      const c = Number(count) || 0;
      if (id && c > 0) {
        const row = getStmt.get(id);
        const serverCount = row ? row.count : 0;
        if (c > serverCount) {
          setCountStmt.run(id, c);
        }
      }
    }
    const rows = allStmt.all();
    const counts = {};
    let totalViews = 0;
    rows.forEach((row) => {
      counts[row.delegate_id] = row.count;
      totalViews += row.count;
    });
    return sendJson(res, 200, { ok: true, counts, totalViews });
  }

  // --- საჯარო / ნახვების ჩაწერის ენდფოინთები ---

  const clickOne = pathname.match(/^\/api\/clicks\/(\d+)$/);

  // საჯარო ნახვის დაფიქსირება (POST)
  if (clickOne && req.method === "POST") {
    const id = parseId(clickOne[1]);
    if (!id) return sendJson(res, 400, { error: "invalid id" });
    incrementStmt.run(id);

    // უსაფრთხოება: საჯარო მომხმარებელს არ ვუბრუნებთ ნახვების მთლიან რაოდენობას
    if (isAdmin(req)) {
      const row = getStmt.get(id);
      return sendJson(res, 200, { success: true, id, count: row.count });
    }
    return sendJson(res, 200, { success: true });
  }

  // საჯარო GET /api/clicks: დაცულია — მხოლოდ ადმინს შეუძლია ნახოს
  if (pathname === "/api/clicks" && req.method === "GET") {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { error: "unauthorized" });
    }
    const rows = allStmt.all();
    const counts = {};
    rows.forEach((row) => {
      counts[row.delegate_id] = row.count;
    });
    return sendJson(res, 200, { counts });
  }

  // საჯარო GET /api/clicks/:id: დაცულია — მხოლოდ ადმინს შეუძლია ნახოს
  if (clickOne && req.method === "GET") {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { error: "unauthorized" });
    }
    const id = parseId(clickOne[1]);
    if (!id) return sendJson(res, 400, { error: "invalid id" });
    const row = getStmt.get(id);
    return sendJson(res, 200, { id, count: row ? row.count : 0 });
  }

  return sendJson(res, 404, { error: "not found" });
}

function safeFile(urlPath) {
  let decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (decoded === "/") decoded = "/index.html";
  if (decoded === "/admin") decoded = "/admin.html";
  const resolved = path.normalize(path.join(ROOT, decoded));
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

function serveStatic(req, res, url) {
  const filePath = safeFile(url.pathname);
  if (!filePath) return send(res, 403, "Forbidden");

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));

  if (url.pathname.startsWith("/api/")) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
      });
      return res.end();
    }
    try {
      return await handleApi(req, res, url);
    } catch (err) {
      console.error("API error:", err);
      return sendJson(res, 500, { error: "server error" });
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed");
  }

  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log("Delegate network running at http://localhost:" + PORT);
});
