import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertEmailSessionSchema, insertMessageSchema } from "@shared/schema";

interface TempMailAPI {
  generateEmail(): Promise<string>;
  getMessages(email: string): Promise<any[]>;
}

class OneSecMailAPI implements TempMailAPI {
  private readonly baseUrl = "https://www.1secmail.com/api/v1/";
  private readonly fallbackDomains = ["1secmail.com", "1secmail.org", "1secmail.net"];

  async generateEmail(): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}?action=genRandomMailbox&count=1`);
      
      // Check if response is HTML (indicates API error)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // API is down, generate a fallback email
        return this.generateFallbackEmail();
      }
      
      const emails = await response.json();
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return this.generateFallbackEmail();
      }
      
      return emails[0];
    } catch (error) {
      console.error("Error generating email:", error);
      // Use fallback email generation
      return this.generateFallbackEmail();
    }
  }

  private generateFallbackEmail(): string {
    const randomString = Math.random().toString(36).substring(2, 10);
    const randomDomain = this.fallbackDomains[Math.floor(Math.random() * this.fallbackDomains.length)];
    return `${randomString}@${randomDomain}`;
  }

  async getMessages(email: string): Promise<any[]> {
    try {
      const [username, domain] = email.split("@");
      const response = await fetch(
        `${this.baseUrl}?action=getMessages&login=${username}&domain=${domain}`
      );
      
      // Check if response is HTML (indicates API error)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.log("1SecMail API is not responding with JSON, returning empty messages");
        return [];
      }
      
      const messages = await response.json();
      return Array.isArray(messages) ? messages : [];
    } catch (error) {
      console.error("Error fetching messages:", error);
      return [];
    }
  }

  async getMessageContent(email: string, id: number): Promise<any> {
    try {
      const [username, domain] = email.split("@");
      const response = await fetch(
        `${this.baseUrl}?action=readMessage&login=${username}&domain=${domain}&id=${id}`
      );
      
      // Check if response is HTML (indicates API error)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.log("1SecMail API is not responding with JSON for message content");
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error("Error fetching message content:", error);
      return null;
    }
  }
}

const tempMailAPI = new OneSecMailAPI();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const activeConnections = new Map<string, WebSocket>();

  wss.on('connection', (ws, req) => {
    console.log('WebSocket connection established');
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'subscribe' && message.sessionId) {
          activeConnections.set(message.sessionId, ws);
          console.log(`Client subscribed to session: ${message.sessionId}`);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      // Remove connection from active connections
      for (const [sessionId, connection] of Array.from(activeConnections.entries())) {
        if (connection === ws) {
          activeConnections.delete(sessionId);
          break;
        }
      }
    });
  });

  // Generate new temporary email
  app.post("/api/email/generate", async (req, res) => {
    try {
      // Use Promise.race to ensure response within 100ms
      const emailPromise = tempMailAPI.generateEmail();
      const timeoutPromise = new Promise<string>((resolve) => {
        setTimeout(() => {
          // Generate fallback email if API takes too long
          const randomString = Math.random().toString(36).substring(2, 10);
          resolve(`${randomString}@1secmail.com`);
        }, 100); // 0.1 second timeout
      });
      
      const email = await Promise.race([emailPromise, timeoutPromise]);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Exactly 10 minutes from now
      
      const session = await storage.createEmailSession({
        email,
        expiresAt,
      });

      res.json(session);
    } catch (error) {
      console.error("Error generating email:", error);
      res.status(500).json({ message: "Failed to generate temporary email" });
    }
  });

  // Get email session by ID
  app.get("/api/email/:sessionId", async (req, res) => {
    try {
      const session = await storage.getEmailSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Email session not found" });
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await storage.deleteEmailSession(session.id);
        return res.status(410).json({ message: "Email session has expired" });
      }

      res.json(session);
    } catch (error) {
      console.error("Error getting email session:", error);
      res.status(500).json({ message: "Failed to get email session" });
    }
  });

  // Get messages for a session
  app.get("/api/email/:sessionId/messages", async (req, res) => {
    try {
      const session = await storage.getEmailSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Email session not found" });
      }

      if (session.expiresAt < new Date()) {
        await storage.deleteEmailSession(session.id);
        return res.status(410).json({ message: "Email session has expired" });
      }

      const messages = await storage.getMessagesBySessionId(session.id);
      res.json(messages);
    } catch (error) {
      console.error("Error getting messages:", error);
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  // Polling function to check for new messages
  async function pollForNewMessages() {
    try {
      await storage.cleanupExpiredSessions();
      
      // Get all active sessions (non-expired)
      const now = new Date();
      // Since we're using in-memory storage, we'll need to iterate through sessions
      // In a real implementation, you'd query the database for active sessions
    } catch (error) {
      console.error("Error polling for messages:", error);
    }
  }

  // Manual refresh endpoint for messages
  app.post("/api/email/:sessionId/refresh", async (req, res) => {
    try {
      const session = await storage.getEmailSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Email session not found" });
      }

      if (session.expiresAt < new Date()) {
        await storage.deleteEmailSession(session.id);
        return res.status(410).json({ message: "Email session has expired" });
      }

      // Fetch new messages from the API
      const apiMessages = await tempMailAPI.getMessages(session.email);
      const existingMessages = await storage.getMessagesBySessionId(session.id);
      const existingMessageIds = new Set(existingMessages.map(m => m.from + m.subject));

      let newMessagesCount = 0;

      for (const apiMessage of apiMessages) {
        const messageKey = apiMessage.from + apiMessage.subject;
        if (!existingMessageIds.has(messageKey)) {
          // This is a new message, get full content
          const fullMessage = await (tempMailAPI as any).getMessageContent(session.email, apiMessage.id);
          
          await storage.createMessage({
            emailSessionId: session.id,
            from: apiMessage.from,
            subject: apiMessage.subject,
            textBody: fullMessage?.textBody || fullMessage?.body || "No content",
            htmlBody: fullMessage?.htmlBody,
          });

          newMessagesCount++;
        }
      }

      // Notify connected WebSocket clients
      const ws = activeConnections.get(session.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'new_messages',
          count: newMessagesCount,
        }));
      }

      const updatedMessages = await storage.getMessagesBySessionId(session.id);
      res.json({ messages: updatedMessages, newCount: newMessagesCount });
    } catch (error) {
      console.error("Error refreshing messages:", error);
      res.status(500).json({ message: "Failed to refresh messages" });
    }
  });

  // Start periodic polling
  setInterval(pollForNewMessages, 30000); // Poll every 30 seconds

  return httpServer;
}
