import { apiError, json } from "./http";
import type { Env } from "./types";

const ADMIN_USERNAME = "admin";
const ADMIN_ID = "admin";
const SESSION_COOKIE = "growth_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
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
  phone?: string;
  role: "admin" | "user";
  status: "active" | "disabled";
}

interface PhoneCode {
  code_hash: string;
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

  const { token } = await createSession(env, user.id);

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
  const session = await getSession(request, env);
  if (!session) {
    return apiError("unauthorized", "Authentication is required.", 401);
  }

  await refreshSession(env, session.tokenHash);
  return json(
    { user: session.user },
    {
      headers: {
        "set-cookie": buildSessionCookie(session.token)
      }
    }
  );
}

export async function handleRequestPhoneCode(request: Request, env: Env): Promise<Response> {
  const { phone, purpose = "register" } = await readJsonBody<{ phone?: string; purpose?: "register" | "login" }>(
    request
  );
  if (!isValidPhone(phone)) return apiError("invalid_phone", "A valid phone number is required.", 400);
  if (purpose !== "register" && purpose !== "login") return apiError("invalid_purpose", "Invalid code purpose.", 400);

  const code = generateVerificationCode();
  const codeHash = await hashVerificationCode(phone, purpose, code, env);
  await env.DB.prepare(
    "INSERT INTO phone_verification_codes (id, phone, code_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, datetime('now', '+10 minutes'), datetime('now'))"
  )
    .bind(crypto.randomUUID(), phone, codeHash, purpose)
    .run();

  const allowDevCode = env.DEV_SMS_CODES === "true";
  if (!env.SMS_PROVIDER && !allowDevCode) {
    return apiError("sms_not_configured", "SMS provider is not configured.", 501);
  }

  return json({
    sent: true,
    purpose,
    devCode: allowDevCode ? code : undefined
  });
}

export async function handlePhoneRegistration(request: Request, env: Env): Promise<Response> {
  const { phone, code } = await readJsonBody<{ phone?: string; code?: string }>(request);
  if (!isValidPhone(phone) || !code) return apiError("invalid_registration", "Phone and code are required.", 400);

  const existing = await env.DB.prepare(
    "SELECT id, username, password_hash, password_salt, role, status FROM users WHERE phone = ?"
  )
    .bind(phone)
    .first<AdminUser>();
  if (existing) return apiError("phone_already_registered", "This phone number is already registered.", 409);

  const verified = await verifyPhoneCode(env, phone, "register", code);
  if (!verified) return apiError("invalid_code", "Verification code is invalid or expired.", 401);

  const userId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO users (id, phone, username, role, status, display_name, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, datetime('now'), datetime('now'))"
  )
    .bind(userId, phone, "user", "active", phone)
    .run();
  await consumePhoneCode(env, phone, "register");

  const { token } = await createSession(env, userId);
  return json(
    {
      user: {
        id: userId,
        phone,
        role: "user"
      }
    },
    {
      headers: {
        "set-cookie": buildSessionCookie(token)
      }
    }
  );
}

export async function handleSetCurrentUserPassword(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return apiError("unauthorized", "Authentication is required.", 401);

  const { password } = await readJsonBody<{ password?: string }>(request);
  const validation = validatePassword(password);
  if (validation) return validation;

  const salt = randomToken();
  const passwordHash = await hashPassword(password as string, salt);
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(passwordHash, salt, session.user.id)
    .run();
  await refreshSession(env, session.tokenHash);

  return json(
    { passwordConfigured: true },
    {
      headers: {
        "set-cookie": buildSessionCookie(session.token)
      }
    }
  );
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

async function createSession(env: Env, userId: string): Promise<{ token: string; tokenHash: string }> {
  const token = randomToken();
  const tokenHash = await hashSessionToken(token, env);
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, datetime('now', '+30 days'), datetime('now'), datetime('now'))"
  )
    .bind(crypto.randomUUID(), userId, tokenHash)
    .run();
  return { token, tokenHash };
}

async function getSession(
  request: Request,
  env: Env
): Promise<{ token: string; tokenHash: string; user: SessionUser } | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await hashSessionToken(token, env);
  const user = await env.DB.prepare(
    "SELECT u.id, u.username, u.phone, u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > datetime('now')"
  )
    .bind(tokenHash)
    .first<SessionUser>();

  if (!user || user.status !== "active") return null;
  return { token, tokenHash, user };
}

async function refreshSession(env: Env, tokenHash: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE sessions SET expires_at = datetime('now', '+30 days'), last_seen_at = datetime('now') WHERE token_hash = ?"
  )
    .bind(tokenHash)
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

async function hashVerificationCode(phone: string, purpose: string, code: string, env: Env): Promise<string> {
  return hashSessionToken(`${phone}:${purpose}:${code}`, env);
}

async function verifyPhoneCode(env: Env, phone: string, purpose: "register" | "login", code: string): Promise<boolean> {
  const stored = await env.DB.prepare(
    "SELECT code_hash FROM phone_verification_codes WHERE phone = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1"
  )
    .bind(phone, purpose)
    .first<PhoneCode>();

  if (!stored) return false;
  const providedHash = await hashVerificationCode(phone, purpose, code, env);
  return providedHash === stored.code_hash;
}

async function consumePhoneCode(env: Env, phone: string, purpose: "register" | "login"): Promise<void> {
  await env.DB.prepare(
    "UPDATE phone_verification_codes SET consumed_at = datetime('now') WHERE phone = ? AND purpose = ? AND consumed_at IS NULL"
  )
    .bind(phone, purpose)
    .run();
}

function generateVerificationCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(value).padStart(6, "0");
}

function isValidPhone(phone: string | undefined): phone is string {
  return typeof phone === "string" && /^\+?\d{6,20}$/.test(phone);
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
