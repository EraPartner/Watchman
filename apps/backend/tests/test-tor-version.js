import fetch from "node-fetch";
import https from "https";

const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000 });

async function testTorVersionFetch() {
  try {
    console.log("🔍 Fetching latest Tor version from GitLab API...");

    const response = await fetch(
      "https://gitlab.torproject.org/api/v4/projects/tpo%2Fcore%2Ftor/repository/tags?per_page=50",
      {
        headers: { "User-Agent": "Watchman-Dashboard" },
        signal: AbortSignal.timeout(10000),
        agent: httpsAgent,
      }
    );

    if (!response.ok) {
      console.log("❌ GitLab API error:", response.status);
      process.exit(1);
    }

    const tags = await response.json();
    const stableTags = tags.filter(
      (tag) =>
        !tag.name.includes("alpha") &&
        !tag.name.includes("rc") &&
        tag.name.match(/tor-\d+\.\d+\.\d+\.\d+/)
    );

    if (stableTags.length > 0) {
      const latestVersion = stableTags[0].name.replace("tor-", "");
      console.log("✅ Successfully fetched latest Tor version:", latestVersion);
      console.log("📋 Found", stableTags.length, "stable versions");
      console.log("📦 First 5 stable versions:");
      stableTags.slice(0, 5).forEach((tag, i) => {
        console.log(`   ${i + 1}. ${tag.name}`);
      });
    } else {
      console.log("❌ No stable versions found");
    }
  } catch (error) {
    console.log("❌ Error:", error.message);
    process.exit(1);
  }
}

testTorVersionFetch();
