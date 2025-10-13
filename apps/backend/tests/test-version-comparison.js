/**
 * Test script for version comparison utility
 * Run with: node test-version-comparison.js
 */

import {
  cleanVersionString,
  compareVersions,
  getVersionFromGitHubTag,
  isPreRelease,
  isUpdateAvailable,
  parseVersion,
} from "./utils/versionComparison.js";

console.log("🧪 Testing Version Comparison Utility\n");

// Test 1: Clean version strings
console.log("📝 Test 1: Clean version strings");
const testVersions = [
  "/Satoshi:27.0.0/",
  "v1.2.3",
  "Tor 0.4.8.10",
  "0.24.0",
  "1.7.0-beta",
  "AdGuard Home v0.107.43",
];

testVersions.forEach((v) => {
  console.log(`  "${v}" → "${cleanVersionString(v)}"`);
});

// Test 2: Parse versions
console.log("\n📝 Test 2: Parse versions");
const parsedVersions = ["27.0.0", "0.4.8.10", "1.2.3", "invalid"];

parsedVersions.forEach((v) => {
  const parsed = parseVersion(v);
  console.log(`  "${v}" →`, parsed || "null");
});

// Test 3: Pre-release detection
console.log("\n📝 Test 3: Pre-release detection");
const preReleaseTests = [
  "1.0.0",
  "1.0.0-beta",
  "1.0.0-rc1",
  "1.0.0-alpha.1",
  "2.0.0-preview",
];

preReleaseTests.forEach((v) => {
  console.log(`  "${v}" → ${isPreRelease(v) ? "PRE-RELEASE" : "STABLE"}`);
});

// Test 4: Version comparison
console.log("\n📝 Test 4: Version comparison");
const comparisons = [
  ["1.0.0", "1.0.1"],
  ["2.0.0", "1.9.9"],
  ["0.4.8.10", "0.4.8.11"],
  ["27.0.0", "26.1.0"],
  ["1.2.3", "1.2.3"],
];

comparisons.forEach(([v1, v2]) => {
  const result = compareVersions(v1, v2);
  const symbol = result < 0 ? "<" : result > 0 ? ">" : "=";
  console.log(`  ${v1} ${symbol} ${v2}`);
});

// Test 5: Update availability
console.log("\n📝 Test 5: Update availability");
const updateTests = [
  ["27.0.0", "27.1.0", true],
  ["0.4.8.10", "0.4.8.10", false],
  ["1.7.0", "2.0.0", true],
  ["1.2.3", "1.2.2", false],
  ["0.24.0", "0.25.0", true],
  ["1.0.0", "1.0.1-beta", false], // Should ignore pre-release
];

updateTests.forEach(([current, latest, expected]) => {
  const result = isUpdateAvailable(current, latest);
  const status = result === expected ? "✅" : "❌";
  console.log(
    `  ${status} Update from ${current} to ${latest}: ${result} (expected: ${expected})`
  );
});

// Test 6: GitHub tag parsing
console.log("\n📝 Test 6: GitHub tag parsing");
const gitHubTags = [
  "v27.1.0",
  "release-1.2.3",
  "version-0.24.0",
  "v1.0.0-rc1",
  "2.0.0",
];

gitHubTags.forEach((tag) => {
  console.log(`  "${tag}" → "${getVersionFromGitHubTag(tag)}"`);
});

// Test 7: Real-world examples
console.log("\n📝 Test 7: Real-world service version comparisons");
const realWorldTests = [
  {
    service: "Bitcoin Core",
    current: "/Satoshi:27.0.0/",
    latest: "v27.1.0",
  },
  {
    service: "Tor",
    current: "Tor 0.4.8.10",
    latest: "0.4.8.11",
  },
  {
    service: "IPFS (Kubo)",
    current: "0.24.0",
    latest: "v0.25.0",
  },
  {
    service: "Homebridge",
    current: "1.7.0",
    latest: "1.8.0",
  },
  {
    service: "AdGuard Home",
    current: "v0.107.43",
    latest: "v0.107.44",
  },
];

realWorldTests.forEach(({ service, current, latest }) => {
  const cleanCurrent = cleanVersionString(current);
  const cleanLatest = cleanVersionString(latest);
  const updateAvailable = isUpdateAvailable(cleanCurrent, cleanLatest);
  const icon = updateAvailable ? "🔴" : "✅";
  console.log(
    `  ${icon} ${service}: ${cleanCurrent} → ${cleanLatest} (Update: ${updateAvailable})`
  );
});

console.log("\n✨ All tests completed!\n");
