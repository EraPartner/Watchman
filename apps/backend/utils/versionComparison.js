/**
 * Utility functions for robust version comparison
 */

/**
 * Clean and normalize a version string
 * Handles various formats: v1.2.3, 1.2.3, /Satoshi:27.0.0/, Tor 0.4.8.10, etc.
 * @param {string} versionString - Raw version string
 * @returns {string} Cleaned version string
 */
export function cleanVersionString(versionString) {
  if (!versionString || typeof versionString !== "string") {
    return "";
  }

  // Remove common prefixes and wrappers
  let cleaned = versionString
    .replace(/^v/i, "") // Remove leading 'v' or 'V'
    .replace(/^\/Satoshi:/, "") // Bitcoin format
    .replace(/\/$/, "") // Trailing slash
    .replace(/^Tor\s+/i, "") // Tor prefix
    .replace(/\s*\(.*?\)\s*/g, "") // Remove parenthetical info
    .trim();

  // Extract just the version number (major.minor.patch.build)
  const match = cleaned.match(/(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/);
  if (match) {
    const parts = [match[1], match[2], match[3]];
    if (match[4]) parts.push(match[4]); // Include build number if present
    return parts.join(".");
  }

  return cleaned;
}

/**
 * Parse a version string into components
 * @param {string} versionString - Version string (should be pre-cleaned)
 * @returns {Object|null} Version components or null if invalid
 */
export function parseVersion(versionString) {
  if (!versionString || typeof versionString !== "string") {
    return null;
  }

  const cleaned = cleanVersionString(versionString);
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/);

  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    build: match[4] ? parseInt(match[4], 10) : 0,
    original: versionString,
    cleaned: cleaned,
  };
}

/**
 * Check if a version string contains pre-release identifiers
 * @param {string} versionString - Version string to check
 * @returns {boolean} True if this is a pre-release version
 */
export function isPreRelease(versionString) {
  if (!versionString || typeof versionString !== "string") {
    return false;
  }

  const preReleasePattern = /(alpha|beta|rc|preview|pre|dev|snapshot|test)/i;
  return preReleasePattern.test(versionString);
}

/**
 * Compare two version strings
 * @param {string} version1 - First version
 * @param {string} version2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2, null if can't compare
 */
export function compareVersions(version1, version2) {
  const v1 = parseVersion(version1);
  const v2 = parseVersion(version2);

  if (!v1 || !v2) {
    return null;
  }

  // Compare major version
  if (v1.major !== v2.major) {
    return v1.major > v2.major ? 1 : -1;
  }

  // Compare minor version
  if (v1.minor !== v2.minor) {
    return v1.minor > v2.minor ? 1 : -1;
  }

  // Compare patch version
  if (v1.patch !== v2.patch) {
    return v1.patch > v2.patch ? 1 : -1;
  }

  // Compare build version (if both have it)
  if (v1.build !== v2.build) {
    return v1.build > v2.build ? 1 : -1;
  }

  return 0; // Equal
}

/**
 * Check if an update is available
 * @param {string} currentVersion - Current installed version
 * @param {string} latestVersion - Latest available version
 * @param {Object} options - Options for comparison
 * @param {boolean} options.includePreRelease - Include pre-release versions (default: false)
 * @returns {boolean} True if update is available
 */
export function isUpdateAvailable(currentVersion, latestVersion, options = {}) {
  const { includePreRelease = false } = options;

  // Filter out pre-release versions unless explicitly included
  if (!includePreRelease && isPreRelease(latestVersion)) {
    return false;
  }

  const comparison = compareVersions(currentVersion, latestVersion);

  // If we can't compare, assume no update
  if (comparison === null) {
    return false;
  }

  // Update available if latest > current (comparison < 0 means current < latest)
  return comparison < 0;
}

/**
 * Format version info for API response
 * @param {string} currentVersion - Current version
 * @param {string} latestVersion - Latest version
 * @param {Object} additionalInfo - Additional info to include
 * @returns {Object} Formatted response object
 */
export function formatVersionResponse(
  currentVersion,
  latestVersion,
  additionalInfo = {}
) {
  const current = cleanVersionString(currentVersion);
  const latest = cleanVersionString(latestVersion);

  return {
    currentVersion: current || "unknown",
    latestVersion: latest || "unknown",
    updateAvailable: isUpdateAvailable(current, latest),
    ...additionalInfo,
  };
}

/**
 * Get version from GitHub release tag
 * Handles various tag formats: v1.2.3, 1.2.3, release-1.2.3, etc.
 * @param {string} tagName - GitHub release tag name
 * @returns {string} Cleaned version string
 */
export function getVersionFromGitHubTag(tagName) {
  if (!tagName || typeof tagName !== "string") {
    return "";
  }

  // Remove common GitHub tag prefixes
  return tagName
    .replace(/^v/i, "")
    .replace(/^release[-_]/i, "")
    .replace(/^version[-_]/i, "")
    .trim();
}
