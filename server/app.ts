import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth.js";
import { apiRouter } from "./routes/api.js";
import { usuariosRouter } from "./routes/usuarios.js";

export function createApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";

  app.disable("x-powered-by");

  if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "base-uri": ["'self'"],
          "form-action": ["'self'"],
          "object-src": ["'none'"],
          "frame-ancestors": ["'none'"],
          "img-src": ["'self'", "data:", "blob:"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "script-src": isProd
            ? ["'self'"]
            : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          "connect-src": isProd
            ? ["'self'"]
            : [
                "'self'",
                "ws://localhost:5173",
                "http://localhost:5173",
                "ws://127.0.0.1:5173",
                "http://127.0.0.1:5173",
              ],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "no-referrer" },
      hsts: isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
    }),
  );
  app.use(
    cors({
      origin: isProd
        ? false
        : ["http://localhost:5173", "http://127.0.0.1:5173"],
    }),
  );
  app.use((req, res, next) => {
    const incoming = String(req.headers["x-request-id"] ?? "").trim();
    req.requestId = /^[\w-]{8,128}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  app.use(express.json({ limit: "15mb" }));

  if (!isTest) {
    app.use(
      "/api",
      rateLimit({
        windowMs: 60_000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Muitas requisições. Tente novamente em instantes." },
      }),
    );
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/usuarios", usuariosRouter);
  app.use("/api", apiRouter);

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      if (!isTest) console.error(err);
      if (res.headersSent) return;
      res.status(500).json({ error: "Erro interno" });
    },
  );

  return app;
}
