# Quick Start: Enabled Services

## TL;DR

Add this to your `.env.local` to only show specific services on the dashboard:

```env
ENABLED_SERVICES=adguard,tor,bitcoin,synology
```

Replace with the services you want to monitor. Leave empty to enable all.

## Available Service Names

**Software:**

- `adguard` - DNS/Ad blocker
- `tor` - Tor relay
- `bitcoin` - Bitcoin node
- `qbittorrent` - Torrent client
- `ipfs` - IPFS node
- `homebridge` - Apple HomeKit
- `nostrcheck` - Nostr relay
- `albyhub` - Lightning wallet

**Hardware:**

- `synology` - NAS
- `roon` - Music server
- `philips` - Hue lights
- `macmini` - Mac Mini
- `raspi` - Raspberry Pi
- `beryl` - Router
- `telenet` - Router

## Examples

**Just DNS and NAS:**

```env
ENABLED_SERVICES=adguard,synology
```

**All networking services:**

```env
ENABLED_SERVICES=adguard,tor,bitcoin,qbittorrent,beryl,telenet
```

**Media and storage:**

```env
ENABLED_SERVICES=roon,ipfs,synology,homebridge
```

**Enable everything (default):**

```env
ENABLED_SERVICES=
```

## After Changing

Restart the backend server and refresh the frontend. Cards for disabled services won't appear.

## Benefits

- 🚀 Faster dashboard (fewer cards to render)
- 📊 Cleaner UI (focus on what matters)
- 💾 Less memory (disabled services not initialized)
- 🌐 No wasted network requests
