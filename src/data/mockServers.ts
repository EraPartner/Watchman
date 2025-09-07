import { Server } from "@/types/server";

export const mockServers: Server[] = [
  {
    id: "bitcoin-core",
    name: "Bitcoin Core",
    type: "bitcoin",
    ip: "192.168.1.100",
    port: 8333,
    status: "online",
    lastSeen: new Date(Date.now() - 300000), // 5 minutes ago
    description: "Full Bitcoin node running on Raspberry Pi",
    stats: {
      uptime: "15d 4h 23m",
      cpu: 45,
      memory: 68,
      disk: 85,
      network: {
        incoming: "1.2 MB/s",
        outgoing: "850 KB/s"
      },
      customStats: {
        "Block Height": 820450,
        "Connections": 12,
        "Mempool Size": "45 MB"
      }
    }
  },
  {
    id: "adguard-home",
    name: "AdGuard Home",
    type: "network",
    ip: "192.168.1.101",
    port: 80,
    status: "online",
    lastSeen: new Date(Date.now() - 120000), // 2 minutes ago
    description: "Network-wide ad and tracker blocking",
    stats: {
      uptime: "8d 12h 45m",
      cpu: 12,
      memory: 25,
      customStats: {
        "Queries Today": 14567,
        "Blocked Today": 2834,
        "Block Rate": "19.4%"
      }
    }
  },
  {
    id: "qbittorrent",
    name: "qBittorrent",
    type: "torrent",
    ip: "192.168.1.101",
    port: 8080,
    status: "online",
    lastSeen: new Date(Date.now() - 60000), // 1 minute ago
    description: "Torrent client for seeding",
    stats: {
      uptime: "3d 8h 12m",
      cpu: 8,
      memory: 15,
      disk: 45,
      network: {
        incoming: "2.5 MB/s",
        outgoing: "15.8 MB/s"
      },
      customStats: {
        "Active Torrents": 12,
        "Seeding": 8,
        "Total Uploaded": "2.4 TB"
      }
    }
  },
  {
    id: "tor-node",
    name: "Tor Relay",
    type: "proxy",
    ip: "192.168.1.101",
    port: 9001,
    status: "online",
    lastSeen: new Date(Date.now() - 180000), // 3 minutes ago
    description: "Tor middle relay node",
    stats: {
      uptime: "22d 6h 15m",
      cpu: 35,
      memory: 42,
      network: {
        incoming: "5.2 MB/s",
        outgoing: "4.8 MB/s"
      },
      customStats: {
        "Relay Type": "Middle",
        "Bandwidth": "10 MB/s",
        "Consensus Weight": 1250
      }
    }
  },
  {
    id: "homebridge",
    name: "Homebridge",
    type: "iot",
    ip: "192.168.1.101",
    port: 8581,
    status: "online",
    lastSeen: new Date(Date.now() - 240000), // 4 minutes ago
    description: "HomeKit bridge for smart home devices",
    stats: {
      uptime: "12d 18h 32m",
      cpu: 18,
      memory: 28,
      customStats: {
        "Accessories": 15,
        "Active Plugins": 8,
        "HomeKit Paired": "Yes"
      }
    }
  },
  {
    id: "alby-hub",
    name: "Alby Hub",
    type: "wallet",
    ip: "192.168.1.101",
    port: 8080,
    status: "online",
    lastSeen: new Date(Date.now() - 90000), // 1.5 minutes ago
    description: "Lightning Network wallet and node management",
    stats: {
      uptime: "5d 14h 28m",
      cpu: 22,
      memory: 38,
      customStats: {
        "Channel Count": 5,
        "Local Balance": "0.05 BTC",
        "Remote Balance": "0.02 BTC"
      }
    }
  },
  {
    id: "synology-nas",
    name: "Synology NAS",
    type: "storage",
    ip: "192.168.1.105",
    port: 5000,
    status: "warning",
    lastSeen: new Date(Date.now() - 900000), // 15 minutes ago
    description: "Network attached storage - DS920+",
    stats: {
      uptime: "45d 3h 12m",
      cpu: 28,
      memory: 55,
      disk: 78,
      customStats: {
        "RAID Status": "Healthy",
        "Available Space": "4.2 TB",
        "Temperature": "42°C"
      }
    }
  }
];