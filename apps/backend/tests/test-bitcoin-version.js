/**
 * Test Bitcoin update check specifically
 */

console.log(
  JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "INFO",
    message: "[TEST] Testing Bitcoin Update Check",
  })
);

// Test version string cleaning for Bitcoin
const testBitcoinVersions = [
  "/Satoshi:27.0.0/",
  "/Satoshi:26.1.0/",
  "27000000", // numeric version format
  "270000",
];

console.log("📝 Test Bitcoin version formats:");
testBitcoinVersions.forEach((v) => {
  console.log(`  Raw: "${v}"`);

  // Test the inline cleaning in Bitcoin service
  let cleaned = v;
  if (typeof cleaned === "string") {
    cleaned = cleaned
      .trim()
      .replace(/^[vV]ersion: /, "")
      .replace(/\/.*$/, "")
      .substring(0, 32);
  }
  console.log(`  Cleaned: "${cleaned}"\n`);
});

// Test with actual numeric version
console.log("\n📝 Test numeric version (what Bitcoin Core actually returns):");
const numericVersion = 270000; // Bitcoin Core v27.0.0 returns version as integer
console.log(`  Raw numeric: ${numericVersion}`);
console.log(`  Type: ${typeof numericVersion}`);

// Bitcoin Core version number format:
// Major version * 10000 + Minor version * 100 + Revision
// Example: 270000 = 27 * 10000 + 0 * 100 + 0 = v27.0.0
function parseNumericVersion(version) {
  if (typeof version !== "number") {
    return null;
  }

  const major = Math.floor(version / 10000);
  const minor = Math.floor((version % 10000) / 100);
  const patch = version % 100;

  return `${major}.${minor}.${patch}`;
}

console.log(`  Parsed to: ${parseNumericVersion(numericVersion)}`);
console.log(`  ${parseNumericVersion(260100)} = 26.1.0`);
console.log(`  ${parseNumericVersion(270100)} = 27.1.0`);
console.log(`  ${parseNumericVersion(280000)} = 28.0.0`);

console.log("\n✨ Bitcoin version parsing test completed!\n");
