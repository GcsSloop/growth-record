import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/worker/router";
import type { Env } from "../src/worker/types";

class FakeStatement {
  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
    private bindings: unknown[] = []
  ) {}

  bind(...bindings: unknown[]): FakeStatement {
    return new FakeStatement(this.db, this.sql, bindings);
  }

  first<T = unknown>(): Promise<T | null> {
    return this.db.first<T>(this.sql, this.bindings);
  }

  run(): Promise<D1Result> {
    return this.db.run(this.sql, this.bindings);
  }

  all<T = unknown>(): Promise<D1Result<T>> {
    return this.db.all<T>(this.sql, this.bindings);
  }
}

class FakeD1Database {
  users = new Map<string, Record<string, unknown>>();
  sessions: Array<Record<string, unknown>> = [];
  phoneCodes: Array<Record<string, unknown>> = [];
  records: Array<Record<string, unknown>> = [];
  settings = new Map<string, Record<string, unknown>>();

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this, sql);
  }

  async first<T>(sql: string, bindings: unknown[]): Promise<T | null> {
    if (sql.includes("COUNT(*) AS count FROM users WHERE date(last_login_at)")) {
      const today = new Date().toISOString().slice(0, 10);
      return {
        count: [...this.users.values()].filter((user) => String(user.last_login_at ?? "").startsWith(today)).length
      } as T;
    }
    if (sql.includes("COUNT(*) AS count FROM users")) {
      return { count: this.users.size } as T;
    }
    if (sql.includes("COUNT(*) AS count FROM growth_records")) {
      const minDate = new Date();
      minDate.setUTCDate(minDate.getUTCDate() - 6);
      const minDateText = minDate.toISOString().slice(0, 10);
      return {
        count: this.records.filter((record) => String(record.record_date) >= minDateText).length
      } as T;
    }
    if (sql.includes("SELECT id, email, phone, username, role, status, display_name, must_change_password")) {
      return (this.users.get(String(bindings[0])) as T) ?? null;
    }
    if (sql.includes("password_hash") && sql.includes("FROM users WHERE username = ?")) {
      return (this.findUserByAccount(String(bindings[0])) as T) ?? null;
    }
    if (sql.includes("SELECT id FROM users WHERE email = ?")) {
      return (this.findUserByEmail(String(bindings[0])) as T) ?? null;
    }
    if (sql.includes("SELECT id FROM users WHERE username = ?")) {
      return (this.findUserByUsername(String(bindings[0])) as T) ?? null;
    }
    if (sql.includes("FROM users WHERE phone = ?")) {
      return (this.findUserByPhone(String(bindings[0])) as T) ?? null;
    }
    if (sql.includes("SELECT id, username, role, status FROM users WHERE username = ?")) {
      const user = this.findUserByUsername(String(bindings[0]));
      if (!user) return null;
      const { id, username, role, status } = user;
      return { id, username, role, status } as T;
    }
    if (sql.includes("FROM sessions s JOIN users u")) {
      const tokenHash = String(bindings[0]);
      const session = this.sessions.find((entry) => entry.token_hash === tokenHash);
      if (!session) return null;
      const user = this.users.get(String(session.user_id));
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status
      } as T;
    }
    if (sql.includes("SELECT code_hash FROM phone_verification_codes")) {
      const [phone, purpose] = bindings;
      const code = [...this.phoneCodes]
        .reverse()
        .find((entry) => entry.phone === phone && entry.purpose === purpose && !entry.consumed_at);
      return (code as T) ?? null;
    }
    throw new Error(`Unhandled first SQL: ${sql}`);
  }

  async all<T>(sql: string, _bindings: unknown[] = []): Promise<D1Result<T>> {
    if (sql.includes("SELECT id, email, phone, username, role, status, display_name, must_change_password")) {
      return {
        ...fakeResult(),
        results: [...this.users.values()] as T[]
      };
    }
    if (sql.includes("FROM growth_records WHERE user_id = ?")) {
      const [userId] = _bindings;
      return {
        ...fakeResult(),
        results: this.records.filter((record) => record.user_id === userId) as T[]
      };
    }
    if (sql.includes("SELECT user_id, title, subtitle, dimensions_json")) {
      const [userId] = _bindings;
      const settings = this.settings.get(String(userId));
      return {
        ...fakeResult(),
        results: settings ? ([settings] as T[]) : []
      };
    }
    throw new Error(`Unhandled all SQL: ${sql}`);
  }

  async run(sql: string, bindings: unknown[]): Promise<D1Result> {
    if (sql.includes("INSERT INTO users") && sql.includes("password_hash") && sql.includes("must_change_password")) {
      const isEmailRegistration = bindings.length === 8;
      const [id, email] = bindings;
      const phone = isEmailRegistration ? null : bindings[2];
      const username = isEmailRegistration ? bindings[2] : bindings[3];
      const passwordHash = isEmailRegistration ? bindings[3] : bindings[4];
      const passwordSalt = isEmailRegistration ? bindings[4] : bindings[5];
      const role = isEmailRegistration ? bindings[5] : bindings[6];
      const status = isEmailRegistration ? bindings[6] : bindings[7];
      const displayName = isEmailRegistration ? bindings[7] : bindings[8];
      this.users.set(String(id), {
        id,
        email,
        phone,
        username,
        password_hash: passwordHash,
        password_salt: passwordSalt,
        role,
        status,
        display_name: displayName,
        must_change_password: !isEmailRegistration
      });
      return fakeResult();
    }
    if (sql.includes("INSERT INTO users")) {
      const isGeneratedUsername = !sql.includes("NULL");
      const [id] = bindings;
      const usesEmailColumns = sql.includes("id, email, phone");
      const email = usesEmailColumns ? null : undefined;
      const phone = usesEmailColumns ? null : bindings[1];
      const username = usesEmailColumns ? bindings[1] : isGeneratedUsername ? bindings[2] : null;
      const role = usesEmailColumns ? bindings[2] : isGeneratedUsername ? bindings[3] : bindings[2];
      const status = usesEmailColumns ? bindings[3] : isGeneratedUsername ? bindings[4] : bindings[3];
      const displayName = usesEmailColumns ? bindings[4] : isGeneratedUsername ? bindings[5] : bindings[4];
      this.users.set(String(id), {
        id,
        email,
        phone,
        username,
        role,
        status,
        display_name: displayName,
        password_hash: null,
        password_salt: null,
        must_change_password: false
      });
      return fakeResult();
    }
    if (sql.includes("INSERT INTO phone_verification_codes")) {
      const [id, phone, codeHash, purpose] = bindings;
      this.phoneCodes.push({ id, phone, code_hash: codeHash, purpose, consumed_at: null });
      return fakeResult();
    }
    if (sql.includes("UPDATE phone_verification_codes SET consumed_at")) {
      const [phone, purpose] = bindings;
      const code = [...this.phoneCodes]
        .reverse()
        .find((entry) => entry.phone === phone && entry.purpose === purpose && !entry.consumed_at);
      if (code) code.consumed_at = "now";
      return fakeResult();
    }
    if (sql.includes("UPDATE sessions SET expires_at")) {
      const [tokenHash] = bindings;
      const session = this.sessions.find((entry) => entry.token_hash === tokenHash);
      if (session) session.refreshed = true;
      return fakeResult();
    }
    if (sql.includes("UPDATE users SET password_hash = NULL")) {
      const [username] = bindings;
      const user = this.findUserByUsername(String(username));
      if (user) {
        user.password_hash = null;
        user.password_salt = null;
      }
      return fakeResult();
    }
    if (sql.includes("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 1")) {
      const [passwordHash, passwordSalt, id] = bindings;
      const user = this.users.get(String(id));
      if (user) Object.assign(user, { password_hash: passwordHash, password_salt: passwordSalt, must_change_password: true });
      return fakeResult();
    }
    if (sql.includes("UPDATE users SET password_hash = ?")) {
      const [passwordHash, passwordSalt, lookup] = bindings;
      const user = sql.includes("WHERE id = ?")
        ? this.users.get(String(lookup))
        : this.findUserByUsername(String(lookup));
      if (user) {
        user.password_hash = passwordHash;
        user.password_salt = passwordSalt;
        user.must_change_password = false;
      }
      return fakeResult();
    }
    if (sql.includes("UPDATE users SET email = ?")) {
      const [email, phone, username, role, status, displayName, id] = bindings;
      const user = this.users.get(String(id));
      if (user) Object.assign(user, { email, phone, username, role, status, display_name: displayName });
      return fakeResult();
    }
    if (sql.includes("DELETE FROM users WHERE id = ?")) {
      this.users.delete(String(bindings[0]));
      return fakeResult();
    }
    if (sql.includes("INSERT INTO sessions")) {
      const [id, userId, tokenHash] = bindings;
      this.sessions.push({ id, user_id: userId, token_hash: tokenHash });
      return fakeResult();
    }
    if (sql.includes("DELETE FROM sessions WHERE user_id")) {
      const [userId] = bindings;
      this.sessions = this.sessions.filter((entry) => entry.user_id !== userId);
      return fakeResult();
    }
    if (sql.includes("INSERT INTO growth_records")) {
      const [id, userId, recordDate, dimension, hours, description, exp] = bindings;
      this.records.push({
        id,
        user_id: userId,
        record_date: recordDate,
        dimension,
        hours,
        description,
        exp
      });
      return fakeResult();
    }
    if (sql.includes("UPDATE growth_records SET")) {
      const [recordDate, dimension, hours, description, exp, id, userId] = bindings;
      const record = this.records.find((entry) => entry.id === id && entry.user_id === userId);
      if (record) Object.assign(record, { record_date: recordDate, dimension, hours, description, exp });
      return fakeResult();
    }
    if (sql.includes("DELETE FROM growth_records WHERE id = ? AND user_id = ?")) {
      const [id, userId] = bindings;
      this.records = this.records.filter((entry) => !(entry.id === id && entry.user_id === userId));
      return fakeResult();
    }
    if (sql.includes("INSERT INTO user_settings")) {
      const [userId, title, subtitle, dimensionsJson, descriptionsJson, dimensionLevelExpJson, goalsJson, quotesJson, theme] =
        bindings;
      this.settings.set(String(userId), {
        user_id: userId,
        title,
        subtitle,
        dimensions_json: dimensionsJson,
        descriptions_json: descriptionsJson,
        dimension_level_exp_json: dimensionLevelExpJson,
        goals_json: goalsJson,
        quotes_json: quotesJson,
        theme
      });
      return fakeResult();
    }
    throw new Error(`Unhandled run SQL: ${sql}`);
  }

  private findUserByUsername(username: string): Record<string, unknown> | undefined {
    return [...this.users.values()].find((user) => user.username === username);
  }

  private findUserByPhone(phone: string): Record<string, unknown> | undefined {
    return [...this.users.values()].find((user) => user.phone === phone);
  }

  private findUserByEmail(email: string): Record<string, unknown> | undefined {
    return [...this.users.values()].find((user) => user.email === email);
  }

  private findUserByAccount(account: string): Record<string, unknown> | undefined {
    return this.findUserByUsername(account) ?? this.findUserByEmail(account) ?? this.findUserByPhone(account);
  }
}

