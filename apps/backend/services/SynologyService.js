import { spawn } from "child_process";
import { logger } from "../middleware/logger.js";
import { formatDuration } from "../utils/serviceUtils.js";

class SynologyService {
  constructor() {
    this.isConnected = false;
    this.lastData = null;
    this.checkSystemSnmp();

    // Synology SNMP OIDs
    this.oids = {
      // System Info
      systemName: "1.3.6.1.2.1.1.5.0",
      systemUptime: "1.3.6.1.2.1.1.3.0",
      systemModel: "1.3.6.1.4.1.6574.1.5.1.0",
      systemVersion: "1.3.6.1.4.1.6574.1.5.3.0",
      systemStatus: "1.3.6.1.4.1.6574.1.1.0",

      // CPU
      cpuUsage: "1.3.6.1.4.1.6574.1.5.2.0",
      cpuTemp: "1.3.6.1.4.1.6574.1.2.0",

      // Memory
      memoryTotal: "1.3.6.1.4.1.6574.1.5.4.0",
      memoryAvailable: "1.3.6.1.4.1.6574.1.5.5.0",
      memoryUsage: "1.3.6.1.4.1.6574.1.5.6.0",

      // Disk
      diskTotal: "1.3.6.1.4.1.6574.2.1.1.4.0",
      diskUsed: "1.3.6.1.4.1.6574.2.1.1.5.0",
      diskUsage: "1.3.6.1.4.1.6574.2.1.1.6.0",

      // Network
      networkRx: "1.3.6.1.2.1.2.2.1.10.1",
      networkTx: "1.3.6.1.2.1.2.2.1.16.1",

      // Services
      services: "1.3.6.1.4.1.6574.6.1.1.2",
      servicesStatus: "1.3.6.1.4.1.6574.6.1.1.3",
    };
  }

