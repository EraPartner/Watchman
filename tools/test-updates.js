#!/usr/bin/env node
// Quick test script for update endpoints

import fetch from "node-fetch";
import https from "https";

const httpsAgent = new https.Agent({ keepAlive: true });

async function testUpdates() {
  console.log("🧪 Testing Update Check Functionality\n");

  // Test 1: Homebridge NPM check
  console.log("1️⃣  Testing Homebridge (npm registry)...");
  try {
    const response = await fetch(
      "https://registry.npmjs.org/homebridge/latest",
      {
        headers: {
          "User-Agent": "Watchman-Dashboard",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
        agent: httpsAgent,
      }
    );
    const data = await response.json();
    console.log("   ✅ Homebridge latest version:", data.version);
  } catch (error) {
    console.log("   ❌ Error:", error.message);
  }

  // Test 2: Bitcoin GitHub check
  console.log("\n2️⃣  Testing Bitcoin Core (GitHub)...");
  try {
    const response = await fetch(
      "https://api.github.com/repos/bitcoin/bitcoin/releases/latest",
      {
        headers: {
          "User-Agent": "Watchman-Dashboard",
          Accept: "application/vnd.github.v3+json",
        },
        signal: AbortSignal.timeout(10000),
        agent: httpsAgent,
      }
    );
    const data = await response.json();
    console.log("   ✅ Bitcoin Core latest version:", data.tag_name);
  } catch (error) {
    console.log("   ❌ Error:", error.message);
  }

  // Test 3: IPFS/Kubo GitHub check
  console.log("\n3️⃣  Testing IPFS/Kubo (GitHub)...");
  try {
    const response = await fetch(
      "https://api.github.com/repos/ipfs/kubo/releases/latest",
      {
        headers: {
          "User-Agent": "Watchman-Dashboard",
          Accept: "application/vnd.github.v3+json",
        },
        signal: AbortSignal.timeout(10000),
        agent: httpsAgent,
      }
    );
    const data = await response.json();
    console.log("   ✅ IPFS/Kubo latest version:", data.tag_name);
  } catch (error) {
    console.log("   ❌ Error:", error.message);
  }

  // Test 4: Tor consensus check
  console.log("\n4️⃣  Testing Tor (consensus-health)...");
  try {
    const response = await fetch("https://consensus-health.torproject.org/", {
      headers: { "User-Agent": "Watchman-Dashboard" },
      signal: AbortSignal.timeout(10000),
      agent: httpsAgent,
    });
    const html = await response.text();
    const versionMatch = html.match(/Recommended.*?(\d+\.\d+\.\d+\.\d+)/i);
    console.log(
      "   ✅ Tor recommended version:",
      versionMatch ? versionMatch[1] : "Could not parse"
    );
  } catch (error) {
    console.log("   ❌ Error:", error.message);
  }

  console.log("\n✨ All HTTPS agent tests complete!\n");
}

testUpdates().catch(console.error);
