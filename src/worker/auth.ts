import { apiError, json } from "./http";
import type { Env } from "./types";

const ADMIN_USERNAME = "admin";
const ADMIN_ID = "admin";
const SESSION_COOKIE = "growth_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 100_000;

interface AdminUser {
  id: string;
  username: string | null;
  email?: string | null;
  phone?: string | null;
  password_hash: string | null;
  password_salt: string | null;
  role: "admin" | "user";
  status: "active" | "disabled";
  display_name?: string | null;
  must_change_password?: number | boolean;
}

interface SessionUser {
  id: string;
  username: string | null;
  email?: string | null;
  phone?: string | null;
  role: "admin" | "user";
  status: "active" | "disabled";
  must_change_password?: number | boolean;
}

interface PhoneCode {
  code_hash: string;
}

interface GrowthRecord {
  id: string;
  record_date: string;
  dimension: string;
  hours: number;
  description: string;
  exp: number;
}

interface UserSettingsRow {
  user_id: string;
  title: string;
  subtitle: string;
  dimensions_json: string;
  descriptions_json: string;
  dimension_level_exp_json: string;
  goals_json: string;
  quotes_json: string;
  theme: "dark" | "light";
}

interface UserSettingsPayload {
  title: string;
  subtitle: string;
  dimensions: string[];
  descriptions: Record<string, string>;
  dimensionLevelExp: Record<string, number>;
  goals: string[];
  quotes: Array<{ id: string; date: string; text: string }>;
  theme: "dark" | "light";
}

const DEFAULT_DIMENSIONS = ["科研学习", "自媒体", "运动健身", "化妆技术", "电竞操作", "表达能力", "剪辑技能", "编程能力"];
const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  科研学习: "论文阅读、科研推进、知识沉淀",
  自媒体: "内容策划、发布、运营复盘",
  运动健身: "训练、拉伸、体能管理",
  化妆技术: "审美练习、妆容实践",
  电竞操作: "操作训练、复盘、战术理解",
  表达能力: "写作、演讲、沟通训练",
  剪辑技能: "视频剪辑、素材整理、节奏练习",
  编程能力: "功能开发、调试、工程能力"
};
const DEFAULT_LEVEL_EXP = 200;

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
    "SELECT id, email, phone, username, password_hash, password_salt, role, status, must_change_password FROM users WHERE username = ? OR email = ? OR phone = ?"
  )
    .bind(account, account, account)
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
        email: user.email,
        username: user.username,
        role: user.role
      },
      requiresPasswordChange: Boolean(user.must_change_password)
    },
    {
      headers: {
        "set-cookie": buildSessionCookie(token)
      }
    }
  );
}

