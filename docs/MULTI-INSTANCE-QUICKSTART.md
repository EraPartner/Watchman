# Quick Start: Multiple Service Instances

Want to monitor multiple qBittorrent servers? Here's how in 3 steps:

## Step 1: Configure Your Instances

Edit `apps/backend/.env.local` and add:

```bash
# Make sure qbittorrent is enabled
ENABLED_SERVICES=qbittorrent

# First server
QBITTORRENT_1_URL=http://192.168.0.10:8080
QBITTORRENT_1_USERNAME=admin
QBITTORRENT_1_PASSWORD=your-password-1

# Second server
QBITTORRENT_2_URL=http://192.168.0.20:8080
QBITTORRENT_2_USERNAME=admin
QBITTORRENT_2_PASSWORD=your-password-2
```

## Step 2: Restart Backend

```bash
cd apps/backend
npm start
```

## Step 3: Check Dashboard

Open http://localhost:5173 and you'll see:

- ✅ qBittorrent #1 card
- ✅ qBittorrent #2 card

Each card shows independent stats!

## That's It! 🎉

Each instance is monitored separately with:

- Individual online/offline status
- Separate torrent counts and speeds
- Independent disk space monitoring
- Direct links to each web UI

---

**Need more instances?** Just add `QBITTORRENT_3_*`, `QBITTORRENT_4_*`, etc.

**Need help?** See `/docs/MULTI-INSTANCE-SERVICES.md` for full documentation.
