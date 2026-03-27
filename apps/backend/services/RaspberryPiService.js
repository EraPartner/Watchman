import { exec } from "child_process";
import { promisify } from "util";
import net from "net";
import pigpio from "pigpio-client";
import logger from "../middleware/logger.js";

const execAsync = promisify(exec);

class RaspberryPiService {
  constructor(options = {}) {
    this.host = options.host || process.env.RASPI_HOST || null;
    this.port = options.port || parseInt(process.env.RASPI_PORT || "8888", 10);
    this.macMiniHost =
      options.macMiniHost || process.env.MACMINI_HOST || "127.0.0.1";
    this.macMiniSSHPort =
      options.macMiniSSHPort ||
      parseInt(process.env.MACMINI_SSH_PORT || "22583", 10);
    this.macMiniSSHUser =
      options.macMiniSSHUser || process.env.MACMINI_SSH_USER || "node";
    this.macMiniSSHKey =
      options.macMiniSSHKey ||
      process.env.MACMINI_SSH_KEY_PATH ||
      process.env.MACMINI_SSH_KEY;
    this.timeout = parseInt(
      options.timeout || process.env.RASPI_TIMEOUT || "10000",
      10
    );
    this.lastData = null;
    this.pi = null;
    this.connected = false;
  }

  // Connect to pigpiod daemon
  async connect() {
    if (this.connected && this.pi) {
      return this.pi;
    }

    if (!this.host) {
      throw new Error("RASPI_HOST not configured");
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.timeout}ms`));
      }, this.timeout);

      try {
        this.pi = pigpio.pigpio({
          host: this.host,
          port: this.port,
          timeout: this.timeout,
        });

        this.pi.once("connected", (info) => {
          clearTimeout(timeoutId);
          this.connected = true;
          logger.info(
            `Connected to pigpiod on ${this.host}:${this.port}, version: ${info}`
          );
          resolve(this.pi);
        });

        this.pi.once("error", (err) => {
          clearTimeout(timeoutId);
          this.connected = false;
          this.pi = null;
          logger.error(`pigpiod connection error: ${err.message}`);
          reject(err);
        });
      } catch (err) {
        clearTimeout(timeoutId);
        this.connected = false;
        this.pi = null;
        reject(err);
      }
    });
  }

  // Disconnect from pigpiod
  async disconnect() {
    if (this.pi) {
      try {
        await this.pi.end();
      } catch (err) {
        logger.error(`Error disconnecting from pigpiod: ${err.message}`);
      }
      this.pi = null;
      this.connected = false;
    }
  }

  async pingHost() {
    if (!this.host) throw new Error("RASPI_HOST not configured");

    const attempts = [`ping -c 2 -W 2 ${this.host}`, `ping -c 2 ${this.host}`];

    for (const cmd of attempts) {
      try {
        const { stdout } = await execAsync(cmd, {
          timeout: this.timeout,
        });

        const success =
          /0% packet loss|0\.0% packet loss|0 received/.test(stdout) &&
          !/100% packet loss/.test(stdout);

        if (success) {
          return { success: true, stdout };
        }
      } catch (err) {
        // Continue to next attempt
      }
    }

    return { success: false };
  }

  async checkHealth() {
    if (!this.host) {
      return {
        status: "offline",
        error: "RASPI_HOST not configured",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const pi = await this.connect();

      // If we got here, connection is successful
      const result = {
        status: "online",
        timestamp: new Date().toISOString(),
        data: {
          host: this.host,
          port: this.port,
          connected: true,
          pigpiod: "running",
        },
      };

      this.lastData = result;

      // Disconnect after health check
      await this.disconnect();

      return result;
    } catch (error) {
      // Fallback to ping if pigpio connection fails
      try {
        const pingResult = await this.pingHost();
        const isOnline = Boolean(pingResult.success);

        return {
          status: isOnline ? "warning" : "offline",
          timestamp: new Date().toISOString(),
          data: {
            host: this.host,
            port: this.port,
            ping: isOnline,
            pigpioError: error.message,
            warning: "pigpiod not responding, but host is reachable",
          },
        };
      } catch (pingError) {
        return {
          status: "offline",
          error: error.message,
          lastData: this.lastData,
          timestamp: new Date().toISOString(),
        };
      }
    }
  }

  // Helper method to execute shell command on the Pi using pigpio's shell command
  async executeShellCommand(pi, command) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Shell command timeout: ${command}`));
      }, this.timeout);

      try {
        pi.shell(command, (err, result) => {
          clearTimeout(timeoutId);
          if (err) {
            reject(new Error(`Shell command failed: ${err.message}`));
          } else {
            resolve(result ? result.toString("utf8").trim() : null);
          }
        });
      } catch (err) {
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  }

  // Helper method to read a system file using direct socket communication with pigpiod
  async readSysFile(filepath) {
    return new Promise((resolve, reject) => {
      if (!this.host) {
        return reject(new Error("RASPI_HOST not configured"));
      }

      const socket = new net.Socket();
      const timeoutId = setTimeout(() => {
        socket.destroy();
        reject(new Error(`File read timeout for ${filepath}`));
      }, this.timeout);

      let responseBuffer = Buffer.alloc(0);
      let fileHandle = null;
      let stage = "open";

      socket.connect(this.port, this.host, () => {
        // Open file command: PI_CMD_FO = 10
        const pathBytes = Buffer.from(filepath, "utf8");
        const cmdBuf = Buffer.alloc(16 + pathBytes.length);
        cmdBuf.writeUInt32LE(10, 0); // command: FO (file open)
        cmdBuf.writeUInt32LE(1, 4); // p1: mode (1 = read only - PI_FILE_READ)
        cmdBuf.writeUInt32LE(0, 8); // p2: unused
        cmdBuf.writeUInt32LE(pathBytes.length, 12); // p3: extension length
        pathBytes.copy(cmdBuf, 16);
        socket.write(cmdBuf);
      });

      socket.on("data", (data) => {
        responseBuffer = Buffer.concat([responseBuffer, data]);

        if (stage === "open" && responseBuffer.length >= 16) {
          // Parse file open response
          fileHandle = responseBuffer.readInt32LE(12);

          if (fileHandle < 0) {
            clearTimeout(timeoutId);
            socket.destroy();
            return reject(
              new Error(
                `Failed to open file: ${filepath} (error code: ${fileHandle})`
              )
            );
          }

          // Read from file: PI_CMD_FR = 11
          const readCmdBuf = Buffer.alloc(16);
          readCmdBuf.writeUInt32LE(11, 0); // command: FR (file read)
          readCmdBuf.writeUInt32LE(fileHandle, 4); // p1: file handle
          readCmdBuf.writeUInt32LE(1024, 8); // p2: count (read up to 1024 bytes)
          readCmdBuf.writeUInt32LE(0, 12); // p3: unused

          responseBuffer = Buffer.alloc(0);
          stage = "read";
          socket.write(readCmdBuf);
        } else if (stage === "read" && responseBuffer.length >= 16) {
          // Parse file read response
          const bytesRead = responseBuffer.readInt32LE(12);

          // Close file: PI_CMD_FC = 12
          const closeCmdBuf = Buffer.alloc(16);
          closeCmdBuf.writeUInt32LE(12, 0); // command: FC (file close)
          closeCmdBuf.writeUInt32LE(fileHandle, 4); // p1: file handle
          closeCmdBuf.writeUInt32LE(0, 8); // p2: unused
          closeCmdBuf.writeUInt32LE(0, 12); // p3: unused
          socket.write(closeCmdBuf);

          clearTimeout(timeoutId);
          socket.destroy();

          if (bytesRead > 0 && responseBuffer.length >= 16 + bytesRead) {
            const fileContent = responseBuffer
              .slice(16, 16 + bytesRead)
              .toString("utf8");
            resolve(fileContent);
          } else if (bytesRead === 0) {
            resolve("");
          } else {
            reject(
              new Error(
                `Failed to read file ${filepath}: got ${bytesRead} bytes`
              )
            );
          }
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timeoutId);
        socket.destroy();
        reject(new Error(`Socket error reading ${filepath}: ${err.message}`));
      });
    });
  }

  // Helper method to get Raspberry Pi info via Mac Mini SSH and rpi command
  async getRPIInfo() {
    if (!this.host) {
      throw new Error("RASPI_HOST not configured");
    }

    try {
      const sshCommand = `ssh -i ${this.macMiniSSHKey} -p ${this.macMiniSSHPort} -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${this.macMiniSSHUser}@${this.macMiniHost} "/usr/local/opt/node@22/bin/node /usr/local/lib/node_modules/homebridge-rpi/cli/rpi.js -H ${this.host}:${this.port} info"`;

      logger.info(`Executing RPI info command via Mac Mini: ${sshCommand}`);

      const { stdout, stderr } = await execAsync(sshCommand, {
        timeout: this.timeout,
        maxBuffer: 1024 * 1024, // 1MB buffer
      });

      if (stderr && !stdout) {
        throw new Error(`RPI command failed: ${stderr}`);
      }

      // Parse JSON output
      try {
        const jsonData = JSON.parse(stdout.trim());
        logger.info("Successfully parsed RPI JSON data");
        return jsonData;
      } catch (parseError) {
        logger.error(`Failed to parse RPI JSON output: ${parseError.message}`);
        logger.error(`Raw output: ${stdout}`);
        throw new Error(
          `Invalid JSON response from RPI command: ${parseError.message}`
        );
      }
    } catch (error) {
      logger.error(`Failed to get RPI info: ${error.message}`);
      throw error;
    }
  }

  // Parse the rpi JSON output to extract useful metrics
  parseRPIInfo(rpiData) {
    const info = {
      piModel: null,
      hwRevision: null,
      cpuTemp: null,
      clockRate: null,
      voltage: null,
      memory: null,
      uptime: null,
      load: null,
      swap: null,
      prettyName: null,
      processor: null,
      isRpi: false,
    };

    // Extract basic hardware info
    if (rpiData.model) {
      info.piModel = rpiData.model;
    }

    if (rpiData.prettyName) {
      info.prettyName = rpiData.prettyName;
    }

    if (rpiData.processor) {
      info.processor = rpiData.processor;
    }

    if (rpiData.memory) {
      info.memory = rpiData.memory;
    }

    if (rpiData.isRpi !== undefined) {
      info.isRpi = rpiData.isRpi;
    }

    // Parse hardware revision
    if (rpiData.revision) {
      info.hwRevision = parseInt(rpiData.revision, 16);
    }

    // Extract state information
    if (rpiData.state) {
      const state = rpiData.state;

      // CPU Temperature
      if (state.temp !== undefined && state.temp !== null) {
        info.cpuTemp = parseFloat(state.temp);
      }

      // Clock frequency (convert Hz to MHz)
      if (state.freq !== undefined && state.freq !== null) {
        info.clockRate = Math.round(state.freq / 1000000); // Convert Hz to MHz
      }

      // Voltage
      if (state.volt !== undefined && state.volt !== null) {
        info.voltage = parseFloat(state.volt);
      }

      // Load average
      if (state.load !== undefined && state.load !== null) {
        info.load = parseFloat(state.load);
      }

      // Swap usage percentage
      if (state.swap !== undefined && state.swap !== null) {
        info.swap = parseFloat(state.swap);
      }

      // Calculate uptime from boot time
      if (state.boot) {
        const bootTime = new Date(state.boot);
        const now = new Date();
        info.uptime = Math.floor((now.getTime() - bootTime.getTime()) / 1000);
      }
    }

    return info;
  }

  async getStats() {
    if (!this.host) {
      return {
        error: "RASPI_HOST not configured",
        message: "Raspberry Pi host not configured",
      };
    }

    try {
      const pi = await this.connect();

      // Get hardware revision to determine Pi model
      let hwRevision = null;
      let piModel = "Unknown";
      try {
        hwRevision = await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(
            () => reject(new Error("Timeout")),
            this.timeout
          );
          pi.getHardwareRevision((err, rev) => {
            clearTimeout(timeoutId);
            if (err) reject(err);
            else resolve(rev);
          });
        });
        piModel = this.getPiModel(hwRevision);
      } catch (e) {
        logger.error(`Failed to get hardware revision: ${e.message}`);
      }

      // Get pigpio version
      let pigpioVersion = null;
      try {
        pigpioVersion = await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(
            () => reject(new Error("Timeout")),
            this.timeout
          );
          pi.getPigpioVersion((err, ver) => {
            clearTimeout(timeoutId);
            if (err) reject(err);
            else resolve(ver);
          });
        });
      } catch (e) {
        logger.error(`Failed to get pigpio version: ${e.message}`);
      }

      // Get current tick (microseconds since boot)
      let uptimeSeconds = null;
      try {
        const tick = await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(
            () => reject(new Error("Timeout")),
            this.timeout
          );
          pi.getCurrentTick((err, t) => {
            clearTimeout(timeoutId);
            if (err) reject(err);
            else resolve(t);
          });
        });
        uptimeSeconds = Math.floor(tick / 1000000);
      } catch (e) {
        logger.error(`Failed to get uptime: ${e.message}`);
      }

      // Disconnect from pigpio-client before getting additional info
      await this.disconnect();

      // Get additional info via rpi command on Mac Mini
      let cpuTemp = null;
      let clockRate = null;
      let loadAverage = null;
      let memory = null;

      try {
        const rpiOutput = await this.getRPIInfo();

        const parsedInfo = this.parseRPIInfo(rpiOutput);

        // Use parsed info to fill in the stats
        if (parsedInfo.cpuTemp !== null) {
          cpuTemp = parsedInfo.cpuTemp;
        }

        if (parsedInfo.clockRate !== null) {
          clockRate = parsedInfo.clockRate;
        }

        // If we got hardware revision from rpi command and didn't get it from pigpio, use it
        if (parsedInfo.hwRevision !== null && !hwRevision) {
          hwRevision = parsedInfo.hwRevision;
          piModel = this.getPiModel(hwRevision);
        }

        // Parse additional metrics from rpi output if available
        // Look for load average, memory usage, etc.
        const lines = rpiOutput.split("\n");
        for (const line of lines) {
          // Load average (e.g., "Load average: 0.15, 0.18, 0.20")
          if (line.toLowerCase().includes("load")) {
            const match = line.match(/([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
            if (match) {
              loadAverage = {
                load1: parseFloat(match[1]),
                load5: parseFloat(match[2]),
                load15: parseFloat(match[3]),
              };
            }
          }

          // Memory info (e.g., "Memory: 512/1024 MB (50%)")
          if (line.toLowerCase().includes("memory") && line.includes("/")) {
            const match = line.match(/([\d]+)\/([\d]+)\s*MB.*\((\d+)%\)/);
            if (match) {
              memory = {
                usedMB: parseInt(match[1]),
                totalMB: parseInt(match[2]),
                usedPercent: parseInt(match[3]),
                availableMB: parseInt(match[2]) - parseInt(match[1]),
              };
            }
          }
        }
      } catch (e) {
        logger.error(`Failed to get RPI info via Mac Mini: ${e.message}`);
      }

      const stats = {
        piModel,
        hwRevision,
        pigpioVersion,
        cpuTemp,
        clockRate,
        uptime: uptimeSeconds,
        loadAverage,
        memory,
        port: this.port,
        connected: true,
        lastUpdated: new Date().toISOString(),
      };

      this.lastData = stats;

      return stats;
    } catch (error) {
      logger.error(`Failed to fetch stats from pigpiod: ${error.message}`);
      return {
        error: error.message,
        message: "Failed to fetch stats from pigpiod",
        lastData: this.lastData,
      };
    }
  }

  // Determine Pi model from hardware revision
  getPiModel(revision) {
    if (!revision) return "Unknown";

    const rev = typeof revision === "number" ? revision.toString(16) : revision;

    // New-style revision codes (bit 23 set)
    if (revision & 0x800000) {
      const type = (revision >> 4) & 0xff;
      const models = {
        0x00: "Pi A",
        0x01: "Pi B",
        0x02: "Pi A+",
        0x03: "Pi B+",
        0x04: "Pi 2B",
        0x05: "Pi Alpha",
        0x06: "Pi CM1",
        0x08: "Pi 3B",
        0x09: "Pi Zero",
        0x0a: "Pi CM3",
        0x0c: "Pi Zero W",
        0x0d: "Pi 3B+",
        0x0e: "Pi 3A+",
        0x0f: "Internal use",
        0x10: "Pi CM3+",
        0x11: "Pi 4B",
        0x12: "Pi Zero 2 W",
        0x13: "Pi 400",
        0x14: "Pi CM4",
        0x15: "Pi CM4S",
        0x17: "Pi 5",
      };
      return models[type] || `Unknown (type ${type})`;
    }

    // Old-style revision codes
    const oldModels = {
      "0002": "Pi B Rev 1.0",
      "0003": "Pi B Rev 1.0",
      "0004": "Pi B Rev 2.0",
      "0005": "Pi B Rev 2.0",
      "0006": "Pi B Rev 2.0",
      "0007": "Pi A",
      "0008": "Pi A",
      "0009": "Pi A",
      "000d": "Pi B Rev 2.0",
      "000e": "Pi B Rev 2.0",
      "000f": "Pi B Rev 2.0",
      "0010": "Pi B+",
      "0011": "Pi CM1",
      "0012": "Pi A+",
      "0013": "Pi B+",
      "0014": "Pi CM1",
      "0015": "Pi A+",
    };

    return oldModels[rev] || `Unknown (rev ${rev})`;
  }

  // Helper method to read a GPIO pin state
  async readGPIO(gpio) {
    try {
      const pi = await this.connect();
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("GPIO read timeout"));
        }, this.timeout);

        pi.read(gpio, (err, level) => {
          clearTimeout(timeoutId);
          if (err) {
            reject(new Error(`Failed to read GPIO ${gpio}: ${err.message}`));
          } else {
            resolve(level);
          }
        });
      });
    } finally {
      await this.disconnect();
    }
  }

  // Helper method to write to a GPIO pin
  async writeGPIO(gpio, level) {
    try {
      const pi = await this.connect();
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("GPIO write timeout"));
        }, this.timeout);

        pi.write(gpio, level, (err) => {
          clearTimeout(timeoutId);
          if (err) {
            reject(new Error(`Failed to write GPIO ${gpio}: ${err.message}`));
          } else {
            resolve(true);
          }
        });
      });
    } finally {
      await this.disconnect();
    }
  }

  // Helper method to set GPIO mode
  async setGPIOMode(gpio, mode) {
    try {
      const pi = await this.connect();
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("GPIO mode set timeout"));
        }, this.timeout);

        pi.setMode(gpio, mode, (err) => {
          clearTimeout(timeoutId);
          if (err) {
            reject(
              new Error(`Failed to set GPIO ${gpio} mode: ${err.message}`)
            );
          } else {
            resolve(true);
          }
        });
      });
    } finally {
      await this.disconnect();
    }
  }
}

export default RaspberryPiService;
