import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import * as local from "./localStore";
import {
  AgendaEvent,
  InsertAgendaEvent,
  InsertProgramPoint,
  InsertSocialShare,
  InsertSupportSubmission,
  InsertUser,
  ProgramPoint,
  SocialShare,
  SupportSubmission,
  agendaEvents,
  programPoints,
  socialShares,
  supportSubmissions,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── AGENDA EVENTS ───────────────────────────────────────────────────────────

export async function getPublishedAgendaEvents(): Promise<AgendaEvent[]> {
  const db = await getDb();
  if (!db) return local.localGetPublishedAgendaEvents();
  return db.select().from(agendaEvents).where(eq(agendaEvents.isPublished, true)).orderBy(asc(agendaEvents.date));
}

export async function getAllAgendaEvents(): Promise<AgendaEvent[]> {
  const db = await getDb();
  if (!db) return local.localGetAllAgendaEvents();
  return db.select().from(agendaEvents).orderBy(asc(agendaEvents.date));
}

export async function createAgendaEvent(data: InsertAgendaEvent): Promise<void> {
  const db = await getDb();
  if (!db) { local.localCreateAgendaEvent(data); return; }
  await db.insert(agendaEvents).values(data);
}

export async function updateAgendaEvent(id: number, data: Partial<InsertAgendaEvent>): Promise<void> {
  const db = await getDb();
  if (!db) { local.localUpdateAgendaEvent(id, data); return; }
  await db.update(agendaEvents).set(data).where(eq(agendaEvents.id, id));
}

export async function deleteAgendaEvent(id: number): Promise<void> {
  const db = await getDb();
  if (!db) { local.localDeleteAgendaEvent(id); return; }
  await db.delete(agendaEvents).where(eq(agendaEvents.id, id));
}

// ─── PROGRAM POINTS ──────────────────────────────────────────────────────────

export async function getPublishedProgramPoints(): Promise<ProgramPoint[]> {
  const db = await getDb();
  if (!db) return local.localGetPublishedProgramPoints();
  return db.select().from(programPoints).where(eq(programPoints.isPublished, true)).orderBy(asc(programPoints.sortOrder));
}

export async function getAllProgramPoints(): Promise<ProgramPoint[]> {
  const db = await getDb();
  if (!db) return local.localGetAllProgramPoints();
  return db.select().from(programPoints).orderBy(asc(programPoints.sortOrder));
}

export async function createProgramPoint(data: InsertProgramPoint): Promise<void> {
  const db = await getDb();
  if (!db) { local.localCreateProgramPoint(data); return; }
  await db.insert(programPoints).values(data);
}

export async function updateProgramPoint(id: number, data: Partial<InsertProgramPoint>): Promise<void> {
  const db = await getDb();
  if (!db) { local.localUpdateProgramPoint(id, data); return; }
  await db.update(programPoints).set(data).where(eq(programPoints.id, id));
}

export async function deleteProgramPoint(id: number): Promise<void> {
  const db = await getDb();
  if (!db) { local.localDeleteProgramPoint(id); return; }
  await db.delete(programPoints).where(eq(programPoints.id, id));
}

// ─── SOCIAL SHARES ───────────────────────────────────────────────────────────

export async function getPublishedSocialShares(): Promise<SocialShare[]> {
  const db = await getDb();
  if (!db) return local.localGetPublishedSocialShares();
  return db.select().from(socialShares).where(eq(socialShares.isPublished, true)).orderBy(asc(socialShares.sortOrder));
}

export async function getAllSocialShares(): Promise<SocialShare[]> {
  const db = await getDb();
  if (!db) return local.localGetAllSocialShares();
  return db.select().from(socialShares).orderBy(asc(socialShares.sortOrder));
}

export async function createSocialShare(data: InsertSocialShare): Promise<void> {
  const db = await getDb();
  if (!db) { local.localCreateSocialShare(data); return; }
  await db.insert(socialShares).values(data);
}

export async function updateSocialShare(id: number, data: Partial<InsertSocialShare>): Promise<void> {
  const db = await getDb();
  if (!db) { local.localUpdateSocialShare(id, data); return; }
  await db.update(socialShares).set(data).where(eq(socialShares.id, id));
}

export async function deleteSocialShare(id: number): Promise<void> {
  const db = await getDb();
  if (!db) { local.localDeleteSocialShare(id); return; }
  await db.delete(socialShares).where(eq(socialShares.id, id));
}

// ─── SUPPORT SUBMISSIONS ─────────────────────────────────────────────────────

export async function createSupportSubmission(data: InsertSupportSubmission): Promise<void> {
  const db = await getDb();
  if (!db) { local.localCreateSupportSubmission(data); return; }
  await db.insert(supportSubmissions).values(data);
}

export async function getAllSupportSubmissions(): Promise<SupportSubmission[]> {
  const db = await getDb();
  if (!db) return local.localGetAllSupportSubmissions();
  return db.select().from(supportSubmissions).orderBy(asc(supportSubmissions.createdAt));
}
