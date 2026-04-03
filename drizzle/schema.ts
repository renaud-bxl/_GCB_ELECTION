import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Agenda de campagne — événements gérés depuis l'admin
 */
export const agendaEvents = mysqlTable("agenda_events", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }).notNull().default("Réunion"),
  date: timestamp("date").notNull(),
  time: varchar("time", { length: 10 }).notNull().default("19h00"),
  location: varchar("location", { length: 255 }),
  isPublished: boolean("isPublished").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AgendaEvent = typeof agendaEvents.$inferSelect;
export type InsertAgendaEvent = typeof agendaEvents.$inferInsert;

/**
 * Points clés du programme — gérés depuis l'admin (3 à 5 items)
 */
export const programPoints = mysqlTable("program_points", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 4 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  subtitle: varchar("subtitle", { length: 255 }),
  frontText: text("frontText").notNull(),
  backText: text("backText").notNull(),
  isPublished: boolean("isPublished").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProgramPoint = typeof programPoints.$inferSelect;
export type InsertProgramPoint = typeof programPoints.$inferInsert;

/**
 * Visuels de partage social — gérés depuis l'admin
 */
export const socialShares = mysqlTable("social_shares", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SocialShare = typeof socialShares.$inferSelect;
export type InsertSocialShare = typeof socialShares.$inferInsert;

/**
 * Soumissions du formulaire de soutien
 */
export const supportSubmissions = mysqlTable("support_submissions", {
  id: int("id").autoincrement().primaryKey(),
  prenom: varchar("prenom", { length: 100 }).notNull(),
  nom: varchar("nom", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  telephone: varchar("telephone", { length: 30 }),
  commune: varchar("commune", { length: 100 }).notNull(),
  message: text("message"),
  supportType: varchar("supportType", { length: 64 }).default("contact"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupportSubmission = typeof supportSubmissions.$inferSelect;
export type InsertSupportSubmission = typeof supportSubmissions.$inferInsert;