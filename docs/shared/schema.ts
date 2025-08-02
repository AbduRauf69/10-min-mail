import { z } from "zod";

export const emailSessionSchema = z.object({
  id: z.string(),
  email: z.string(),
  expiresAt: z.date(),
  createdAt: z.date(),
});

export const messageSchema = z.object({
  id: z.string(),
  emailSessionId: z.string(),
  from: z.string(),
  subject: z.string(),
  textBody: z.string(),
  htmlBody: z.string().optional(),
  receivedAt: z.date(),
});

export const insertEmailSessionSchema = emailSessionSchema.omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = messageSchema.omit({
  id: true,
  receivedAt: true,
});

export type EmailSession = z.infer<typeof emailSessionSchema>;
export type Message = z.infer<typeof messageSchema>;
export type InsertEmailSession = z.infer<typeof insertEmailSessionSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
