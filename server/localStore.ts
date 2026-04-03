/**
 * Fallback JSON-file store used when DATABASE_URL is not configured.
 * Persists data to ./local-db.json in the project root.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type {
  AgendaEvent,
  InsertAgendaEvent,
  ProgramPoint,
  InsertProgramPoint,
  SocialShare,
  InsertSocialShare,
  SupportSubmission,
  InsertSupportSubmission,
} from "../drizzle/schema";

const DB_PATH = join(process.cwd(), "local-db.json");

type LocalDB = {
  agendaEvents: AgendaEvent[];
  programPoints: ProgramPoint[];
  socialShares: SocialShare[];
  supportSubmissions: SupportSubmission[];
  settings: { comingSoon: boolean };
  _nextId: Record<string, number>;
};

const EMPTY: LocalDB = {
  agendaEvents: [],
  programPoints: [],
  socialShares: [],
  supportSubmissions: [],
  settings: { comingSoon: false },
  _nextId: { agendaEvents: 1, programPoints: 1, socialShares: 1, supportSubmissions: 1 },
};

function load(): LocalDB {
  if (!existsSync(DB_PATH)) return JSON.parse(JSON.stringify(EMPTY));
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf-8")) as LocalDB;
  } catch {
    return JSON.parse(JSON.stringify(EMPTY));
  }
}

function save(db: LocalDB) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function d(v: unknown): Date {
  if (v instanceof Date) return v;
  return new Date(v as string | number);
}

function hydrateEvent(e: AgendaEvent): AgendaEvent {
  return { ...e, date: d(e.date), createdAt: d(e.createdAt), updatedAt: d(e.updatedAt) };
}
function hydratePoint(p: ProgramPoint): ProgramPoint {
  return { ...p, createdAt: d(p.createdAt), updatedAt: d(p.updatedAt) };
}
function hydrateShare(s: SocialShare): SocialShare {
  return { ...s, createdAt: d(s.createdAt), updatedAt: d(s.updatedAt) };
}
function hydrateSubmission(s: SupportSubmission): SupportSubmission {
  return { ...s, createdAt: d(s.createdAt) };
}

// ─── AGENDA EVENTS ───────────────────────────────────────────────────────────

export function localGetAllAgendaEvents(): AgendaEvent[] {
  const db = load();
  return db.agendaEvents.map(hydrateEvent).sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function localGetPublishedAgendaEvents(): AgendaEvent[] {
  return localGetAllAgendaEvents().filter(e => e.isPublished);
}

export function localCreateAgendaEvent(data: InsertAgendaEvent): void {
  const db = load();
  const now = new Date();
  const id = db._nextId.agendaEvents++;
  db.agendaEvents.push({
    id,
    title: data.title,
    description: data.description ?? null,
    category: data.category ?? "Réunion",
    date: new Date(data.date as Date),
    time: data.time ?? "19h00",
    location: data.location ?? null,
    isPublished: data.isPublished ?? true,
    sortOrder: data.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  });
  save(db);
}

export function localUpdateAgendaEvent(id: number, data: Partial<InsertAgendaEvent>): void {
  const db = load();
  const idx = db.agendaEvents.findIndex(e => e.id === id);
  if (idx !== -1) {
    db.agendaEvents[idx] = { ...db.agendaEvents[idx], ...data, id, updatedAt: new Date() } as AgendaEvent;
    save(db);
  }
}

export function localDeleteAgendaEvent(id: number): void {
  const db = load();
  db.agendaEvents = db.agendaEvents.filter(e => e.id !== id);
  save(db);
}

// ─── PROGRAM POINTS ──────────────────────────────────────────────────────────

export function localGetAllProgramPoints(): ProgramPoint[] {
  const db = load();
  return db.programPoints.map(hydratePoint).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function localGetPublishedProgramPoints(): ProgramPoint[] {
  return localGetAllProgramPoints().filter(p => p.isPublished);
}

export function localCreateProgramPoint(data: InsertProgramPoint): void {
  const db = load();
  const now = new Date();
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
    updatedAt: now,
  });
  save(db);
}

export function localUpdateProgramPoint(id: number, data: Partial<InsertProgramPoint>): void {
  const db = load();
  const idx = db.programPoints.findIndex(p => p.id === id);
  if (idx !== -1) {
    db.programPoints[idx] = { ...db.programPoints[idx], ...data, id, updatedAt: new Date() } as ProgramPoint;
    save(db);
  }
}

export function localDeleteProgramPoint(id: number): void {
  const db = load();
  db.programPoints = db.programPoints.filter(p => p.id !== id);
  save(db);
}

// ─── SOCIAL SHARES ───────────────────────────────────────────────────────────

export function localGetAllSocialShares(): SocialShare[] {
  const db = load();
  return db.socialShares.map(hydrateShare).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function localGetPublishedSocialShares(): SocialShare[] {
  return localGetAllSocialShares().filter(s => s.isPublished);
}

export function localCreateSocialShare(data: InsertSocialShare): void {
  const db = load();
  const now = new Date();
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
    updatedAt: now,
  });
  save(db);
}

export function localUpdateSocialShare(id: number, data: Partial<InsertSocialShare>): void {
  const db = load();
  const idx = db.socialShares.findIndex(s => s.id === id);
  if (idx !== -1) {
    db.socialShares[idx] = { ...db.socialShares[idx], ...data, id, updatedAt: new Date() } as SocialShare;
    save(db);
  }
}

export function localDeleteSocialShare(id: number): void {
  const db = load();
  db.socialShares = db.socialShares.filter(s => s.id !== id);
  save(db);
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

export function getComingSoon(): boolean {
  const db = load();
  return db.settings?.comingSoon ?? false;
}

export function setComingSoon(enabled: boolean): void {
  const db = load();
  if (!db.settings) db.settings = { comingSoon: false };
  db.settings.comingSoon = enabled;
  save(db);
}

// ─── SUPPORT SUBMISSIONS ─────────────────────────────────────────────────────

export function localGetAllSupportSubmissions(): SupportSubmission[] {
  const db = load();
  return db.supportSubmissions.map(hydrateSubmission).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function localCreateSupportSubmission(data: InsertSupportSubmission): void {
  const db = load();
  const now = new Date();
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
    createdAt: now,
  });
  save(db);
}
