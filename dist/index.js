// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// server/localStore.ts
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
var DB_PATH = join(process.cwd(), "local-db.json");
var EMPTY = {
  agendaEvents: [],
  programPoints: [],
  socialShares: [],
  supportSubmissions: [],
  settings: { comingSoon: false },
  _nextId: { agendaEvents: 1, programPoints: 1, socialShares: 1, supportSubmissions: 1 }
};
function load() {
  if (!existsSync(DB_PATH)) return JSON.parse(JSON.stringify(EMPTY));
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf-8"));
  } catch {
    return JSON.parse(JSON.stringify(EMPTY));
  }
}
function save(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}
function d(v) {
  if (v instanceof Date) return v;
  return new Date(v);
}
function hydrateEvent(e) {
  return { ...e, date: d(e.date), createdAt: d(e.createdAt), updatedAt: d(e.updatedAt) };
}
function hydratePoint(p) {
  return { ...p, createdAt: d(p.createdAt), updatedAt: d(p.updatedAt) };
}
function hydrateShare(s) {
  return { ...s, createdAt: d(s.createdAt), updatedAt: d(s.updatedAt) };
}
function hydrateSubmission(s) {
  return { ...s, createdAt: d(s.createdAt) };
}
function localGetAllAgendaEvents() {
  const db = load();
  return db.agendaEvents.map(hydrateEvent).sort((a, b) => a.date.getTime() - b.date.getTime());
}
function localGetPublishedAgendaEvents() {
  return localGetAllAgendaEvents().filter((e) => e.isPublished);
}
function localCreateAgendaEvent(data) {
  const db = load();
  const now = /* @__PURE__ */ new Date();
  const id = db._nextId.agendaEvents++;
  db.agendaEvents.push({
    id,
    title: data.title,
    description: data.description ?? null,
    category: data.category ?? "R\xE9union",
    date: new Date(data.date),
    time: data.time ?? "19h00",
    location: data.location ?? null,
    isPublished: data.isPublished ?? true,
    sortOrder: data.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now
  });
  save(db);
}
function localUpdateAgendaEvent(id, data) {
  const db = load();
  const idx = db.agendaEvents.findIndex((e) => e.id === id);
  if (idx !== -1) {
    db.agendaEvents[idx] = { ...db.agendaEvents[idx], ...data, id, updatedAt: /* @__PURE__ */ new Date() };
    save(db);
  }
}
function localDeleteAgendaEvent(id) {
  const db = load();
  db.agendaEvents = db.agendaEvents.filter((e) => e.id !== id);
  save(db);
}
function localGetAllProgramPoints() {
  const db = load();
  return db.programPoints.map(hydratePoint).sort((a, b) => a.sortOrder - b.sortOrder);
}
function localGetPublishedProgramPoints() {
  return localGetAllProgramPoints().filter((p) => p.isPublished);
}
function localCreateProgramPoint(data) {
  const db = load();
  const now = /* @__PURE__ */ new Date();
  const id = db._nextId.programPoints++;
  db.programPoints.push({
    id,
    number: data.number,
    title: data.title,
    subtitle: data.subtitle ?? null,
    frontText: data.frontText,
    backText: data.backText,
    isPublished: data.isPublished ?? true,
    sortOrder: data.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now
  });
  save(db);
}
function localUpdateProgramPoint(id, data) {
  const db = load();
  const idx = db.programPoints.findIndex((p) => p.id === id);
  if (idx !== -1) {
    db.programPoints[idx] = { ...db.programPoints[idx], ...data, id, updatedAt: /* @__PURE__ */ new Date() };
    save(db);
  }
}
function localDeleteProgramPoint(id) {
  const db = load();
  db.programPoints = db.programPoints.filter((p) => p.id !== id);
  save(db);
}
function localGetAllSocialShares() {
  const db = load();
  return db.socialShares.map(hydrateShare).sort((a, b) => a.sortOrder - b.sortOrder);
}
function localGetPublishedSocialShares() {
  return localGetAllSocialShares().filter((s) => s.isPublished);
}
function localCreateSocialShare(data) {
  const db = load();
  const now = /* @__PURE__ */ new Date();
  const id = db._nextId.socialShares++;
  db.socialShares.push({
    id,
    title: data.title,
    imageUrl: data.imageUrl,
    textFacebook: data.textFacebook,
    textX: data.textX,
    textLinkedin: data.textLinkedin,
    hashtags: data.hashtags ?? "#MR #Bruxelles #Geoffroy",
    isPublished: data.isPublished ?? true,
    sortOrder: data.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now
  });
  save(db);
}
function localUpdateSocialShare(id, data) {
  const db = load();
  const idx = db.socialShares.findIndex((s) => s.id === id);
  if (idx !== -1) {
    db.socialShares[idx] = { ...db.socialShares[idx], ...data, id, updatedAt: /* @__PURE__ */ new Date() };
    save(db);
  }
}
function localDeleteSocialShare(id) {
  const db = load();
  db.socialShares = db.socialShares.filter((s) => s.id !== id);
  save(db);
}
function getComingSoon() {
  const db = load();
  return db.settings?.comingSoon ?? false;
}
function setComingSoon(enabled) {
  const db = load();
  if (!db.settings) db.settings = { comingSoon: false };
  db.settings.comingSoon = enabled;
  save(db);
}
function localGetAllSupportSubmissions() {
  const db = load();
  return db.supportSubmissions.map(hydrateSubmission).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
function localCreateSupportSubmission(data) {
  const db = load();
  const now = /* @__PURE__ */ new Date();
  const id = db._nextId.supportSubmissions++;
  db.supportSubmissions.push({
    id,
    prenom: data.prenom,
    nom: data.nom,
    email: data.email,
    telephone: data.telephone ?? null,
    commune: data.commune,
    message: data.message ?? null,
    supportType: data.supportType ?? "contact",
    createdAt: now
  });
  save(db);
}

// drizzle/schema.ts
import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var agendaEvents = mysqlTable("agenda_events", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }).notNull().default("R\xE9union"),
  date: timestamp("date").notNull(),
  time: varchar("time", { length: 10 }).notNull().default("19h00"),
  location: varchar("location", { length: 255 }),
  isPublished: boolean("isPublished").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var programPoints = mysqlTable("program_points", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 4 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  subtitle: varchar("subtitle", { length: 255 }),
  frontText: text("frontText").notNull(),
  backText: text("backText").notNull(),
  isPublished: boolean("isPublished").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var socialShares = mysqlTable("social_shares", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  imageUrl: text("imageUrl").notNull(),
  textFacebook: text("textFacebook").notNull(),
  textX: text("textX").notNull(),
  textLinkedin: text("textLinkedin").notNull(),
  hashtags: varchar("hashtags", { length: 255 }).default("#MR #Bruxelles #Geoffroy"),
  isPublished: boolean("isPublished").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var supportSubmissions = mysqlTable("support_submissions", {
  id: int("id").autoincrement().primaryKey(),
  prenom: varchar("prenom", { length: 100 }).notNull(),
  nom: varchar("nom", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  telephone: varchar("telephone", { length: 30 }),
  commune: varchar("commune", { length: 100 }).notNull(),
  message: text("message"),
  supportType: varchar("supportType", { length: 64 }).default("contact"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "local-dev-secret",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getPublishedAgendaEvents() {
  const db = await getDb();
  if (!db) return localGetPublishedAgendaEvents();
  return db.select().from(agendaEvents).where(eq(agendaEvents.isPublished, true)).orderBy(asc(agendaEvents.date));
}
async function getAllAgendaEvents() {
  const db = await getDb();
  if (!db) return localGetAllAgendaEvents();
  return db.select().from(agendaEvents).orderBy(asc(agendaEvents.date));
}
async function createAgendaEvent(data) {
  const db = await getDb();
  if (!db) {
    localCreateAgendaEvent(data);
    return;
  }
  await db.insert(agendaEvents).values(data);
}
async function updateAgendaEvent(id, data) {
  const db = await getDb();
  if (!db) {
    localUpdateAgendaEvent(id, data);
    return;
  }
  await db.update(agendaEvents).set(data).where(eq(agendaEvents.id, id));
}
async function deleteAgendaEvent(id) {
  const db = await getDb();
  if (!db) {
    localDeleteAgendaEvent(id);
    return;
  }
  await db.delete(agendaEvents).where(eq(agendaEvents.id, id));
}
async function getPublishedProgramPoints() {
  const db = await getDb();
  if (!db) return localGetPublishedProgramPoints();
  return db.select().from(programPoints).where(eq(programPoints.isPublished, true)).orderBy(asc(programPoints.sortOrder));
}
async function getAllProgramPoints() {
  const db = await getDb();
  if (!db) return localGetAllProgramPoints();
  return db.select().from(programPoints).orderBy(asc(programPoints.sortOrder));
}
async function createProgramPoint(data) {
  const db = await getDb();
  if (!db) {
    localCreateProgramPoint(data);
    return;
  }
  await db.insert(programPoints).values(data);
}
async function updateProgramPoint(id, data) {
  const db = await getDb();
  if (!db) {
    localUpdateProgramPoint(id, data);
    return;
  }
  await db.update(programPoints).set(data).where(eq(programPoints.id, id));
}
async function deleteProgramPoint(id) {
  const db = await getDb();
  if (!db) {
    localDeleteProgramPoint(id);
    return;
  }
  await db.delete(programPoints).where(eq(programPoints.id, id));
}
async function getPublishedSocialShares() {
  const db = await getDb();
  if (!db) return localGetPublishedSocialShares();
  return db.select().from(socialShares).where(eq(socialShares.isPublished, true)).orderBy(asc(socialShares.sortOrder));
}
async function getAllSocialShares() {
  const db = await getDb();
  if (!db) return localGetAllSocialShares();
  return db.select().from(socialShares).orderBy(asc(socialShares.sortOrder));
}
async function createSocialShare(data) {
  const db = await getDb();
  if (!db) {
    localCreateSocialShare(data);
    return;
  }
  await db.insert(socialShares).values(data);
}
async function updateSocialShare(id, data) {
  const db = await getDb();
  if (!db) {
    localUpdateSocialShare(id, data);
    return;
  }
  await db.update(socialShares).set(data).where(eq(socialShares.id, id));
}
async function deleteSocialShare(id) {
  const db = await getDb();
  if (!db) {
    localDeleteSocialShare(id);
    return;
  }
  await db.delete(socialShares).where(eq(socialShares.id, id));
}
async function createSupportSubmission(data) {
  const db = await getDb();
  if (!db) {
    localCreateSupportSubmission(data);
    return;
  }
  await db.insert(supportSubmissions).values(data);
}
async function getAllSupportSubmissions() {
  const db = await getDb();
  if (!db) return localGetAllSupportSubmissions();
  return db.select().from(supportSubmissions).orderBy(asc(supportSubmissions.createdAt));
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId === "admin-local") {
      return {
        id: 0,
        openId: "admin-local",
        name: session.name || "Admin",
        email: ENV.adminEmail || null,
        loginMethod: "local",
        role: "admin",
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
        lastSignedIn: /* @__PURE__ */ new Date()
      };
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/routers.ts
import { z as z2 } from "zod";
import { scryptSync, timingSafeEqual } from "crypto";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/storage.ts
function getStorageConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}
function buildUploadUrl(baseUrl, relKey) {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function toFormData(data, contentType, fileName) {
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}
function buildAuthHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { baseUrl, apiKey } = getStorageConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

// server/routers.ts
import { nanoid } from "nanoid";
var adminProcedure2 = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
    adminLogin: publicProcedure.input(z2.object({ email: z2.string().email(), password: z2.string().min(1) })).mutation(async ({ input, ctx }) => {
      if (!ENV.adminEmail || !ENV.adminPasswordHash) {
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Admin non configur\xE9." });
      }
      if (input.email.toLowerCase() !== ENV.adminEmail.toLowerCase()) {
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Email ou mot de passe incorrect." });
      }
      const [salt, storedHash] = ENV.adminPasswordHash.split(":");
      if (!salt || !storedHash) {
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Hash invalide." });
      }
      const inputHash = scryptSync(input.password, salt, 64);
      const storedHashBuf = Buffer.from(storedHash, "hex");
      const match = inputHash.length === storedHashBuf.length && timingSafeEqual(inputHash, storedHashBuf);
      if (!match) {
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Email ou mot de passe incorrect." });
      }
      const token = await sdk.signSession(
        { openId: "admin-local", appId: "local", name: "Admin" },
        { expiresInMs: 7 * 24 * 60 * 60 * 1e3 }
      );
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1e3 });
      return { success: true };
    })
  }),
  agenda: router({
    list: publicProcedure.query(() => getPublishedAgendaEvents()),
    listAll: adminProcedure2.query(() => getAllAgendaEvents()),
    create: adminProcedure2.input(z2.object({
      title: z2.string().min(1),
      description: z2.string().optional(),
      category: z2.string().default("R\xE9union"),
      date: z2.date(),
      time: z2.string().default("19h00"),
      location: z2.string().optional(),
      isPublished: z2.boolean().default(true),
      sortOrder: z2.number().default(0)
    })).mutation(async ({ input }) => {
      await createAgendaEvent(input);
      return { success: true };
    }),
    update: adminProcedure2.input(z2.object({
      id: z2.number(),
      title: z2.string().min(1).optional(),
      description: z2.string().optional(),
      category: z2.string().optional(),
      date: z2.date().optional(),
      time: z2.string().optional(),
      location: z2.string().optional(),
      isPublished: z2.boolean().optional(),
      sortOrder: z2.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateAgendaEvent(id, data);
      return { success: true };
    }),
    delete: adminProcedure2.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
      await deleteAgendaEvent(input.id);
      return { success: true };
    }),
    seedDefaults: adminProcedure2.mutation(async () => {
      const existing = await getAllAgendaEvents();
      if (existing.length > 0) return { seeded: false };
      const defaults = [
        { title: "R\xE9union de section \u2014 Ixelles", description: "Pr\xE9sentation de la candidature et \xE9changes avec les militants de la section d'Ixelles.", category: "R\xE9union", date: /* @__PURE__ */ new Date("2026-04-12"), time: "19h30", location: "Maison du Peuple, Ixelles", isPublished: true, sortOrder: 0 },
        { title: "Conf\xE9rence de presse MR Bruxelles", description: "Annonce officielle de la candidature \xE0 la pr\xE9sidence de la R\xE9gionale MR Bruxelles & P\xE9riph\xE9rie.", category: "Presse", date: /* @__PURE__ */ new Date("2026-04-18"), time: "18h00", location: "Parlement bruxellois", isPublished: true, sortOrder: 1 },
        { title: "Assembl\xE9e g\xE9n\xE9rale \u2014 Bruxelles-Ville", description: "Assembl\xE9e g\xE9n\xE9rale des membres MR de la section Bruxelles-Ville. Pr\xE9sentation du programme.", category: "Assembl\xE9e", date: /* @__PURE__ */ new Date("2026-04-25"), time: "20h00", location: "H\xF4tel de Ville de Bruxelles", isPublished: true, sortOrder: 2 },
        { title: "Porte-\xE0-porte \u2014 Schaerbeek", description: "Action de terrain dans les rues de Schaerbeek pour rencontrer directement les citoyens.", category: "Terrain", date: /* @__PURE__ */ new Date("2026-05-02"), time: "10h00", location: "Schaerbeek", isPublished: true, sortOrder: 3 },
        { title: "Forum lib\xE9ral \u2014 P\xE9riph\xE9rie", description: "Forum de discussion sur les enjeux de la p\xE9riph\xE9rie bruxelloise avec les sections concern\xE9es.", category: "Forum", date: /* @__PURE__ */ new Date("2026-05-10"), time: "14h00", location: "Waterloo", isPublished: true, sortOrder: 4 },
        { title: "R\xE9union de section \u2014 Etterbeek", description: "Rencontre avec les militants d'Etterbeek et pr\xE9sentation des outils de campagne.", category: "R\xE9union", date: /* @__PURE__ */ new Date("2026-05-17"), time: "19h00", location: "Etterbeek", isPublished: true, sortOrder: 5 }
      ];
      for (const ev of defaults) await createAgendaEvent(ev);
      return { seeded: true };
    })
  }),
  programme: router({
    list: publicProcedure.query(() => getPublishedProgramPoints()),
    listAll: adminProcedure2.query(() => getAllProgramPoints()),
    create: adminProcedure2.input(z2.object({
      number: z2.string().min(1).max(4),
      title: z2.string().min(1),
      subtitle: z2.string().optional(),
      frontText: z2.string().min(1),
      backText: z2.string().min(1),
      isPublished: z2.boolean().default(true),
      sortOrder: z2.number().default(0)
    })).mutation(async ({ input }) => {
      await createProgramPoint(input);
      return { success: true };
    }),
    update: adminProcedure2.input(z2.object({
      id: z2.number(),
      number: z2.string().min(1).max(4).optional(),
      title: z2.string().min(1).optional(),
      subtitle: z2.string().optional(),
      frontText: z2.string().optional(),
      backText: z2.string().optional(),
      isPublished: z2.boolean().optional(),
      sortOrder: z2.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateProgramPoint(id, data);
      return { success: true };
    }),
    delete: adminProcedure2.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
      await deleteProgramPoint(input.id);
      return { success: true };
    }),
    seedDefaults: adminProcedure2.mutation(async () => {
      const existing = await getAllProgramPoints();
      if (existing.length > 0) return { seeded: false };
      const defaults = [
        { number: "01", title: "Rassembler et mobiliser", subtitle: "Rencontres & int\xE9gration", frontText: "Mettre en place des rencontres r\xE9guli\xE8res entre sections, cr\xE9er des moments d'\xE9change concrets entre \xE9lus et militants, et mieux int\xE9grer les nouveaux membres.", backText: "Des rencontres r\xE9guli\xE8res entre sections, des moments d'\xE9change concrets entre \xE9lus et militants, et une meilleure int\xE9gration des nouveaux membres pour renforcer notre dynamique collective.", isPublished: true, sortOrder: 0 },
        { number: "02", title: "Soutenir nos sections et nos \xE9lus", subtitle: "Outils & formations", frontText: "D\xE9ployer une bo\xEEte \xE0 outils commune, proposer des formations pratiques et assurer un relais rapide des informations utiles.", backText: "Bo\xEEte \xE0 outils commune (mod\xE8les de tracts, visuels, argumentaires), formations pratiques (communication, r\xE9seaux sociaux, campagne) et relais rapide des informations utiles entre la R\xE9gionale et les sections.", isPublished: true, sortOrder: 1 },
        { number: "03", title: "Structurer notre organisation", subtitle: "Coordination & efficacit\xE9", frontText: "Mettre en place une coordination claire entre la R\xE9gionale, les sections et les \xE9lus, et cr\xE9er des r\xE9f\xE9rents par th\xE9matique.", backText: "Coordination claire entre la R\xE9gionale, les sections et les \xE9lus, am\xE9lioration de la circulation de l'information et r\xE9f\xE9rents par th\xE9matique pour gagner en efficacit\xE9.", isPublished: true, sortOrder: 2 },
        { number: "04", title: "Pr\xE9parer les prochaines \xE9lections", subtitle: "Talents & strat\xE9gie terrain", frontText: "Identifier d\xE8s maintenant les talents dans chaque commune, accompagner les futurs candidats et construire une strat\xE9gie coh\xE9rente.", backText: "Identification des talents dans chaque commune, accompagnement des futurs candidats, et construction d'une strat\xE9gie coh\xE9rente avec un outil de porte-\xE0-porte pour renforcer notre pr\xE9sence sur le terrain.", isPublished: true, sortOrder: 3 },
        { number: "05", title: "Porter une voix lib\xE9rale forte", subtitle: "Bruxelles & nos priorit\xE9s", frontText: "Coordonner nos prises de position, soutenir des initiatives communes et faire entendre nos priorit\xE9s sur la s\xE9curit\xE9, la propret\xE9 et l'attractivit\xE9 de Bruxelles.", backText: "Coordination de nos prises de position, soutien d'initiatives communes et voix claire sur les enjeux essentiels : s\xE9curit\xE9, propret\xE9 et attractivit\xE9 de Bruxelles.", isPublished: true, sortOrder: 4 }
      ];
      for (const point of defaults) await createProgramPoint(point);
      return { seeded: true };
    })
  }),
  social: router({
    list: publicProcedure.query(() => getPublishedSocialShares()),
    listAll: adminProcedure2.query(() => getAllSocialShares()),
    create: adminProcedure2.input(z2.object({
      title: z2.string().min(1),
      imageUrl: z2.string().url(),
      textFacebook: z2.string().min(1),
      textX: z2.string().min(1),
      textLinkedin: z2.string().min(1),
      hashtags: z2.string().optional(),
      isPublished: z2.boolean().default(true),
      sortOrder: z2.number().default(0)
    })).mutation(async ({ input }) => {
      await createSocialShare(input);
      return { success: true };
    }),
    update: adminProcedure2.input(z2.object({
      id: z2.number(),
      title: z2.string().min(1).optional(),
      imageUrl: z2.string().url().optional(),
      textFacebook: z2.string().optional(),
      textX: z2.string().optional(),
      textLinkedin: z2.string().optional(),
      hashtags: z2.string().optional(),
      isPublished: z2.boolean().optional(),
      sortOrder: z2.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateSocialShare(id, data);
      return { success: true };
    }),
    delete: adminProcedure2.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
      await deleteSocialShare(input.id);
      return { success: true };
    }),
    uploadImage: adminProcedure2.input(z2.object({ base64: z2.string(), mimeType: z2.string(), filename: z2.string() })).mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const key = `social-shares/${nanoid()}-${input.filename}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url };
    }),
    seedDefaults: adminProcedure2.mutation(async () => {
      const existing = await getAllSocialShares();
      if (existing.length > 0) return { seeded: false };
      const defaults = [
        { title: "Bruxelles m\xE9rite mieux", imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310419663028295284/eQN5TVRfGQX3c6wB6iBFWy/hero_background-E5RRoczDKc6EpwTeUk9kpx.webp", textFacebook: "\u{1F535} Bruxelles m\xE9rite un MR fort, rassembl\xE9 et ambitieux. Je suis candidat \xE0 la pr\xE9sidence de la R\xE9gionale MR Bruxelles & P\xE9riph\xE9rie. Ensemble, pr\xE9parons nos prochaines victoires ! #MR #Bruxelles #Geoffroy", textX: "\u{1F535} Bruxelles m\xE9rite mieux. Je suis candidat \xE0 la pr\xE9sidence du MR Bruxelles & P\xE9riph\xE9rie. Rejoignez le mouvement ! #MR #Bruxelles", textLinkedin: "Je suis candidat \xE0 la pr\xE9sidence de la R\xE9gionale MR Bruxelles & P\xE9riph\xE9rie. Fort de 26 ans d'engagement politique, je veux rassembler notre mouvement et pr\xE9parer nos victoires futures. #MR #Bruxelles #Politique", hashtags: "#MR #Bruxelles #Geoffroy", isPublished: true, sortOrder: 0 },
        { title: "26 ans d'engagement", imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310419663028295284/eQN5TVRfGQX3c6wB6iBFWy/programme_bg-Kpf8aa92D6zuYveh9KJiep.webp", textFacebook: "26 ans au service de Bruxelles. Conseiller communal, \xC9chevin, Pr\xE9sident de l'Atomium, D\xE9put\xE9 bruxellois. Ce parcours m'a forg\xE9 pour diriger le MR Bruxelles avec ambition et proximit\xE9. #MR #Engagement", textX: "26 ans au service de Bruxelles. Ce parcours m'a forg\xE9 pour diriger le MR avec ambition. #MR #Bruxelles #Engagement", textLinkedin: "Un parcours de 26 ans au service de Bruxelles : Conseiller communal, \xC9chevin, Pr\xE9sident de l'Atomium, D\xE9put\xE9 bruxellois. Cette exp\xE9rience est ma force pour pr\xE9sider le MR Bruxelles & P\xE9riph\xE9rie.", hashtags: "#MR #Engagement #Bruxelles", isPublished: true, sortOrder: 1 },
        { title: "Rejoignez le mouvement", imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310419663028295284/eQN5TVRfGQX3c6wB6iBFWy/hero_background-E5RRoczDKc6EpwTeUk9kpx.webp", textFacebook: "Rejoignez notre mouvement ! Ensemble, nous pouvons b\xE2tir un MR Bruxelles plus fort, plus pr\xE9sent et plus ambitieux. Soutenez ma candidature \xE0 la pr\xE9sidence de la R\xE9gionale. #MR #Bruxelles #Soutien", textX: "Rejoignez notre mouvement ! Soutenez ma candidature \xE0 la pr\xE9sidence du MR Bruxelles. #MR #Soutien", textLinkedin: "Je compte sur vous pour rejoindre notre mouvement lib\xE9ral \xE0 Bruxelles. Votre soutien est pr\xE9cieux pour b\xE2tir ensemble un MR fort et ambitieux. #MR #Liberalisme #Bruxelles", hashtags: "#MR #Soutien #Bruxelles", isPublished: true, sortOrder: 2 }
      ];
      for (const share of defaults) await createSocialShare(share);
      return { seeded: true };
    })
  }),
  support: router({
    submit: publicProcedure.input(z2.object({
      prenom: z2.string().min(1),
      nom: z2.string().min(1),
      email: z2.string().email(),
      telephone: z2.string().optional(),
      commune: z2.string().min(1),
      message: z2.string().optional(),
      supportType: z2.string().default("contact")
    })).mutation(async ({ input }) => {
      await createSupportSubmission(input);
      await notifyOwner({
        title: `Nouveau soutien : ${input.prenom} ${input.nom}`,
        content: `Commune: ${input.commune}
Email: ${input.email}
Type: ${input.supportType}
Message: ${input.message || "\u2014"}`
      });
      return { success: true };
    }),
    listAll: adminProcedure2.query(() => getAllSupportSubmissions())
  }),
  settings: router({
    getComingSoon: publicProcedure.query(() => {
      return { enabled: getComingSoon() };
    }),
    setComingSoon: adminProcedure2.input(z2.object({ enabled: z2.boolean() })).mutation(({ input }) => {
      setComingSoon(input.enabled);
      return { success: true };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid as nanoid2 } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid2()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