export async function handleEmailRegistration(request: Request, env: Env): Promise<Response> {
  const { email, password } = await readJsonBody<{ email?: string; password?: string }>(request);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return apiError("invalid_email", "A valid email address is required.", 400);
  const validation = validatePassword(password);
  if (validation) return validation;

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(normalizedEmail).first<AdminUser>();
  if (existing) return apiError("email_already_registered", "This email address is already registered.", 409);

  const userId = crypto.randomUUID();
  const salt = randomToken();
  const passwordHash = await hashPassword(password as string, salt);
  await env.DB.prepare(
    "INSERT INTO users (id, email, phone, username, password_hash, password_salt, role, status, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))"
  )
    .bind(userId, normalizedEmail, passwordHash, salt, "user", "active", normalizedEmail)
    .run();

  const { token } = await createSession(env, userId);
  return json(
    {
      user: {
        id: userId,
        email: normalizedEmail,
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
  const deliveryError = await deliverVerificationCode(env, phone, purpose, code);
  if (deliveryError) return deliveryError;

  const codeHash = await hashVerificationCode(phone, purpose, code, env);
  await env.DB.prepare(
    "INSERT INTO phone_verification_codes (id, phone, code_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, datetime('now', '+10 minutes'), datetime('now'))"
  )
    .bind(crypto.randomUUID(), phone, codeHash, purpose)
    .run();

  return json({
    sent: true,
    purpose,
    devCode: env.DEV_SMS_CODES === "true" ? code : undefined
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
    "UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?"
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

export async function handleAdminListUsers(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const result = await env.DB.prepare(
    "SELECT id, email, phone, username, role, status, display_name, must_change_password, created_at, updated_at, last_login_at FROM users ORDER BY created_at DESC"
  ).all<AdminUser>();

  return json({ users: (result.results ?? []).map(publicUser) });
}

export async function handleAdminCreateUser(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const body = await readJsonBody<{
    email?: string;
    phone?: string;
    username?: string;
    displayName?: string;
    role?: "admin" | "user";
    status?: "active" | "disabled";
  }>(request);
  const email = normalizeEmail(body.email);
  if (!email) return apiError("invalid_email", "A valid email address is required.", 400);
  const phone = normalizeOptionalPhone(body.phone);
  if (phone instanceof Response) return phone;

  const userId = crypto.randomUUID();
  const defaultPassword = generateDefaultPassword();
  const salt = randomToken();
  const passwordHash = await hashPassword(defaultPassword, salt);
  const role = body.role === "admin" ? "admin" : "user";
  const status = body.status === "disabled" ? "disabled" : "active";
  const username = body.username?.trim() || null;
  const displayName = body.displayName?.trim() || username || email;

  await env.DB.prepare(
    "INSERT INTO users (id, email, phone, username, password_hash, password_salt, role, status, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))"
  )
    .bind(userId, email, phone, username, passwordHash, salt, role, status, displayName)
    .run();

  return json({
    user: {
      id: userId,
      email,
      phone,
      username,
      role,
      status,
      displayName,
      mustChangePassword: true
    },
    defaultPassword
  });
}

export async function handleAdminUpdateUser(request: Request, env: Env, userId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  if (userId === ADMIN_ID) return apiError("cannot_modify_admin", "The default admin cannot be edited here.", 400);

  const body = await readJsonBody<{
    email?: string;
    phone?: string;
    username?: string;
    displayName?: string;
    role?: "admin" | "user";
    status?: "active" | "disabled";
  }>(request);
  const email = normalizeEmail(body.email);
  if (!email) return apiError("invalid_email", "A valid email address is required.", 400);
  const phone = normalizeOptionalPhone(body.phone);
  if (phone instanceof Response) return phone;

  const role = body.role === "admin" ? "admin" : "user";
  const status = body.status === "disabled" ? "disabled" : "active";
  const username = body.username?.trim() || null;
  const displayName = body.displayName?.trim() || username || email;

  await env.DB.prepare(
    "UPDATE users SET email = ?, phone = ?, username = ?, role = ?, status = ?, display_name = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(email, phone, username, role, status, displayName, userId)
    .run();

  return json({ user: await findPublicUserById(env, userId) });
}

export async function handleAdminResetUserPassword(request: Request, env: Env, userId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  if (userId === ADMIN_ID) return apiError("cannot_reset_admin", "Use admin reset key for the default admin.", 400);

  const defaultPassword = generateDefaultPassword();
  const salt = randomToken();
  const passwordHash = await hashPassword(defaultPassword, salt);
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(passwordHash, salt, userId)
    .run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();

  return json({ user: await findPublicUserById(env, userId), defaultPassword });
}

export async function handleAdminDeleteUser(request: Request, env: Env, userId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  if (userId === ADMIN_ID) return apiError("cannot_delete_admin", "The default admin cannot be deleted.", 400);

  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  return json({ deleted: true });
}

export async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return apiError("unauthorized", "Authentication is required.", 401);
  const records = await listUserRecords(env, session.user.id);
  const settings = await getUserSettings(env, session.user.id);
  await refreshSession(env, session.tokenHash);

  return json({
    user: session.user,
    ...settings,
    records,
  });
}

export async function handleListRecords(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return apiError("unauthorized", "Authentication is required.", 401);
  const records = await listUserRecords(env, session.user.id);
  await refreshSession(env, session.tokenHash);
  return json({ records });
}

export async function handleCreateRecord(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return apiError("unauthorized", "Authentication is required.", 401);

  const body = await readJsonBody<{ date?: string; dimension?: string; hours?: number; description?: string }>(request);
  const normalized = normalizeRecordInput(body);
  if (normalized instanceof Response) return normalized;

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO growth_records (id, user_id, record_date, dimension, hours, description, exp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  )
    .bind(id, session.user.id, normalized.date, normalized.dimension, normalized.hours, normalized.description, normalized.exp)
    .run();
  await refreshSession(env, session.tokenHash);

  return json({
    record: {
      id,
      ...normalized
    }
  });
}

export async function handleUpdateRecord(request: Request, env: Env, recordId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return apiError("unauthorized", "Authentication is required.", 401);

  const body = await readJsonBody<{ date?: string; dimension?: string; hours?: number; description?: string }>(request);
  const normalized = normalizeRecordInput(body);
  if (normalized instanceof Response) return normalized;

  await env.DB.prepare(
    "UPDATE growth_records SET record_date = ?, dimension = ?, hours = ?, description = ?, exp = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  )
    .bind(normalized.date, normalized.dimension, normalized.hours, normalized.description, normalized.exp, recordId, session.user.id)
    .run();
  await refreshSession(env, session.tokenHash);

  return json({ record: { id: recordId, ...normalized } });
}

export async function handleDeleteRecord(request: Request, env: Env, recordId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return apiError("unauthorized", "Authentication is required.", 401);

  await env.DB.prepare("DELETE FROM growth_records WHERE id = ? AND user_id = ?").bind(recordId, session.user.id).run();
  await refreshSession(env, session.tokenHash);
  return json({ deleted: true });
}

export async function handleGetSettings(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return apiError("unauthorized", "Authentication is required.", 401);
  const settings = await getUserSettings(env, session.user.id);
  await refreshSession(env, session.tokenHash);
  return json(settings);
}

export async function handleUpdateSettings(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return apiError("unauthorized", "Authentication is required.", 401);
  const body = await readJsonBody<Partial<UserSettingsPayload>>(request);
  const settings = normalizeSettingsInput(body);
  if (settings instanceof Response) return settings;

  await env.DB.prepare(
    `INSERT INTO user_settings (
      user_id, title, subtitle, dimensions_json, descriptions_json, dimension_level_exp_json,
      goals_json, quotes_json, theme, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      title = excluded.title,
      subtitle = excluded.subtitle,
      dimensions_json = excluded.dimensions_json,
      descriptions_json = excluded.descriptions_json,
      dimension_level_exp_json = excluded.dimension_level_exp_json,
      goals_json = excluded.goals_json,
      quotes_json = excluded.quotes_json,
      theme = excluded.theme,
      updated_at = datetime('now')`
  )
    .bind(
      session.user.id,
      settings.title,
      settings.subtitle,
      JSON.stringify(settings.dimensions),
      JSON.stringify(settings.descriptions),
      JSON.stringify(settings.dimensionLevelExp),
      JSON.stringify(settings.goals),
      JSON.stringify(settings.quotes),
      settings.theme
    )
    .run();

  await refreshSession(env, session.tokenHash);
  return json(settings);
}

async function ensureAdminUser(env: Env): Promise<AdminUser> {
  const existing = await env.DB.prepare(
    "SELECT id, email, phone, username, password_hash, password_salt, role, status FROM users WHERE username = ?"
  )
    .bind(ADMIN_USERNAME)
    .first<AdminUser>();

  if (existing) return existing;

  await env.DB.prepare(
    "INSERT INTO users (id, email, phone, username, role, status, display_name, created_at, updated_at) VALUES (?, NULL, NULL, ?, ?, ?, ?, datetime('now'), datetime('now'))"
  )
    .bind(ADMIN_ID, ADMIN_USERNAME, "admin", "active", "系统管理员")
    .run();

  return {
    id: ADMIN_ID,
    username: ADMIN_USERNAME,
    password_hash: null,
    password_salt: null,
    role: "admin",
    status: "active",
    must_change_password: false
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

async function requireAdmin(request: Request, env: Env): Promise<SessionUser | Response> {
  const session = await getSession(request, env);
  if (!session) return apiError("unauthorized", "Authentication is required.", 401);
  if (session.user.role !== "admin") return apiError("forbidden", "Admin access is required.", 403);
  await refreshSession(env, session.tokenHash);
  return session.user;
}

async function findPublicUserById(env: Env, userId: string): Promise<ReturnType<typeof publicUser> | null> {
  const user = await env.DB.prepare(
    "SELECT id, email, phone, username, role, status, display_name, must_change_password, created_at, updated_at, last_login_at FROM users WHERE id = ?"
  )
    .bind(userId)
    .first<AdminUser>();
  return user ? publicUser(user) : null;
}

function publicUser(user: AdminUser) {
  return {
    id: user.id,
    email: user.email ?? "",
    phone: user.phone ?? "",
    username: user.username,
    role: user.role,
    status: user.status,
    displayName: user.display_name ?? "",
    mustChangePassword: Boolean(user.must_change_password)
  };
}

async function listUserRecords(env: Env, userId: string): Promise<Array<ReturnType<typeof publicRecord>>> {
  const result = await env.DB.prepare(
    "SELECT id, record_date, dimension, hours, description, exp FROM growth_records WHERE user_id = ? ORDER BY record_date DESC, created_at DESC"
  )
    .bind(userId)
    .all<GrowthRecord>();
  return (result.results ?? []).map(publicRecord);
}

async function getUserSettings(env: Env, userId: string): Promise<UserSettingsPayload> {
  const result = await env.DB.prepare(
    "SELECT user_id, title, subtitle, dimensions_json, descriptions_json, dimension_level_exp_json, goals_json, quotes_json, theme FROM user_settings WHERE user_id = ?"
  )
    .bind(userId)
    .all<UserSettingsRow>();
  const row = result.results?.[0];
  if (!row) return defaultSettings();
  return {
    title: row.title || "✨ 园中月努力可视化系统",
    subtitle: row.subtitle || "自由才是我永恒的向往",
    dimensions: parseJsonArray(row.dimensions_json, DEFAULT_DIMENSIONS),
    descriptions: parseJsonObject(row.descriptions_json, DEFAULT_DESCRIPTIONS),
    dimensionLevelExp: parseJsonObject(row.dimension_level_exp_json, defaultLevelExp()),
    goals: parseJsonArray(row.goals_json, defaultSettings().goals),
    quotes: parseJsonArray(row.quotes_json, defaultSettings().quotes),
    theme: row.theme === "light" ? "light" : "dark"
  };
}

function defaultSettings(): UserSettingsPayload {
  return {
    title: "✨ 园中月努力可视化系统",
    subtitle: "自由才是我永恒的向往",
    dimensions: [...DEFAULT_DIMENSIONS],
    descriptions: { ...DEFAULT_DESCRIPTIONS },
    dimensionLevelExp: defaultLevelExp(),
    goals: ["建立稳定成长记录", "把打卡变成可复盘的数据"],
    quotes: [{ id: "default", date: new Date().toISOString().slice(0, 10), text: "慢慢来，每天进步一点点。" }],
    theme: "dark"
  };
}

function defaultLevelExp(): Record<string, number> {
  return Object.fromEntries(DEFAULT_DIMENSIONS.map((dimension) => [dimension, DEFAULT_LEVEL_EXP]));
}

function normalizeSettingsInput(body: Partial<UserSettingsPayload>): Response | UserSettingsPayload {
  const title = body.title?.trim() || "✨ 园中月努力可视化系统";
  const subtitle = body.subtitle?.trim() || "自由才是我永恒的向往";
  const dimensions = Array.isArray(body.dimensions)
    ? body.dimensions.map((dimension) => String(dimension).trim()).filter(Boolean).slice(0, 12)
    : [...DEFAULT_DIMENSIONS];
  if (!dimensions.length) return apiError("invalid_settings", "At least one dimension is required.", 400);

  const descriptions = typeof body.descriptions === "object" && body.descriptions ? body.descriptions : {};
  const dimensionLevelExp = typeof body.dimensionLevelExp === "object" && body.dimensionLevelExp ? body.dimensionLevelExp : {};
  const goals = Array.isArray(body.goals) ? body.goals.map((goal) => String(goal).trim()).filter(Boolean).slice(0, 20) : [];
  const quotes = Array.isArray(body.quotes)
    ? body.quotes
        .map((quote) => ({
          id: String(quote.id || crypto.randomUUID()),
          date: String(quote.date || new Date().toISOString().slice(0, 10)),
          text: String(quote.text || "").trim()
        }))
        .filter((quote) => quote.text)
        .slice(0, 20)
    : [];

  return {
    title,
    subtitle,
    dimensions,
    descriptions: Object.fromEntries(dimensions.map((dimension) => [dimension, String(descriptions[dimension] || "")])),
    dimensionLevelExp: Object.fromEntries(
      dimensions.map((dimension) => {
        const value = Number(dimensionLevelExp[dimension]);
        return [dimension, Number.isFinite(value) && value > 0 ? Math.round(value) : DEFAULT_LEVEL_EXP];
      })
    ),
    goals: goals.length ? goals : ["建立稳定成长记录", "把打卡变成可复盘的数据"],
    quotes: quotes.length ? quotes : [{ id: "default", date: new Date().toISOString().slice(0, 10), text: "慢慢来，每天进步一点点。" }],
    theme: body.theme === "light" ? "light" : "dark"
  };
}

function parseJsonArray<T>(value: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject<T extends Record<string, unknown>>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function publicRecord(record: GrowthRecord) {
  return {
    id: record.id,
    date: record.record_date,
    dimension: record.dimension,
    hours: Number(record.hours),
    description: record.description,
    exp: Number(record.exp)
  };
}

function normalizeRecordInput(body: {
  date?: string;
  dimension?: string;
  hours?: number;
  description?: string;
}): Response | { date: string; dimension: string; hours: number; description: string; exp: number } {
  const date = body.date?.trim();
  const dimension = body.dimension?.trim();
  const hours = Number(body.hours);
  const description = body.description?.trim() || "未描述";
  if (!date || !dimension || !Number.isFinite(hours) || hours <= 0 || hours > 12) {
    return apiError("invalid_record", "Date, dimension, and valid hours are required.", 400);
  }
  return { date, dimension, hours, description, exp: calcCheckinExp(hours) };
}

function calcCheckinExp(hours: number): number {
  let exp = Math.round(hours * 10);
  if (hours >= 4) exp = Math.round(exp * 1.2);
  else if (hours >= 2.5) exp = Math.round(exp * 1.1);
  return exp;
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
    "SELECT u.id, u.username, u.email, u.phone, u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > datetime('now')"
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

function normalizeEmail(email: string | undefined): string | null {
  if (typeof email !== "string") return null;
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) return null;
  return value;
}

function normalizeOptionalPhone(phone: string | undefined): string | null | Response {
  if (!phone || !phone.trim()) return null;
  const value = phone.trim();
  if (!isValidPhone(value)) return apiError("invalid_phone", "Phone number is invalid.", 400);
  return value;
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

async function deliverVerificationCode(
  env: Env,
  phone: string,
  purpose: "register" | "login",
  code: string
): Promise<Response | null> {
  if (env.DEV_SMS_CODES === "true") return null;

  const provider = env.SMS_PROVIDER?.trim().toLowerCase();
  if (!provider) {
    return apiError("sms_not_configured", "SMS provider is not configured.", 501);
  }

  if (provider !== "webhook") {
    return apiError("sms_provider_unsupported", "Configured SMS provider is not supported.", 501);
  }

  if (!env.SMS_WEBHOOK_URL) {
    return apiError("sms_not_configured", "SMS webhook URL is not configured.", 501);
  }

  try {
    const response = await fetch(env.SMS_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.SMS_API_KEY ? { authorization: `Bearer ${env.SMS_API_KEY}` } : {})
      },
      body: JSON.stringify({
        phone,
        purpose,
        code,
        expiresInMinutes: 10
      })
    });
    if (!response.ok) {
      return apiError("sms_delivery_failed", "SMS provider rejected the verification code request.", 502);
    }
  } catch {
    return apiError("sms_delivery_failed", "SMS provider could not be reached.", 502);
  }

  return null;
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

function generateDefaultPassword(): string {
  return `GR-${randomToken().slice(0, 10)}`;
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
