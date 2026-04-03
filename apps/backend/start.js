/**
 * Entry point that loads environment variables before importing server.js
 * This ensures dotenv runs before any module reads process.env
 *
 * Uses dynamic import() to guarantee dotenv runs first, since ESM
 * hoists all import declarations and evaluates them before any top-level code.
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, ".env.local");
const envPathParent = join(__dirname, "..", ".env.local");
const resolvedEnvPath = fs.existsSync(envPath) ? envPath : envPathParent;
dotenv.config({ path: resolvedEnvPath });

// Import server module and start the server
import("./server.js")
  .then(({ startServer }) => {
    if (startServer) {
      startServer();
    }
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
