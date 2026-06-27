import app from "./app";
import { logger } from "./lib/logger";
import { syncInProgressCalls } from "./routes/calls";

const rawPort = process.env["PORT"] ?? "3001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Poll BlandAI every 30 seconds for any stuck in-progress calls.
  // This is the primary completion mechanism since dev webhooks are unreliable
  // (they require BlandAI to reach the Replit dev URL which can be flaky).
  setInterval(() => { syncInProgressCalls().catch(() => {}); }, 30_000);
  // Also run once immediately on startup to resolve any calls stuck from before
  setTimeout(() => { syncInProgressCalls().catch(() => {}); }, 3_000);
});