  async checkSystemSnmp() {
    try {
      // Check if required environment variables are present
      if (!process.env.SYNOLOGY_HOST) {
        logger.warning(
          "Synology service unavailable - SYNOLOGY_HOST not configured"
        );
        return;
      }

      if (
        !process.env.SYNOLOGY_SNMP_USERNAME ||
        !process.env.SYNOLOGY_SNMP_AUTH_KEY
      ) {
        logger.warning(
          "Synology service unavailable - SNMP credentials not configured"
        );
        return;
      }

      // Test system snmpget command availability with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Command timeout")), 3000)
      );

      const whichPromise = new Promise((resolve, reject) => {
        const child = spawn("which", ["snmpget"], { timeout: 3000 });
        child.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error("snmpget not found"))
        );
        child.on("error", reject);
      });
      await Promise.race([whichPromise, timeoutPromise]);

      logger.service(
        "synology",
        `System SNMP tools available for Synology NAS (${process.env.SYNOLOGY_HOST})`
      );
      logger.service(
        "synology",
        `Using SNMPv3 with user: ${process.env.SYNOLOGY_SNMP_USERNAME}`
      );

      this.isConnected = true;
    } catch (error) {
      logger.error("System SNMP tools not available", { error: error.message });
      logger.error(
        "Please install net-snmp tools: brew install net-snmp (macOS) or apt-get install snmp (Linux)"
      );
      this.isConnected = false;
    }
  }

  // System SNMP command execution using spawn (no shell interpolation)
  async _runSnmpGet(oids) {
    if (!Array.isArray(oids)) {
      oids = [oids];
    }

    const args = [
      "-v3",
      "-u",
      process.env.SYNOLOGY_SNMP_USERNAME,
      "-A",
      process.env.SYNOLOGY_SNMP_AUTH_KEY,
      "-a",
      "SHA",
      "-X",
      process.env.SYNOLOGY_SNMP_PRIV_KEY,
      "-l",
      "authPriv",
      "-x",
      "AES",
      "-Oqv",
      process.env.SYNOLOGY_HOST,
      ...oids,
    ];

    return new Promise((resolve, reject) => {
      const child = spawn("snmpget", args, {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(stderr.trim() || `snmpget exited with code ${code}`)
          );
          return;
        }
        resolve(stdout);
      });
      child.on("error", reject);
    });
  }

  // System SNMP command execution
  async getSystemSnmp(oids) {
    if (!Array.isArray(oids)) {
      oids = [oids];
    }

    try {
      const stdout = await this._runSnmpGet(oids);

      // Parse the output - each line is a value
      const values = stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());
      return values.map((value, index) => ({
        oid: oids[index],
        value: value.replace(/^"(.*)"$/, "$1").trim(), // Remove quotes if present
      }));
    } catch (error) {
      throw new Error(`System SNMP command failed: ${error.message}`);
    }
  }

  async checkHealth() {
    try {
      if (!this.isConnected) {
        return {
          status: "offline",
          error: "System SNMP tools not available",
          timestamp: new Date().toISOString(),
        };
      }

      const data = await this.getSystemInfo();
      return {
        status: "online",
        timestamp: new Date().toISOString(),
        data: {
          name: data.name,
          model: data.model,
          version: data.version,
          uptime: formatDuration(data.uptime * 1000),
          systemStatus: data.status,
        },
      };
    } catch (error) {
      return {
        status: "offline",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getStats() {
    return await this.getAllData();
  }

  async getSystemInfo() {
    const oids = [
      this.oids.systemName,
      this.oids.systemUptime,
      this.oids.systemModel,
      this.oids.systemVersion,
      this.oids.systemStatus,
    ];

    const results = await this.getSystemSnmp(oids);

    return {
      name: results[0]?.value || "Unknown",
      uptime: parseInt(results[1]?.value || 0) / 100, // Convert to seconds
      model: results[2]?.value || "Unknown",
      version: results[3]?.value || "Unknown",
      status: parseInt(results[4]?.value || 0) === 1 ? "Normal" : "Warning",
    };
  }

  async getCPUInfo() {
    const oids = [this.oids.cpuUsage, this.oids.cpuTemp];

    const results = await this.getSystemSnmp(oids);

    return {
      usage: parseInt(results[0]?.value || 0),
      temperature: parseInt(results[1]?.value || 0),
    };
  }

  async getMemoryInfo() {
    const oids = [
      this.oids.memoryTotal,
      this.oids.memoryAvailable,
      this.oids.memoryUsage,
    ];

    const results = await this.getSystemSnmp(oids);
    const totalMB = parseInt(results[0]?.value || 0);
    const availableMB = parseInt(results[1]?.value || 0);
    const usagePercent = parseInt(results[2]?.value || 0);

    return {
      total: totalMB * 1024 * 1024, // Convert to bytes
      available: availableMB * 1024 * 1024, // Convert to bytes
      used: (totalMB - availableMB) * 1024 * 1024,
      usage: usagePercent,
    };
  }

  async getDiskInfo() {
    const oids = [this.oids.diskTotal, this.oids.diskUsed, this.oids.diskUsage];

    const results = await this.getSystemSnmp(oids);
    const totalKB = parseInt(results[0]?.value || 0);
    const usedKB = parseInt(results[1]?.value || 0);
    const usagePercent = parseInt(results[2]?.value || 0);

    return {
      total: totalKB * 1024, // Convert to bytes
      used: usedKB * 1024, // Convert to bytes
      free: (totalKB - usedKB) * 1024,
      usage: usagePercent,
    };
  }

  async getNetworkInfo() {
    const oids = [this.oids.networkRx, this.oids.networkTx];

    const results = await this.getSystemSnmp(oids);

    return {
      bytesReceived: parseInt(results[0]?.value || 0),
      bytesTransmitted: parseInt(results[1]?.value || 0),
    };
  }

  async getAllData() {
    try {
      if (!this.isConnected) {
        return {
          status: "error",
          error: "System SNMP tools not available",
          timestamp: new Date().toISOString(),
        };
      }

      // Collect data with individual error handling to prevent one failure from breaking everything
      const results = await Promise.allSettled([
        this.getSystemInfo(),
        this.getCPUInfo(),
        this.getMemoryInfo(),
        this.getDiskInfo(),
        this.getNetworkInfo(),
      ]);

      // Extract successful results and handle failures gracefully
      const [systemResult, cpuResult, memoryResult, diskResult, networkResult] =
        results;

      const data = {
        status: "online",
        timestamp: new Date().toISOString(),
        system:
          systemResult.status === "fulfilled"
            ? systemResult.value
            : {
                name: "Unknown",
                uptime: 0,
                model: "Unknown",
                version: "Unknown",
                status: "Unknown",
              },
        cpu:
          cpuResult.status === "fulfilled"
            ? cpuResult.value
            : {
                usage: 0,
                temperature: 0,
              },
        memory:
          memoryResult.status === "fulfilled"
            ? memoryResult.value
            : {
                total: 0,
                available: 0,
                used: 0,
                usage: 0,
              },
        disk:
          diskResult.status === "fulfilled"
            ? diskResult.value
            : {
                total: 0,
                used: 0,
                free: 0,
                usage: 0,
              },
        network:
          networkResult.status === "fulfilled"
            ? networkResult.value
            : {
                bytesReceived: 0,
                bytesTransmitted: 0,
              },
        lastUpdated: new Date().toISOString(),
        // Add information about any failures
        errors: results
          .map((result, index) => ({ index, result }))
          .filter(({ result }) => result.status === "rejected")
          .map(({ index, result }) => ({
            component: ["system", "cpu", "memory", "disk", "network"][index],
            error: result.reason.message,
          })),
      };

      // Log any partial failures
      if (data.errors.length > 0) {
        logger.warn("Synology partial data collection failures", {
          errors: data.errors,
        });
      }

      this.lastData = data;
      return data;
    } catch (error) {
      logger.error("Failed to get Synology data", { error: error.message });
      return {
        status: "error",
        error: error.message,
        lastData: this.lastData,
        timestamp: new Date().toISOString(),
      };
    }
  }

}

export default SynologyService;
