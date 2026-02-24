import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const db = new Database("scams.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS scan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    risk_score INTEGER NOT NULL,
    risk_level TEXT NOT NULL,
    explanation TEXT NOT NULL,
    language TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/history", (req, res) => {
    const { message, riskScore, riskLevel, explanation, language } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    try {
      const stmt = db.prepare(`
        INSERT INTO scan_history (message, risk_score, risk_level, explanation, language)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(message, riskScore, riskLevel, explanation, language);
      res.json({ status: "ok" });
    } catch (error) {
      console.error("History save error:", error);
      res.status(500).json({ error: "Failed to save history" });
    }
  });

  app.get("/api/history", (req, res) => {
    const history = db.prepare("SELECT * FROM scan_history ORDER BY created_at DESC LIMIT 20").all();
    res.json(history);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
