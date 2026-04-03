import { z } from "zod";
import { scryptSync, timingSafeEqual } from "crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import * as local from "./localStore";
import {
  getAllAgendaEvents,
  getPublishedAgendaEvents,
  createAgendaEvent,
  updateAgendaEvent,
  deleteAgendaEvent,
  getAllProgramPoints,
  getPublishedProgramPoints,
  createProgramPoint,
  updateProgramPoint,
  deleteProgramPoint,
  getAllSocialShares,
  getPublishedSocialShares,
  createSocialShare,
  updateSocialShare,
  deleteSocialShare,
  createSupportSubmission,
  getAllSupportSubmissions,
} from "./db";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    adminLogin: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!ENV.adminEmail || !ENV.adminPasswordHash) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Admin non configuré." });
        }
        if (input.email.toLowerCase() !== ENV.adminEmail.toLowerCase()) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou mot de passe incorrect." });
        }
        const [salt, storedHash] = ENV.adminPasswordHash.split(":");
        if (!salt || !storedHash) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hash invalide." });
        }
        const inputHash = scryptSync(input.password, salt, 64);
        const storedHashBuf = Buffer.from(storedHash, "hex");
        const match = inputHash.length === storedHashBuf.length &&
          timingSafeEqual(inputHash, storedHashBuf);
        if (!match) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou mot de passe incorrect." });
        }
        const token = await sdk.signSession(
          { openId: "admin-local", appId: "local", name: "Admin" },
          { expiresInMs: 7 * 24 * 60 * 60 * 1000 }
        );
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
        return { success: true } as const;
      }),
  }),

  agenda: router({
    list: publicProcedure.query(() => getPublishedAgendaEvents()),
    listAll: adminProcedure.query(() => getAllAgendaEvents()),
    create: adminProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        category: z.string().default("Réunion"),
        date: z.date(),
        time: z.string().default("19h00"),
        location: z.string().optional(),
        isPublished: z.boolean().default(true),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ input }) => { await createAgendaEvent(input); return { success: true }; }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        date: z.date().optional(),
        time: z.string().optional(),
        location: z.string().optional(),
        isPublished: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateAgendaEvent(id, data); return { success: true }; }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteAgendaEvent(input.id); return { success: true }; }),
    seedDefaults: adminProcedure.mutation(async () => {
      const existing = await getAllAgendaEvents();
      if (existing.length > 0) return { seeded: false };
      const defaults = [
        { title: "Réunion de section — Ixelles", description: "Présentation de la candidature et échanges avec les militants de la section d'Ixelles.", category: "Réunion", date: new Date("2026-04-12"), time: "19h30", location: "Maison du Peuple, Ixelles", isPublished: true, sortOrder: 0 },
        { title: "Conférence de presse MR Bruxelles", description: "Annonce officielle de la candidature à la présidence de la Régionale MR Bruxelles & Périphérie.", category: "Presse", date: new Date("2026-04-18"), time: "18h00", location: "Parlement bruxellois", isPublished: true, sortOrder: 1 },
        { title: "Assemblée générale — Bruxelles-Ville", description: "Assemblée générale des membres MR de la section Bruxelles-Ville. Présentation du programme.", category: "Assemblée", date: new Date("2026-04-25"), time: "20h00", location: "Hôtel de Ville de Bruxelles", isPublished: true, sortOrder: 2 },
        { title: "Porte-à-porte — Schaerbeek", description: "Action de terrain dans les rues de Schaerbeek pour rencontrer directement les citoyens.", category: "Terrain", date: new Date("2026-05-02"), time: "10h00", location: "Schaerbeek", isPublished: true, sortOrder: 3 },
        { title: "Forum libéral — Périphérie", description: "Forum de discussion sur les enjeux de la périphérie bruxelloise avec les sections concernées.", category: "Forum", date: new Date("2026-05-10"), time: "14h00", location: "Waterloo", isPublished: true, sortOrder: 4 },
        { title: "Réunion de section — Etterbeek", description: "Rencontre avec les militants d'Etterbeek et présentation des outils de campagne.", category: "Réunion", date: new Date("2026-05-17"), time: "19h00", location: "Etterbeek", isPublished: true, sortOrder: 5 },
      ];
      for (const ev of defaults) await createAgendaEvent(ev);
      return { seeded: true };
    }),
  }),

  programme: router({
    list: publicProcedure.query(() => getPublishedProgramPoints()),
    listAll: adminProcedure.query(() => getAllProgramPoints()),
    create: adminProcedure
      .input(z.object({
        number: z.string().min(1).max(4),
        title: z.string().min(1),
        subtitle: z.string().optional(),
        frontText: z.string().min(1),
        backText: z.string().min(1),
        isPublished: z.boolean().default(true),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ input }) => { await createProgramPoint(input); return { success: true }; }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        number: z.string().min(1).max(4).optional(),
        title: z.string().min(1).optional(),
        subtitle: z.string().optional(),
        frontText: z.string().optional(),
        backText: z.string().optional(),
        isPublished: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateProgramPoint(id, data); return { success: true }; }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteProgramPoint(input.id); return { success: true }; }),
    seedDefaults: adminProcedure.mutation(async () => {
      const existing = await getAllProgramPoints();
      if (existing.length > 0) return { seeded: false };
      const defaults = [
        { number: "01", title: "Rassembler et mobiliser", subtitle: "Rencontres & intégration", frontText: "Mettre en place des rencontres régulières entre sections, créer des moments d'échange concrets entre élus et militants, et mieux intégrer les nouveaux membres.", backText: "Des rencontres régulières entre sections, des moments d'échange concrets entre élus et militants, et une meilleure intégration des nouveaux membres pour renforcer notre dynamique collective.", isPublished: true, sortOrder: 0 },
        { number: "02", title: "Soutenir nos sections et nos élus", subtitle: "Outils & formations", frontText: "Déployer une boîte à outils commune, proposer des formations pratiques et assurer un relais rapide des informations utiles.", backText: "Boîte à outils commune (modèles de tracts, visuels, argumentaires), formations pratiques (communication, réseaux sociaux, campagne) et relais rapide des informations utiles entre la Régionale et les sections.", isPublished: true, sortOrder: 1 },
        { number: "03", title: "Structurer notre organisation", subtitle: "Coordination & efficacité", frontText: "Mettre en place une coordination claire entre la Régionale, les sections et les élus, et créer des référents par thématique.", backText: "Coordination claire entre la Régionale, les sections et les élus, amélioration de la circulation de l'information et référents par thématique pour gagner en efficacité.", isPublished: true, sortOrder: 2 },
        { number: "04", title: "Préparer les prochaines élections", subtitle: "Talents & stratégie terrain", frontText: "Identifier dès maintenant les talents dans chaque commune, accompagner les futurs candidats et construire une stratégie cohérente.", backText: "Identification des talents dans chaque commune, accompagnement des futurs candidats, et construction d'une stratégie cohérente avec un outil de porte-à-porte pour renforcer notre présence sur le terrain.", isPublished: true, sortOrder: 3 },
        { number: "05", title: "Porter une voix libérale forte", subtitle: "Bruxelles & nos priorités", frontText: "Coordonner nos prises de position, soutenir des initiatives communes et faire entendre nos priorités sur la sécurité, la propreté et l'attractivité de Bruxelles.", backText: "Coordination de nos prises de position, soutien d'initiatives communes et voix claire sur les enjeux essentiels : sécurité, propreté et attractivité de Bruxelles.", isPublished: true, sortOrder: 4 },
      ];
      for (const point of defaults) await createProgramPoint(point);
      return { seeded: true };
    }),
  }),

  social: router({
    list: publicProcedure.query(() => getPublishedSocialShares()),
    listAll: adminProcedure.query(() => getAllSocialShares()),
    create: adminProcedure
      .input(z.object({
        title: z.string().min(1),
        imageUrl: z.string().url(),
        textFacebook: z.string().min(1),
        textX: z.string().min(1),
        textLinkedin: z.string().min(1),
        hashtags: z.string().optional(),
        isPublished: z.boolean().default(true),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ input }) => { await createSocialShare(input); return { success: true }; }),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).optional(),
        imageUrl: z.string().url().optional(),
        textFacebook: z.string().optional(),
        textX: z.string().optional(),
        textLinkedin: z.string().optional(),
        hashtags: z.string().optional(),
        isPublished: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await updateSocialShare(id, data); return { success: true }; }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => { await deleteSocialShare(input.id); return { success: true }; }),
    uploadImage: adminProcedure
      .input(z.object({ base64: z.string(), mimeType: z.string(), filename: z.string() }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const key = `social-shares/${nanoid()}-${input.filename}`;
        const { url } = await storagePut(key, buffer, input.mimeType);
        return { url };
      }),
    seedDefaults: adminProcedure.mutation(async () => {
      const existing = await getAllSocialShares();
      if (existing.length > 0) return { seeded: false };
      const defaults = [
        { title: "Bruxelles mérite mieux", imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310419663028295284/eQN5TVRfGQX3c6wB6iBFWy/hero_background-E5RRoczDKc6EpwTeUk9kpx.webp", textFacebook: "🔵 Bruxelles mérite un MR fort, rassemblé et ambitieux. Je suis candidat à la présidence de la Régionale MR Bruxelles & Périphérie. Ensemble, préparons nos prochaines victoires ! #MR #Bruxelles #Geoffroy", textX: "🔵 Bruxelles mérite mieux. Je suis candidat à la présidence du MR Bruxelles & Périphérie. Rejoignez le mouvement ! #MR #Bruxelles", textLinkedin: "Je suis candidat à la présidence de la Régionale MR Bruxelles & Périphérie. Fort de 26 ans d'engagement politique, je veux rassembler notre mouvement et préparer nos victoires futures. #MR #Bruxelles #Politique", hashtags: "#MR #Bruxelles #Geoffroy", isPublished: true, sortOrder: 0 },
        { title: "26 ans d'engagement", imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310419663028295284/eQN5TVRfGQX3c6wB6iBFWy/programme_bg-Kpf8aa92D6zuYveh9KJiep.webp", textFacebook: "26 ans au service de Bruxelles. Conseiller communal, Échevin, Président de l'Atomium, Député bruxellois. Ce parcours m'a forgé pour diriger le MR Bruxelles avec ambition et proximité. #MR #Engagement", textX: "26 ans au service de Bruxelles. Ce parcours m'a forgé pour diriger le MR avec ambition. #MR #Bruxelles #Engagement", textLinkedin: "Un parcours de 26 ans au service de Bruxelles : Conseiller communal, Échevin, Président de l'Atomium, Député bruxellois. Cette expérience est ma force pour présider le MR Bruxelles & Périphérie.", hashtags: "#MR #Engagement #Bruxelles", isPublished: true, sortOrder: 1 },
        { title: "Rejoignez le mouvement", imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310419663028295284/eQN5TVRfGQX3c6wB6iBFWy/hero_background-E5RRoczDKc6EpwTeUk9kpx.webp", textFacebook: "Rejoignez notre mouvement ! Ensemble, nous pouvons bâtir un MR Bruxelles plus fort, plus présent et plus ambitieux. Soutenez ma candidature à la présidence de la Régionale. #MR #Bruxelles #Soutien", textX: "Rejoignez notre mouvement ! Soutenez ma candidature à la présidence du MR Bruxelles. #MR #Soutien", textLinkedin: "Je compte sur vous pour rejoindre notre mouvement libéral à Bruxelles. Votre soutien est précieux pour bâtir ensemble un MR fort et ambitieux. #MR #Liberalisme #Bruxelles", hashtags: "#MR #Soutien #Bruxelles", isPublished: true, sortOrder: 2 },
      ];
      for (const share of defaults) await createSocialShare(share);
      return { seeded: true };
    }),
  }),

  support: router({
    submit: publicProcedure
      .input(z.object({
        prenom: z.string().min(1),
        nom: z.string().min(1),
        email: z.string().email(),
        telephone: z.string().optional(),
        commune: z.string().min(1),
        message: z.string().optional(),
        supportType: z.string().default("contact"),
      }))
      .mutation(async ({ input }) => {
        await createSupportSubmission(input);
        await notifyOwner({
          title: `Nouveau soutien : ${input.prenom} ${input.nom}`,
          content: `Commune: ${input.commune}\nEmail: ${input.email}\nType: ${input.supportType}\nMessage: ${input.message || "—"}`,
        });
        return { success: true };
      }),
    listAll: adminProcedure.query(() => getAllSupportSubmissions()),
  }),

  settings: router({
    getComingSoon: publicProcedure.query(() => {
      return { enabled: local.getComingSoon() };
    }),
    setComingSoon: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(({ input }) => {
        local.setComingSoon(input.enabled);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
