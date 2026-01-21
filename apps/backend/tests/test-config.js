#!/usr/bin/env node

// Test script to verify ENABLED_SERVICES configuration
import dotenv from "dotenv";
import fs from "fs";
import { getConfig } from "../config.js";

console.log("🔍 Testing ENABLED_SERVICES Configuration\n");

// Check if .env.local exists
const envPath = ".env.local";
if (fs.existsSync(envPath)) {
  console.log(`✅ Found ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.log(`❌ No ${envPath} file found`);
  console.log(
    `   Create it with: echo 'ENABLED_SERVICES=bitcoin,tor' > ${envPath}`,
  );
  process.exit(1);
}

// Check raw environment variable
console.log("\n📋 Raw environment variable:");
console.log(
  `   ENABLED_SERVICES="${process.env.ENABLED_SERVICES || "(not set)"}"`,
);

// Check parsed config
const config = getConfig();
console.log("\n📋 Parsed config.enabledServices:");
console.log(`   Type: ${typeof config.enabledServices}`);
console.log(`   Value:`, config.enabledServices);
console.log(`   As Array:`, Array.from(config.enabledServices));

// Check what would be returned to frontend
const frontendResponse = {
  enabledServices: Array.from(config.enabledServices),
};

console.log("\n📋 Frontend API response would include:");
console.log(JSON.stringify(frontendResponse, null, 2));

if (config.enabledServices.size === 0) {
  console.log("\n❌ ERROR: No services enabled!");
  console.log("   Make sure ENABLED_SERVICES is set in .env.local");
} else if (config.enabledServices.size > 10) {
  console.log("\n⚠️  WARNING: All services are enabled (default behavior)");
  console.log("   This happens when ENABLED_SERVICES is empty or not set");
} else {
  console.log("\n✅ Configuration looks good!");
  console.log(`   ${config.enabledServices.size} service(s) enabled`);
}
