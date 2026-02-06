// Command sanitization and validation for SSH/exec commands
// Prevents command injection attacks

const ALLOWED_COMMANDS = new Set([
  "uptime",
  "df",
  "free",
  "top",
  "ps",
  "systemctl",
  "service",
  "netstat",
  "ss",
  "lsof",
  "iostat",
  "vmstat",
  "sar",
  "uname",
  "hostname",
  "who",
  "w",
  "last",
]);

// Dangerous characters that could be used for command injection
const DANGEROUS_CHARS = new RegExp("[;&|`$(){}\\[\\]<>\\'\"\\n\\r]");

// Whitelist approach - only allow specific safe patterns
const SAFE_ARGUMENT_PATTERN = /^[a-zA-Z0-9_\-./=:@]+$/;

/**
 * Validates a command is safe to execute
 * @param {string} command - The command to validate
 * @returns {Object} { valid: boolean, error?: string, sanitized?: string }
 */
export function validateCommand(command) {
  if (!command || typeof command !== "string") {
    return { valid: false, error: "Command must be a non-empty string" };
  }

  const trimmed = command.trim();

  // Check for dangerous characters
  if (DANGEROUS_CHARS.test(trimmed)) {
    return {
      valid: false,
      error: "Command contains potentially dangerous characters",
    };
  }

  // Parse command and arguments
  const parts = trimmed.split(/\s+/);
  const baseCommand = parts[0];
  const args = parts.slice(1);

  // Check if base command is in whitelist
  if (!ALLOWED_COMMANDS.has(baseCommand)) {
    return {
      valid: false,
      error: `Command '${baseCommand}' is not in the allowed list`,
    };
  }

  // Validate all arguments match safe pattern
  for (const arg of args) {
    if (!SAFE_ARGUMENT_PATTERN.test(arg)) {
      return {
        valid: false,
        error: `Argument '${arg}' contains invalid characters`,
      };
    }
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Sanitizes command arguments by escaping dangerous characters
 * Use this for known-safe commands where you need more flexibility
 * @param {string} arg - Argument to sanitize
 * @returns {string} Sanitized argument
 */
export function sanitizeArgument(arg) {
  if (typeof arg !== "string") {
    throw new Error("Argument must be a string");
  }

  // Use single quotes and escape any single quotes in the argument
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Builds a safe command with validated base command and sanitized arguments
 * @param {string} baseCommand - The base command (must be whitelisted)
 * @param {string[]} args - Arguments to append
 * @returns {string} Safe command string
 */
export function buildSafeCommand(baseCommand, args = []) {
  if (!ALLOWED_COMMANDS.has(baseCommand)) {
    throw new Error(`Command '${baseCommand}' is not allowed`);
  }

  if (!Array.isArray(args)) {
    throw new Error("Arguments must be an array");
  }

  const sanitizedArgs = args.map((arg) => sanitizeArgument(String(arg)));
  return [baseCommand, ...sanitizedArgs].join(" ");
}

/**
 * Add a command to the whitelist (use carefully in controlled environments)
 * @param {string} command - Command to whitelist
 */
export function whitelistCommand(command) {
  if (typeof command === "string" && command.length > 0) {
    ALLOWED_COMMANDS.add(command);
  }
}

/**
 * Get list of allowed commands
 * @returns {string[]} Array of allowed commands
 */
export function getAllowedCommands() {
  return Array.from(ALLOWED_COMMANDS);
}

export default {
  validateCommand,
  sanitizeArgument,
  buildSafeCommand,
  whitelistCommand,
  getAllowedCommands,
};
