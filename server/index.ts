import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { assertAuthSecrets } from "./auth.js";
import { initDb } from "./db.js";
import { inativarHorasExtraExpiradas } from "./heExpiry.js";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3001);
const isProd = process.env.NODE_ENV === "production";

assertAuthSecrets();
initDb();
const heExpiradas = inativarHorasExtraExpiradas(undefined, true);
if (heExpiradas > 0) {
  console.log(`HEs expiradas inativadas automaticamente: ${heExpiradas}`);
}

const app = createApp();

if (isProd) {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`API QuadroHE em http://localhost:${port}`);
});
