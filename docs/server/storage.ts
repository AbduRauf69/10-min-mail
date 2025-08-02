import { type EmailSession, type Message, type InsertEmailSession, type InsertMessage } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  createEmailSession(session: InsertEmailSession): Promise<EmailSession>;
  getEmailSession(id: string): Promise<EmailSession | undefined>;
  getEmailSessionByEmail(email: string): Promise<EmailSession | undefined>;
  deleteEmailSession(id: string): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;
  
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesBySessionId(sessionId: string): Promise<Message[]>;
  deleteMessagesBySessionId(sessionId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private emailSessions: Map<string, EmailSession>;
  private messages: Map<string, Message>;

  constructor() {
    this.emailSessions = new Map();
    this.messages = new Map();
  }

  async createEmailSession(insertSession: InsertEmailSession): Promise<EmailSession> {
    const id = randomUUID();
    const session: EmailSession = {
      ...insertSession,
      id,
      createdAt: new Date(),
    };
    this.emailSessions.set(id, session);
    return session;
  }

  async getEmailSession(id: string): Promise<EmailSession | undefined> {
    return this.emailSessions.get(id);
  }

  async getEmailSessionByEmail(email: string): Promise<EmailSession | undefined> {
    return Array.from(this.emailSessions.values()).find(
      (session) => session.email === email,
    );
  }

  async deleteEmailSession(id: string): Promise<void> {
    this.emailSessions.delete(id);
    // Also delete associated messages
    await this.deleteMessagesBySessionId(id);
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    for (const [id, session] of Array.from(this.emailSessions.entries())) {
      if (session.expiresAt < now) {
        await this.deleteEmailSession(id);
      }
    }
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      receivedAt: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getMessagesBySessionId(sessionId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter((message) => message.emailSessionId === sessionId)
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  }

  async deleteMessagesBySessionId(sessionId: string): Promise<void> {
    for (const [id, message] of Array.from(this.messages.entries())) {
      if (message.emailSessionId === sessionId) {
        this.messages.delete(id);
      }
    }
  }
}

export const storage = new MemStorage();