function fakeResult(): D1Result {
  return {
    success: true,
    results: [],
    meta: {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: 0,
      last_row_id: 0,
      changed_db: true,
      changes: 1
    }
  };
}

function env(db = new FakeD1Database(), overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    SESSION_SECRET: "test-secret",
    ADMIN_RESET_KEY: "reset-key",
    DEV_SMS_CODES: "true",
    ...overrides
  };
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

async function loginAdmin(database: FakeD1Database): Promise<{ cookie: string; testEnv: Env }> {
  const testEnv = env(database);
  await handleRequest(
    new Request("https://example.com/api/admin/setup-password", {
      method: "POST",
      body: JSON.stringify({ password: "StrongPassword123" })
    }),
    testEnv
  );
  const login = await handleRequest(
    new Request("https://example.com/api/auth/login-password", {
      method: "POST",
      body: JSON.stringify({ account: "admin", password: "StrongPassword123" })
    }),
    testEnv
  );
  return { cookie: login.headers.get("set-cookie")?.split(";")[0] ?? "", testEnv };
}

describe("admin authentication bootstrap", () => {
  it("creates the default admin account and reports setup is required", async () => {
    const response = await handleRequest(new Request("https://example.com/api/admin/bootstrap"), env());

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      data: {
        username: "admin",
        requiresPasswordSetup: true
      }
    });
  });

  it("allows setting the admin password only while setup is required", async () => {
    const database = new FakeD1Database();
    const setup = await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "StrongPassword123" })
      }),
      env(database)
    );

    expect(setup.status).toBe(200);
    expect(database.users.get("admin")?.password_hash).toEqual(expect.any(String));

    const repeat = await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "AnotherPassword123" })
      }),
      env(database)
    );

    expect(repeat.status).toBe(409);
  });

  it("logs admin in after password setup and returns an HttpOnly session cookie", async () => {
    const database = new FakeD1Database();
    await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "StrongPassword123" })
      }),
      env(database)
    );

    const login = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "admin", password: "StrongPassword123" })
      }),
      env(database)
    );

    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("growth_session=");
    expect(login.headers.get("set-cookie")).toContain("Max-Age=2592000");
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rejects weak setup passwords, malformed login bodies, and bad passwords", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);

    const weak = await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "short" })
      }),
      testEnv
    );
    expect(weak.status).toBe(400);

    const missingBody = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: "{"
      }),
      testEnv
    );
    expect(missingBody.status).toBe(400);

    await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "StrongPassword123" })
      }),
      testEnv
    );

    const badPassword = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "admin", password: "WrongPassword123" })
      }),
      testEnv
    );
    expect(badPassword.status).toBe(401);
  });

  it("returns the current user only when a valid session cookie is present", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);

    const guest = await handleRequest(new Request("https://example.com/api/me"), testEnv);
    expect(guest.status).toBe(401);

    await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "StrongPassword123" })
      }),
      testEnv
    );
    const login = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "admin", password: "StrongPassword123" })
      }),
      testEnv
    );
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();

    const currentUser = await handleRequest(
      new Request("https://example.com/api/me", {
        headers: { cookie: `theme=dark; ${cookie}` }
      }),
      testEnv
    );
    expect(currentUser.status).toBe(200);
    expect(currentUser.headers.get("set-cookie")).toContain("Max-Age=2592000");
    await expect(json(currentUser)).resolves.toMatchObject({
      data: {
        user: {
          username: "admin",
          role: "admin"
        }
      }
    });

    const invalidCookie = await handleRequest(
      new Request("https://example.com/api/me", {
        headers: { cookie: "theme=dark; growth_session=bad" }
      }),
      testEnv
    );
    expect(invalidCookie.status).toBe(401);

    const unrelatedCookie = await handleRequest(
      new Request("https://example.com/api/me", {
        headers: { cookie: "theme=dark" }
      }),
      testEnv
    );
    expect(unrelatedCookie.status).toBe(401);
  });

  it("registers an email user and creates a 30 day session", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    const email = "user@example.com";

    const register = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email, password: "UserPassword123" })
      }),
      testEnv
    );

    expect(register.status).toBe(200);
    expect(register.headers.get("set-cookie")).toContain("Max-Age=2592000");
    expect([...database.users.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email,
          username: "user",
          role: "user",
          status: "active"
        })
      ])
    );
  });

  it("lets email users choose a unique username and login with it", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);

    const register = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email: "named@example.com", username: "named-user", password: "UserPassword123" })
      }),
      testEnv
    );

    expect(register.status).toBe(200);
    expect([...database.users.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "named@example.com",
          username: "named-user",
          display_name: "named-user"
        })
      ])
    );

    const usernameLogin = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "named-user", password: "UserPassword123" })
      }),
      testEnv
    );
    expect(usernameLogin.status).toBe(200);
  });

  it("lets the current user set a password and then login by email and password", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    const email = "user-password@example.com";
    const register = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email, password: "InitialPassword123" })
      }),
      testEnv
    );
    const cookie = register.headers.get("set-cookie")?.split(";")[0];

    const password = await handleRequest(
      new Request("https://example.com/api/me/password", {
        method: "POST",
        headers: { cookie: cookie ?? "" },
        body: JSON.stringify({ password: "UserPassword123" })
      }),
      testEnv
    );
    expect(password.status).toBe(200);

    const login = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: email, password: "UserPassword123" })
      }),
      testEnv
    );
    expect(login.status).toBe(200);
  });

  it("rejects invalid email registration bodies and duplicate emails", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);

    const invalidEmail = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email: "not-an-email", password: "UserPassword123" })
      }),
      testEnv
    );
    expect(invalidEmail.status).toBe(400);

    const weakPassword = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email: "weak@example.com", password: "short" })
      }),
      testEnv
    );
    expect(weakPassword.status).toBe(400);

    const first = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email: "Duplicate@Example.com", password: "UserPassword123" })
      }),
      testEnv
    );
    expect(first.status).toBe(200);

    const duplicate = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email: "duplicate@example.com", password: "UserPassword123" })
      }),
      testEnv
    );
    expect(duplicate.status).toBe(409);

    const duplicateUsername = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email: "another@example.com", username: "duplicate", password: "UserPassword123" })
      }),
      testEnv
    );
    expect(duplicateUsername.status).toBe(409);
  });

  it("clears the admin password only with the backend reset key", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    await handleRequest(
      new Request("https://example.com/api/admin/setup-password", {
        method: "POST",
        body: JSON.stringify({ password: "StrongPassword123" })
      }),
      testEnv
    );

    const forbidden = await handleRequest(
      new Request("https://example.com/api/admin/reset-password", { method: "POST" }),
      testEnv
    );
    expect(forbidden.status).toBe(403);

    const reset = await handleRequest(
      new Request("https://example.com/api/admin/reset-password", {
        method: "POST",
        headers: { "x-admin-reset-key": "reset-key" }
      }),
      testEnv
    );

    expect(reset.status).toBe(200);
    expect(database.users.get("admin")?.password_hash).toBeNull();
  });

  it("keeps admin authenticated across refresh through /api/me", async () => {
    const database = new FakeD1Database();
    const { cookie, testEnv } = await loginAdmin(database);

    const me = await handleRequest(
      new Request("https://example.com/api/me", {
        headers: { cookie }
      }),
      testEnv
    );

    expect(me.status).toBe(200);
    await expect(json(me)).resolves.toMatchObject({
      data: {
        user: {
          username: "admin",
          role: "admin"
        }
      }
    });
  });

  it("lets admins create, list, update, reset, and delete users", async () => {
    const database = new FakeD1Database();
    const { cookie, testEnv } = await loginAdmin(database);

    const create = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({
          email: "alice@example.com",
          phone: "13700137000",
          username: "alice",
          displayName: "Alice",
          role: "user",
          status: "active"
        })
      }),
      testEnv
    );
    expect(create.status).toBe(200);
    const createPayload = (await json(create)) as { data: { user: { id: string }; defaultPassword: string } };
    expect(createPayload.data.defaultPassword).toEqual(expect.any(String));

    const list = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        headers: { cookie }
      }),
      testEnv
    );
    expect(list.status).toBe(200);
    await expect(json(list)).resolves.toMatchObject({
      data: {
        users: expect.arrayContaining([
          expect.objectContaining({
          username: "alice",
          email: "alice@example.com",
          mustChangePassword: true
          })
        ])
      }
    });

    const update = await handleRequest(
      new Request(`https://example.com/api/admin/users/${createPayload.data.user.id}`, {
        method: "PATCH",
        headers: { cookie },
        body: JSON.stringify({
          email: "alice-updated@example.com",
          phone: "13700137001",
          username: "alice-updated",
          displayName: "Alice Updated",
          role: "user",
          status: "disabled"
        })
      }),
      testEnv
    );
    expect(update.status).toBe(200);
    expect(database.users.get(createPayload.data.user.id)).toMatchObject({
      phone: "13700137001",
      email: "alice-updated@example.com",
      username: "alice-updated",
      status: "disabled"
    });

    const reset = await handleRequest(
      new Request(`https://example.com/api/admin/users/${createPayload.data.user.id}/reset-password`, {
        method: "POST",
        headers: { cookie }
      }),
      testEnv
    );
    expect(reset.status).toBe(200);
    expect(database.users.get(createPayload.data.user.id)?.must_change_password).toBe(true);

    const remove = await handleRequest(
      new Request(`https://example.com/api/admin/users/${createPayload.data.user.id}`, {
        method: "DELETE",
        headers: { cookie }
      }),
      testEnv
    );
    expect(remove.status).toBe(200);
    expect(database.users.has(createPayload.data.user.id)).toBe(false);
  });

  it("lets admins create users with required usernames and optional emails", async () => {
    const database = new FakeD1Database();
    const { cookie, testEnv } = await loginAdmin(database);

    const missingUsername = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ email: "missing-username@example.com" })
      }),
      testEnv
    );
    expect(missingUsername.status).toBe(400);

    const create = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({
          username: "admin-created",
          displayName: "Admin Created",
          role: "user",
          status: "active"
        })
      }),
      testEnv
    );
    expect(create.status).toBe(200);
    const createPayload = (await json(create)) as { data: { user: { id: string; email: string }; defaultPassword: string } };
    expect(createPayload.data.user.email).toBe("");

    const usernameLogin = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "admin-created", password: createPayload.data.defaultPassword })
      }),
      testEnv
    );
    expect(usernameLogin.status).toBe(200);

    const duplicateUsername = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ username: "admin-created" })
      }),
      testEnv
    );
    expect(duplicateUsername.status).toBe(409);
  });

  it("returns admin dashboard metrics for users and recent activity", async () => {
    const database = new FakeD1Database();
    const { cookie, testEnv } = await loginAdmin(database);
    database.users.set("active-user", {
      id: "active-user",
      email: "active@example.com",
      username: "active",
      role: "user",
      status: "active",
      display_name: "Active User",
      must_change_password: false,
      last_login_at: new Date().toISOString()
    });
    database.records.push(
      {
        id: "record-today",
        user_id: "active-user",
        record_date: new Date().toISOString().slice(0, 10),
        dimension: "coding",
        hours: 1,
        description: "today",
        exp: 10
      },
      {
        id: "record-old",
        user_id: "active-user",
        record_date: "2000-01-01",
        dimension: "coding",
        hours: 1,
        description: "old",
        exp: 10
      }
    );

    const metrics = await handleRequest(
      new Request("https://example.com/api/admin/metrics", {
        headers: { cookie }
      }),
      testEnv
    );

    expect(metrics.status).toBe(200);
    await expect(json(metrics)).resolves.toMatchObject({
      data: {
        totalUsers: 2,
        activeToday: 1,
        weeklyRecords: 1
      }
    });
  });

  it("protects admin dashboard metrics from guests and normal users", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);

    const guestMetrics = await handleRequest(new Request("https://example.com/api/admin/metrics"), testEnv);
    expect(guestMetrics.status).toBe(401);

    const register = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email: "metrics-user@example.com", password: "MetricUser123" })
      }),
      testEnv
    );
    const userCookie = register.headers.get("set-cookie")?.split(";")[0] ?? "";
    const forbiddenMetrics = await handleRequest(
      new Request("https://example.com/api/admin/metrics", {
        headers: { cookie: userCookie }
      }),
      testEnv
    );
    expect(forbiddenMetrics.status).toBe(403);
  });

  it("requires admin-created users to change default password before normal use", async () => {
    const database = new FakeD1Database();
    const { cookie, testEnv } = await loginAdmin(database);
    const create = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ email: "bob@example.com", phone: "13600136000", username: "bob" })
      }),
      testEnv
    );
    const createPayload = (await json(create)) as { data: { defaultPassword: string } };

    const login = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "bob@example.com", password: createPayload.data.defaultPassword })
      }),
      testEnv
    );
    expect(login.status).toBe(200);
    await expect(json(login)).resolves.toMatchObject({
      data: {
        requiresPasswordChange: true
      }
    });

    const userCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    const password = await handleRequest(
      new Request("https://example.com/api/me/password", {
        method: "POST",
        headers: { cookie: userCookie },
        body: JSON.stringify({ password: "BobPassword123" })
      }),
      testEnv
    );
    expect(password.status).toBe(200);

    const normalLogin = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "bob@example.com", password: "BobPassword123" })
      }),
      testEnv
    );
    expect(normalLogin.status).toBe(200);
    await expect(json(normalLogin)).resolves.toMatchObject({
      data: {
        requiresPasswordChange: false
      }
    });
  });

  it("rejects protected admin operations from guests and normal users", async () => {
    const database = new FakeD1Database();
    const guestList = await handleRequest(new Request("https://example.com/api/admin/users"), env(database));
    expect(guestList.status).toBe(401);

    const email = "normal-user@example.com";
    const testEnv = env(database);
    const register = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email, password: "NormalUser123" })
      }),
      testEnv
    );
    const userCookie = register.headers.get("set-cookie")?.split(";")[0] ?? "";
    const forbidden = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        headers: { cookie: userCookie }
      }),
      testEnv
    );
    expect(forbidden.status).toBe(403);
  });

  it("rejects unsafe admin user mutations and disabled user login", async () => {
    const database = new FakeD1Database();
    const { cookie, testEnv } = await loginAdmin(database);

    const invalidCreate = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ email: "bad-email", phone: "bad-phone" })
      }),
      testEnv
    );
    expect(invalidCreate.status).toBe(400);

    const invalidPhone = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ email: "valid@example.com", phone: "bad-phone" })
      }),
      testEnv
    );
    expect(invalidPhone.status).toBe(400);

    const blankPhone = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ email: "blank-phone@example.com", phone: "", username: "blank-phone" })
      }),
      testEnv
    );
    expect(blankPhone.status).toBe(200);

    const existingUser = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ email: "existing@example.com", username: "existing-user" })
      }),
      testEnv
    );
    const existingPayload = (await json(existingUser)) as { data: { user: { id: string } } };

    const duplicateEditUsername = await handleRequest(
      new Request(`https://example.com/api/admin/users/${existingPayload.data.user.id}`, {
        method: "PATCH",
        headers: { cookie },
        body: JSON.stringify({ email: "existing-new@example.com", username: "blank-phone" })
      }),
      testEnv
    );
    expect(duplicateEditUsername.status).toBe(409);

    const duplicateEditEmail = await handleRequest(
      new Request(`https://example.com/api/admin/users/${existingPayload.data.user.id}`, {
        method: "PATCH",
        headers: { cookie },
        body: JSON.stringify({ email: "blank-phone@example.com", username: "existing-user" })
      }),
      testEnv
    );
    expect(duplicateEditEmail.status).toBe(409);

    const editAdmin = await handleRequest(
      new Request("https://example.com/api/admin/users/admin", {
        method: "PATCH",
        headers: { cookie },
        body: JSON.stringify({ email: "root@example.com", phone: "13700137002", username: "root" })
      }),
      testEnv
    );
    expect(editAdmin.status).toBe(400);

    const deleteAdmin = await handleRequest(
      new Request("https://example.com/api/admin/users/admin", {
        method: "DELETE",
        headers: { cookie }
      }),
      testEnv
    );
    expect(deleteAdmin.status).toBe(400);

    const resetAdmin = await handleRequest(
      new Request("https://example.com/api/admin/users/admin/reset-password", {
        method: "POST",
        headers: { cookie }
      }),
      testEnv
    );
    expect(resetAdmin.status).toBe(400);

    const create = await handleRequest(
      new Request("https://example.com/api/admin/users", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ email: "disabled@example.com", phone: "13400134000", username: "disabled", status: "disabled" })
      }),
      testEnv
    );
    const createPayload = (await json(create)) as { data: { defaultPassword: string } };
    const disabledLogin = await handleRequest(
      new Request("https://example.com/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ account: "disabled@example.com", password: createPayload.data.defaultPassword })
      }),
      testEnv
    );
    expect(disabledLogin.status).toBe(401);
  });

  it("does not expose phone codes when SMS is not configured", async () => {
    const database = new FakeD1Database();
    const response = await handleRequest(
      new Request("https://example.com/api/auth/request-phone-code", {
        method: "POST",
        body: JSON.stringify({ phone: "13300133000", purpose: "register" })
      }),
      env(database, { DEV_SMS_CODES: undefined, SMS_PROVIDER: undefined })
    );

    expect(response.status).toBe(501);
    expect(database.phoneCodes).toHaveLength(0);
  });

  it("does not claim to send phone codes for unsupported SMS providers", async () => {
    const database = new FakeD1Database();
    const response = await handleRequest(
      new Request("https://example.com/api/auth/request-phone-code", {
        method: "POST",
        body: JSON.stringify({ phone: "13300133001", purpose: "register" })
      }),
      env(database, { DEV_SMS_CODES: undefined, SMS_PROVIDER: "unknown" })
    );

    expect(response.status).toBe(501);
    expect(database.phoneCodes).toHaveLength(0);
  });

  it("stores phone codes after webhook SMS delivery succeeds", async () => {
    const database = new FakeD1Database();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return new Response("ok", { status: 200 });
    });

    try {
      const response = await handleRequest(
        new Request("https://example.com/api/auth/request-phone-code", {
          method: "POST",
          body: JSON.stringify({ phone: "13300133002", purpose: "register" })
        }),
        env(database, {
          DEV_SMS_CODES: undefined,
          SMS_PROVIDER: "webhook",
          SMS_WEBHOOK_URL: "https://sms.example/send",
          SMS_API_KEY: "sms-key"
        })
      );
      const payload = (await json(response)) as { data: { devCode?: string } };

      expect(response.status).toBe(200);
      expect(payload.data.devCode).toBeUndefined();
      expect(database.phoneCodes).toHaveLength(1);
      expect(requests[0]).toMatchObject({ url: "https://sms.example/send" });
      expect(requests[0].init?.headers).toMatchObject({ authorization: "Bearer sms-key" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps legacy phone registration backend compatible but rejects bad codes", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    const phone = "13300133006";

    const codeResponse = await handleRequest(
      new Request("https://example.com/api/auth/request-phone-code", {
        method: "POST",
        body: JSON.stringify({ phone, purpose: "register" })
      }),
      testEnv
    );
    const codePayload = (await json(codeResponse)) as { data: { devCode: string } };

    const badCode = await handleRequest(
      new Request("https://example.com/api/auth/register-phone", {
        method: "POST",
        body: JSON.stringify({ phone, code: "000000" })
      }),
      testEnv
    );
    expect(badCode.status).toBe(401);

    const registered = await handleRequest(
      new Request("https://example.com/api/auth/register-phone", {
        method: "POST",
        body: JSON.stringify({ phone, code: codePayload.data.devCode })
      }),
      testEnv
    );
    expect(registered.status).toBe(200);
    expect(database.phoneCodes[0].consumed_at).toBe("now");
  });

  it("does not store phone codes when webhook delivery fails", async () => {
    const database = new FakeD1Database();
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));

    try {
      const response = await handleRequest(
        new Request("https://example.com/api/auth/request-phone-code", {
          method: "POST",
          body: JSON.stringify({ phone: "13300133003", purpose: "register" })
        }),
        env(database, {
          DEV_SMS_CODES: undefined,
          SMS_PROVIDER: "webhook",
          SMS_WEBHOOK_URL: "https://sms.example/send"
        })
      );

      expect(response.status).toBe(502);
      expect(database.phoneCodes).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not store phone codes when webhook configuration is incomplete or unreachable", async () => {
    const database = new FakeD1Database();

    const missingUrl = await handleRequest(
      new Request("https://example.com/api/auth/request-phone-code", {
        method: "POST",
        body: JSON.stringify({ phone: "13300133004", purpose: "register" })
      }),
      env(database, {
        DEV_SMS_CODES: undefined,
        SMS_PROVIDER: "webhook",
        SMS_WEBHOOK_URL: undefined
      })
    );
    expect(missingUrl.status).toBe(501);

    vi.stubGlobal("fetch", async () => {
      throw new Error("network failed");
    });
    try {
      const unreachable = await handleRequest(
        new Request("https://example.com/api/auth/request-phone-code", {
          method: "POST",
          body: JSON.stringify({ phone: "13300133005", purpose: "register" })
        }),
        env(database, {
          DEV_SMS_CODES: undefined,
          SMS_PROVIDER: "webhook",
          SMS_WEBHOOK_URL: "https://sms.example/send"
        })
      );

      expect(unreachable.status).toBe(502);
      expect(database.phoneCodes).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("isolates dashboard and record APIs by authenticated user", async () => {
    const database = new FakeD1Database();
    const envOne = env(database);

    async function register(email: string): Promise<string> {
      const registerResponse = await handleRequest(
        new Request("https://example.com/api/auth/register-email", {
          method: "POST",
          body: JSON.stringify({ email, password: "UserPassword123" })
        }),
        envOne
      );
      return registerResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    }

    const userOneCookie = await register("one@example.com");
    const userTwoCookie = await register("two@example.com");

    const oneRecord = await handleRequest(
      new Request("https://example.com/api/records", {
        method: "POST",
        headers: { cookie: userOneCookie },
        body: JSON.stringify({ date: "2026-05-07", dimension: "科研学习", hours: 2, description: "论文阅读" })
      }),
      envOne
    );
    expect(oneRecord.status).toBe(200);

    const twoRecord = await handleRequest(
      new Request("https://example.com/api/records", {
        method: "POST",
        headers: { cookie: userTwoCookie },
        body: JSON.stringify({ date: "2026-05-07", dimension: "编程能力", hours: 1, description: "功能开发" })
      }),
      envOne
    );
    expect(twoRecord.status).toBe(200);

    const userOneRecords = await handleRequest(
      new Request("https://example.com/api/records", { headers: { cookie: userOneCookie } }),
      envOne
    );
    await expect(json(userOneRecords)).resolves.toMatchObject({
      data: {
        records: [
          expect.objectContaining({
            dimension: "科研学习",
            description: "论文阅读"
          })
        ]
      }
    });

    const userOneDashboard = await handleRequest(
      new Request("https://example.com/api/dashboard", { headers: { cookie: userOneCookie } }),
      envOne
    );
    expect(userOneDashboard.status).toBe(200);
    const dashboardPayload = (await json(userOneDashboard)) as { data: { records: Array<{ dimension: string }> } };
    expect(dashboardPayload.data.records).toHaveLength(1);
    expect(dashboardPayload.data.records[0].dimension).toBe("科研学习");
  });

  it("validates and mutates only the current user's records", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    const email = "records@example.com";
    const register = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email, password: "RecordsPassword123" })
      }),
      testEnv
    );
    const cookie = register.headers.get("set-cookie")?.split(";")[0] ?? "";

    const invalid = await handleRequest(
      new Request("https://example.com/api/records", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ date: "2026-05-07", dimension: "", hours: 13 })
      }),
      testEnv
    );
    expect(invalid.status).toBe(400);

    const create = await handleRequest(
      new Request("https://example.com/api/records", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ date: "2026-05-07", dimension: "科研学习", hours: 4, description: "深度学习" })
      }),
      testEnv
    );
    const createPayload = (await json(create)) as { data: { record: { id: string } } };

    const update = await handleRequest(
      new Request(`https://example.com/api/records/${createPayload.data.record.id}`, {
        method: "PATCH",
        headers: { cookie },
        body: JSON.stringify({ date: "2026-05-08", dimension: "编程能力", hours: 2.5, description: "接口开发" })
      }),
      testEnv
    );
    expect(update.status).toBe(200);
    expect(database.records[0]).toMatchObject({ dimension: "编程能力", description: "接口开发" });

    const remove = await handleRequest(
      new Request(`https://example.com/api/records/${createPayload.data.record.id}`, {
        method: "DELETE",
        headers: { cookie }
      }),
      testEnv
    );
    expect(remove.status).toBe(200);
    expect(database.records).toHaveLength(0);
  });

  it("stores settings per authenticated user and applies them to dashboard data", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    const register = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email: "settings@example.com", password: "SettingsPassword123" })
      }),
      testEnv
    );
    const cookie = register.headers.get("set-cookie")?.split(";")[0] ?? "";

    const update = await handleRequest(
      new Request("https://example.com/api/settings", {
        method: "PUT",
        headers: { cookie },
        body: JSON.stringify({
          title: "自定义成长系统",
          subtitle: "今日也要推进一点",
          dimensions: ["科研学习", "编程能力"],
          goals: ["完成一个功能"],
          quotes: [{ id: "q1", date: "2026-05-08", text: "先把闭环跑通。" }],
          theme: "light"
        })
      }),
      testEnv
    );
    expect(update.status).toBe(200);

    const settings = await handleRequest(new Request("https://example.com/api/settings", { headers: { cookie } }), testEnv);
    await expect(json(settings)).resolves.toMatchObject({
      data: {
        title: "自定义成长系统",
        dimensions: ["科研学习", "编程能力"],
        theme: "light"
      }
    });

    const dashboard = await handleRequest(new Request("https://example.com/api/dashboard", { headers: { cookie } }), testEnv);
    await expect(json(dashboard)).resolves.toMatchObject({
      data: {
        title: "自定义成长系统",
        subtitle: "今日也要推进一点",
        dimensions: ["科研学习", "编程能力"],
        goals: ["完成一个功能"]
      }
    });
  });

  it("validates settings and falls back when stored settings are malformed", async () => {
    const database = new FakeD1Database();
    const testEnv = env(database);
    const register = await handleRequest(
      new Request("https://example.com/api/auth/register-email", {
        method: "POST",
        body: JSON.stringify({ email: "settings-fallback@example.com", password: "SettingsPassword123" })
      }),
      testEnv
    );
    const cookie = register.headers.get("set-cookie")?.split(";")[0] ?? "";
    const userId = String(database.sessions[0].user_id);

    const invalid = await handleRequest(
      new Request("https://example.com/api/settings", {
        method: "PUT",
        headers: { cookie },
        body: JSON.stringify({ dimensions: [] })
      }),
      testEnv
    );
    expect(invalid.status).toBe(400);

    database.settings.set(userId, {
      user_id: userId,
      title: "",
      subtitle: "",
      dimensions_json: "{bad",
      descriptions_json: "{bad",
      dimension_level_exp_json: "{bad",
      goals_json: "\"not-array\"",
      quotes_json: "\"not-array\"",
      theme: "dark"
    });

    const fallback = await handleRequest(new Request("https://example.com/api/settings", { headers: { cookie } }), testEnv);
    await expect(json(fallback)).resolves.toMatchObject({
      data: {
        title: "✨ 园中月努力可视化系统",
        subtitle: "自由才是我永恒的向往",
        dimensions: ["科研学习", "自媒体", "运动健身", "化妆技术", "电竞操作", "表达能力", "剪辑技能", "编程能力"],
        theme: "dark"
      }
    });
  });
});
