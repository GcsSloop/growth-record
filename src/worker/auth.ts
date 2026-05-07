import { apiError, json } from "./http";
import type { Env } from "./types";

const ADMIN_USERNAME = "admin";
const ADMIN_ID = "admin";
const SESSION_COOKIE = "growth_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 100_000;

interface AdminUser {
  id: string;
  username: string;
  password_hash: string | null;
  password_salt: string | null;
  role: "admin" | "user";
  status: "active" | "disabled";
}

interface SessionUser {
  id: string;
  username: string | null;
  role: "admin" | "user";
  status: "active" | "disabled";
}

export async function handleAdminBootstrap(env: Env): Promise<Response> {
  const admin = await ensureAdminUser(env);
  return json({
    username: ADMIN_USERNAME,
    requiresPasswordSetup: !admin.password_hash
  });
}

export async function handleAdminSetupPassword(request: Request, env: Env): Promise<Response> {
  const admin = await ensureAdminUser(env);
  if (admin.password_hash) {
    return apiError("admin_password_already_set", "Admin password has already been configured.", 409);
  }

  const { password } = await readJsonBody<{ password?: string }>(request);
  const validation = validatePassword(password);
  if (validation) return validation;

  await setAdminPassword(env, password as string);
  return json({ username: ADMIN_USERNAME, passwordConfigured: true });
}

export async function handleAdminResetPassword(request: Request, env: Env): Promise<Response> {
  const resetKey = env.ADMIN_RESET_KEY;
  const providedKey = request.headers.get("x-admin-reset-key");

  if (!resetKey || providedKey !== resetKey) {
    return apiError("forbidden", "Admin password reset requires the backend reset key.", 403);
  }

  await ensureAdminUser(env);
  await env.DB.prepare(
    "UPDATE users SET password_hash = NULL, password_salt = NULL, updated_at = datetime('now') WHERE username = ?"
  )
    .bind(ADMIN_USERNAME)
    .run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(ADMIN_ID).run();

  return json({ username: ADMIN_USERNAME, requiresPasswordSetup: true });
}

export async function handlePasswordLogin(request: Request, env: Env): Promise<Response> {
  const { account, password } = await readJsonBody<{ account?: string; password?: string }>(request);
  if (!account || !password) {
    return apiError("invalid_credentials", "Account and password are required.", 400);
  }

  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, password_salt, role, status FROM users WHERE username = ? OR phone = ?"
  )
    .bind(account, account)
    .first<AdminUser>();

  if (!user || !user.password_hash || !user.password_salt || user.status !== "active") {
    return apiError("invalid_credentials", "Account or password is incorrect.", 401);
  }

  const passwordHash = await hashPassword(password, user.password_salt);
  if (passwordHash !== user.password_hash) {
    return apiError("invalid_credentials", "Account or password is incorrect.", 401);
  }

  const token = randomToken();
  const tokenHash = await hashSessionToken(token, env);
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, datetime('now', '+7 days'), datetime('now'), datetime('now'))"
  )
    .bind(crypto.randomUUID(), user.id, tokenHash)
    .run();

  return json(
    {
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    },
    {
      headers: {
        "set-cookie": buildSessionCookie(token)
      }
    }
  );
}

export async function handleCurrentUser(request: Request, env: Env): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return apiError("unauthorized", "Authentication is required.", 401);

  const tokenHash = await hashSessionToken(token, env);
  const user = await env.DB.prepare(
    "SELECT u.id, u.username, u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > datetime('now')"
  )
    .bind(tokenHash)
    .first<SessionUser>();

  if (!user || user.status !== "active") {
    return apiError("unauthorized", "Authentication is required.", 401);
  }

  return json({ user });
}

async function ensureAdminUser(env: Env): Promise<AdminUser> {
  const existing = await env.DB.prepare(
    "SELECT id, username, password_hash, password_salt, role, status FROM users WHERE username = ?"
  )
    .bind(ADMIN_USERNAME)
    .first<AdminUser>();

  if (existing) return existing;

  await env.DB.prepare(
    "INSERT INTO users (id, phone, username, role, status, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  )
    .bind(ADMIN_ID, ADMIN_USERNAME, ADMIN_USERNAME, "admin", "active", "系统管理员")
    .run();

  return {
    id: ADMIN_ID,
    username: ADMIN_USERNAME,
    password_hash: null,
    password_salt: null,
    role: "admin",
    status: "active"
  };
}

async function setAdminPassword(env: Env, password: string): Promise<void> {
  const salt = randomToken();
  const passwordHash = await hashPassword(password, salt);
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE username = ?"
  )
    .bind(passwordHash, salt, ADMIN_USERNAME)
    .run();
}

function validatePassword(password: string | undefined): Response | null {
  if (!password || password.length < 8) {
    return apiError("weak_password", "Password must be at least 8 characters.", 400);
  }
  return null;
}

async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: PASSWORD_ITERATIONS
    },
    keyMaterial,
    256
  );
  return toBase64Url(new Uint8Array(bits));
}

async function hashSessionToken(token: string, env: Env): Promise<string> {
  const secret = env.SESSION_SECRET ?? "development-session-secret";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${token}`));
  return toBase64Url(new Uint8Array(digest));
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [cookieName, ...valueParts] = part.trim().split("=");
    if (cookieName === name) return valueParts.join("=");
  }
  return null;
}
