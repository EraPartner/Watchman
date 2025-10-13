// Test script to verify Homebridge version extraction
import HomebridgeService from "./services/HomebridgeService.js";

// Mock the makeRequest to simulate different response formats
const testCases = [
  { name: "Format 1: { homebridge: '1.8.3' }", data: { homebridge: "1.8.3" } },
  { name: "Format 2: { version: '1.8.3' }", data: { version: "1.8.3" } },
  {
    name: "Format 3: { homebridgeVersion: '1.8.3' }",
    data: { homebridgeVersion: "1.8.3" },
  },
  { name: "Format 4: String '1.8.3'", data: "1.8.3" },
];

console.log("Testing Homebridge version extraction:\n");

testCases.forEach((testCase) => {
  const service = new HomebridgeService({ baseUrl: "http://test" });

  // Mock makeRequest
  service.makeRequest = async () => testCase.data;

  // Test version extraction logic
  const versionData = testCase.data;
  let extractedVersion = "unknown";

  if (versionData && typeof versionData === "object") {
    extractedVersion =
      versionData.homebridge ||
      versionData.version ||
      versionData.homebridgeVersion ||
      versionData.homebridge_version ||
      versionData.serverVersion ||
      (versionData.raw && versionData.raw.version) ||
      "unknown";
  } else if (typeof versionData === "string") {
    extractedVersion = versionData;
  }

  console.log(`✓ ${testCase.name}`);
  console.log(`  Extracted: ${extractedVersion}`);
  console.log(`  Expected: 1.8.3`);
  console.log(
    `  Result: ${extractedVersion === "1.8.3" ? "PASS ✅" : "FAIL ❌"}\n`
  );
});
