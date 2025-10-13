import { BitcoinService } from "./services/BitcoinService.js";

console.log("🧪 Testing Bitcoin Update Check\n");

const service = new BitcoinService({
  rpcUrl: process.env.BITCOIN_RPC_URL || "http://127.0.0.1:8332",
  rpcUser: process.env.BITCOIN_RPC_USER,
  rpcPassword: process.env.BITCOIN_RPC_PASSWORD,
});

// First get network info to see what Bitcoin returns
service
  .executeRpcCommand("getnetworkinfo")
  .then((networkInfo) => {
    console.log("📊 Network Info from Bitcoin Core:");
    console.log("  subversion:", networkInfo.subversion);
    console.log("  version:", networkInfo.version);
    console.log("  type of version:", typeof networkInfo.version);
    console.log("");

    // Now test the update check
    return service.checkForUpdates();
  })
  .then((result) => {
    console.log("✅ Update check result:", JSON.stringify(result, null, 2));
    console.log("");
    if (
      result.currentVersion === "unknown" ||
      result.latestVersion === "unknown"
    ) {
      console.log('❌ ISSUE: One or both versions are "unknown"');
      process.exit(1);
    } else {
      console.log("✨ SUCCESS: Both versions are properly detected!");
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
  });
