import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", router);

// Serve the built Vite frontend in production.
// The voice-agent build outputs to artifacts/voice-agent/dist/public/,
// which is two levels up from this bundle's __dirname (artifacts/api-server/dist/).
const frontendDist = path.join(__dirname, "../../voice-agent/dist/public");
if (fs.existsSync(frontendDist)) {
  logger.info({ frontendDist }, "Serving frontend static files");
  app.use(express.static(frontendDist));
  // SPA fallback: any non-API route returns index.html so client-side routing works
  // Express 5 requires a named wildcard — use "/{*splat}" instead of "*"
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  logger.warn({ frontendDist }, "Frontend dist not found — skipping static file serving");
}

export default app;
