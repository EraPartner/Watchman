/**
 * Ping Utility
 *
 * Single shared ping implementation used by all services that need
 * host reachability checks via ICMP. Replaces duplicated pingHost()
 * methods across RoonService, PhilipsBridgeService, MacMiniService,
 * and RaspberryPiService.
 *
 * Uses spawn with argument arrays to avoid shell injection risks.
 */

import { spawn } from "child_process";
import logger from "../middleware/logger.js";

/**
 * Execute ping with multiple strategies to handle IPv4/IPv6/platform variance.
 *
 * @param {string} host - Hostname or IP to ping
 * @param {Object} options - Ping options
 * @param {number} [options.timeout=5000] - Timeout per ping attempt in ms
 * @param {number} [options.pingCount=2] - Number of ping packets to send
 * @param {boolean} [options.logFailure=true] - Whether to log failures
 * @returns {Promise<{success: boolean, stdout?: string, stderr?: string}>}
 */
export async function pingHost(host, options = {}) {
  const { timeout = 5000, pingCount = 2, logFailure = true } = options;

  // Try multiple strategies to handle IPv4/IPv6/platform variance
  const attempts = [
    { cmd: "ping", args: ["-c", String(pingCount), "-4", host] },
    { cmd: "ping", args: ["-c", String(pingCount), host] },
    { cmd: "ping6", args: ["-c", String(pingCount), host] },
  ];

  let combinedStdout = "";
  let combinedStderr = "";

  for (const { cmd, args } of attempts) {
    try {
      const { stdout, stderr } = await _runPing(cmd, args, timeout);
      combinedStdout +=
        `\n--- cmd: ${cmd} ${args.join(" ")} ---\n` + (stdout || "");
      combinedStderr +=
        `\n--- cmd: ${cmd} ${args.join(" ")} ---\n` + (stderr || "");

      const success =
        /0% packet loss|0\.0% packet loss|0 packets lost|0 received/.test(
          stdout
        ) && !/100% packet loss/.test(stdout);

      if (success) {
        return {
          success: true,
          stdout: combinedStdout,
          stderr: combinedStderr,
        };
      }
    } catch (err) {
      const stdout = err.stdout || "";
      const stderr = err.stderr || err.message || "";
      combinedStdout +=
        `\n--- cmd error: ${cmd} ${args.join(" ")} ---\n` + stdout;
      combinedStderr +=
        `\n--- cmd error: ${cmd} ${args.join(" ")} ---\n` + stderr;
    }
  }

  if (!combinedStdout && !combinedStderr) {
    combinedStderr =
      "No ping output captured; ping may be unavailable or blocked";
  }

  if (logFailure) {
    logger.warn(`pingHost: all attempts failed for ${host}`, { host });
  }

  return { success: false, stdout: combinedStdout, stderr: combinedStderr };
}

/**
 * Run a single ping command using spawn (no shell interpolation).
 *
 * @param {string} cmd - Command name (ping or ping6)
 * @param {string[]} args - Command arguments
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function _runPing(cmd, args, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeout + 1500,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject({ stdout, stderr, code });
        return;
      }
      resolve({ stdout, stderr });
    });

    child.on("error", (err) => {
      reject({ stdout, stderr, message: err.message });
    });
  });
}
