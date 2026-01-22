#!/usr/bin/env node

/**
 * Script to add multi-instance support to all services in ServiceManager.js
 * This script reads the current file, finds each service initialization,
 * and wraps it with multi-instance support logic.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICE_MANAGER_PATH = path.join(
  __dirname,
  "../apps/backend/services/ServiceManager.js",
);
const BACKUP_PATH = `${SERVICE_MANAGER_PATH}.backup.${Date.now()}`;

console.log("🔧 Multi-Instance Support Updater");
console.log("==================================\n");

// Services that need multi-instance support
const SERVICES_TO_UPDATE = [
  "adguard",
  "tor",
  "synology",
  "ipfs",
  "roon",
  "philips",
  "homebridge",
  "macmini",
  "albyhub",
  "raspi",
  // 'bitcoin', 'qbittorrent', 'beryl', 'telenet' already have instance tracking
];

// Read the current file
console.log(`📖 Reading ${SERVICE_MANAGER_PATH}...`);
let content = fs.readFileSync(SERVICE_MANAGER_PATH, "utf8");

// Create backup
console.log(`💾 Creating backup at ${BACKUP_PATH}...`);
fs.writeFileSync(BACKUP_PATH, content);

// For each service, find and update the initialization code
let updateCount = 0;

SERVICES_TO_UPDATE.forEach((serviceName) => {
  console.log(`\n🔍 Processing ${serviceName}...`);

  // Find the service initialization block
  const servicePattern = new RegExp(
    `(\\s+)// Initialize ${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)}.*?\\n` +
      `(\\s+)if \\(enabledServices\\.has\\("${serviceName}"\\)\\) \\{([^}]+this\\.services\\.set\\("${serviceName}"[^;]+;\\s+)\\}`,
    "gs",
  );

  const match = content.match(servicePattern);

  if (match) {
    console.log(`  ✅ Found ${serviceName} initialization block`);

    // Check if it already has serviceInstances.set
    if (content.includes(`this.serviceInstances.set("${serviceName}"`)) {
      console.log(
        `  ⏭️  ${serviceName} already has serviceInstances - skipping`,
      );
      return;
    }

    // Add serviceInstances.set after this.services.set
    const serviceSetPattern = new RegExp(
      `(this\\.services\\.set\\("${serviceName}", ${serviceName}Service\\);)`,
      "g",
    );

    if (content.match(serviceSetPattern)) {
      content = content.replace(
        serviceSetPattern,
        `$1\n        this.serviceInstances.set("${serviceName}", ["${serviceName}"]);`,
      );
      updateCount++;
      console.log(`  ✨ Added serviceInstances tracking for ${serviceName}`);
    } else {
      console.log(`  ⚠️  Could not find services.set for ${serviceName}`);
    }
  } else {
    console.log(`  ❌ Could not find initialization block for ${serviceName}`);
  }
});

// Write the updated file
if (updateCount > 0) {
  console.log(`\n💾 Writing updated file...`);
  fs.writeFileSync(SERVICE_MANAGER_PATH, content);
  console.log(`\n✅ Successfully updated ${updateCount} service(s)!`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Review the changes in ServiceManager.js`);
  console.log(`   2. Test the backend: cd apps/backend && npm start`);
  console.log(`   3. Check for any syntax errors`);
  console.log(`   4. Restore from backup if needed: ${BACKUP_PATH}`);
} else {
  console.log(
    `\n⚠️  No services were updated. They may already have multi-instance support.`,
  );
}

console.log("\n✨ Done!\n");
