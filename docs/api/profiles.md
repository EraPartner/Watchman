---
title: Profiles API Reference
type: api
status: active
date: 2026-06-13
tags: [api, profiles, network-auto-switch, active-profile, endpoints, rest]
description: REST API reference for the /profiles endpoints — profile CRUD, active-profile switching, auto-switch settings, LAN network signature capture, and per-service profile assignment.
aliases: [profiles api, profile endpoints, network auto-switch api]
---

# Profiles API Reference

> [!abstract] Overview
> The Profiles API manages named per-location service sets and the server-authoritative active profile. It also surfaces the current LAN network signature and allows assigning a LAN to a profile for automatic switching.
>
> **Base URL**: `http://localhost:3001`
>
> **Auth**: None required (single-user home-lab design). See [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]].
>
> **Response Format**: Standard [[docs/api/index|API response envelope]]
>
> **Feature**: [[docs/features/profiles|Service Profiles and Network Auto-Switch]]

## Profile Object

All profile responses return objects conforming to:

```typescript
{
  id: string;           // UUID
  name: string;         // User-facing name (e.g. "Home", "Office")
  description?: string; // Optional description
  color?: string;       // Optional color label (CSS color string)
  networkSigs: string[]; // Captured gateway MACs for auto-switch
  serviceCount: number; // Count of services assigned to this profile
  isActive: boolean;    // Whether this is the currently active profile
  createdAt: number;    // Epoch ms
  updatedAt: number;    // Epoch ms
}
```

---

## Endpoints

### List Profiles

#### `GET /profiles`

Return all profiles with `serviceCount` and `isActive` enrichment.

**Response:**

```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "name": "Home",
      "description": "Home lab",
      "color": "#4ade80",
      "networkSigs": ["aa:bb:cc:dd:ee:ff"],
      "serviceCount": 8,
      "isActive": true,
      "createdAt": 1749808800000,
      "updatedAt": 1749808800000
    },
    {
      "id": "e5f6a7b8-...",
      "name": "Office",
      "description": null,
      "color": null,
      "networkSigs": [],
      "serviceCount": 3,
      "isActive": false,
      "createdAt": 1749808900000,
      "updatedAt": 1749808900000
    }
  ]
}
```

---

### Create Profile

#### `POST /profiles`

Create a new profile.

**Request Body:**

```json
{
  "name": "Office",
  "description": "Work network",
  "color": "#60a5fa"
}
```

**Request Schema:**

```typescript
{
  name: string;          // Required; unique
  description?: string;
  color?: string;
}
```

**Response:** The created profile object.

**Error Codes:**

- `400 VALIDATION` — Missing or invalid fields
- `409 CONFLICT` — Profile with this name already exists

---

### Get Profile

#### `GET /profiles/:id`

Fetch a single profile by UUID.

**Response:** Single profile object.

**Error Codes:**

- `404 NOT_FOUND` — Profile not found

---

### Update Profile

#### `PUT /profiles/:id`

Update a profile's name, description, or color. Partial updates — omit any field to leave it unchanged.

**Request Body:**

```json
{
  "name": "Home Lab",
  "color": "#f97316"
}
```

**Response:** Updated profile object.

**Error Codes:**

- `400 VALIDATION` — Invalid fields
- `404 NOT_FOUND` — Profile not found
- `409 CONFLICT` — Name conflicts with another profile

---

### Delete Profile

#### `DELETE /profiles/:id`

Delete a profile. Returns `409 Conflict` when the invariants would be violated.

**Response:**

```json
{ "data": null }
```

**Error Codes:**

| Code        | HTTP | Condition                                 |
| ----------- | ---- | ----------------------------------------- |
| `NOT_FOUND` | 404  | Profile does not exist                    |
| `CONFLICT`  | 409  | Profile is currently active               |
| `CONFLICT`  | 409  | Profile has one or more services assigned |
| `CONFLICT`  | 409  | This is the last remaining profile        |

> [!warning] Delete invariants
> A profile cannot be deleted while active, non-empty, or the last one. Move or delete its services first, then manually switch to a different profile.

---

### Get Active Profile

#### `GET /profiles/active`

Return the currently active profile.

**Response:**

```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "name": "Home",
    "isActive": true,
    ...
  }
}
```

---

### Switch Active Profile (Manual Override)

#### `PUT /profiles/active`

Manually set the active profile. This persists the choice as the new active id. Because the gateway MAC has not changed, `NetworkWatcher` will not override this selection on its next tick — the override sticks until the LAN actually changes.

**Request Body:**

```json
{
  "profileId": "e5f6a7b8-..."
}
```

**Response:** The newly active profile object.

**Error Codes:**

- `404 NOT_FOUND` — Profile not found

> [!info] Override semantics
> Auto-switch fires only when the detected gateway MAC **changes**. A manual switch here will not be reversed until the user moves to a different network and back.

---

### Update Auto-Switch Settings

#### `PUT /profiles/settings`

Enable or disable automatic profile switching on LAN change.

**Request Body:**

```json
{
  "autoSwitch": true
}
```

**Response:**

```json
{
  "data": {
    "autoSwitch": true
  }
}
```

---

### Get Current Network Signature

#### `GET /profiles/current-network`

Return the LAN signature that the backend currently detects (gateway MAC) and which profile it matches, if any.

**Response:**

```json
{
  "data": {
    "signature": {
      "gatewayMac": "aa:bb:cc:dd:ee:ff"
    },
    "matchedProfileId": "a1b2c3d4-..."
  }
}
```

When `matchedProfileId` is `null`, no profile has captured this MAC. The frontend shows a one-click assign hint.

> [!tip] Gateway detection unavailable
> If `gatewayDetect` cannot resolve the gateway (e.g. sandbox, no `ip`/`route`/`arp`), `signature` will be `null`.

---

### Capture Network to Profile

#### `POST /profiles/:id/capture-network`

Assign the current LAN's gateway MAC to a profile's `networkSigs` list. Used from the "unrecognized network" hint in the UI for one-click capture.

**Request Body:** None — the current detected MAC is resolved server-side.

**Response:** Updated profile object.

**Error Codes:**

- `404 NOT_FOUND` — Profile not found
- `422 UNPROCESSABLE` — Gateway MAC could not be detected

---

## Service Profile Endpoints

These endpoints live under `/config/services` but are profile-related.

### Move Service to Profile

#### `PUT /config/services/:id/profile`

Reassign a service instance to a different profile. The service is immediately subject to the new profile's lifecycle gate — if the target profile is not active, the service is torn down.

**Path Parameters:**

| Param | Description                           |
| ----- | ------------------------------------- |
| `id`  | `{kind}:{instanceId}` or service UUID |

**Request Body:**

```json
{
  "profileId": "e5f6a7b8-..."
}
```

**Response:**

```json
{ "data": null }
```

**Error Codes:**

- `404 NOT_FOUND` — Service or profile not found
- `400 VALIDATION` — Missing `profileId`

---

### `POST /config/services` — `profileId` field

When creating a new service, an optional `profileId` may be specified. If omitted, the service is assigned to the currently active profile.

```json
{
  "kind": "bitcoin",
  "instanceId": "home",
  "enabled": true,
  "profileId": "a1b2c3d4-...",
  "onionUrl": "http://example.onion",
  "rpcUser": "user",
  "rpcPassword": "pass"
}
```

---

### `GET /config/services` — `profileId` field

All service objects returned by `/config/services` now include a `profileId` field:

```json
{
  "data": [
    {
      "id": "bitcoin:home",
      "kind": "bitcoin",
      "profileId": "a1b2c3d4-...",
      "enabled": true,
      ...
    }
  ]
}
```

---

## WebSocket Events

Two new WebSocket frame types are emitted by the Broadcaster when profile state changes. The frontend handles them in [[apps/frontend/src/hooks/useWebSocket.ts]].

### `profile_switched`

Emitted after the active profile changes (either auto or manual).

```json
{
  "type": "profile_switched",
  "profileId": "a1b2c3d4-...",
  "name": "Home",
  "reason": "auto"
}
```

`reason` is `"auto"` (NetworkWatcher) or `"manual"` (PUT /profiles/active).

### `profile_network_unrecognized`

Emitted when `NetworkWatcher` detects a gateway MAC that matches no profile.

```json
{
  "type": "profile_network_unrecognized",
  "signature": {
    "gatewayMac": "11:22:33:44:55:66"
  }
}
```

The frontend displays an "Assign this network?" hint in the Profile Switcher.

---

## Example Workflows

### Create a Profile and Assign a Service

```bash
# Create the profile
curl -X POST http://localhost:3001/profiles \
  -H "Content-Type: application/json" \
  -d '{"name":"Office","color":"#60a5fa"}'

# Move a service into it
curl -X PUT http://localhost:3001/config/services/bitcoin:main/profile \
  -H "Content-Type: application/json" \
  -d '{"profileId":"<new-profile-id>"}'
```

### Switch to the Office Profile

```bash
curl -X PUT http://localhost:3001/profiles/active \
  -H "Content-Type: application/json" \
  -d '{"profileId":"<office-profile-id>"}'
```

### Capture the Current Network to a Profile

```bash
curl -X POST http://localhost:3001/profiles/<home-profile-id>/capture-network
```

### Enable Auto-Switch

```bash
curl -X PUT http://localhost:3001/profiles/settings \
  -H "Content-Type: application/json" \
  -d '{"autoSwitch":true}'
```

---

## Related Documentation

- [[docs/features/profiles|Service Profiles Feature]] — Full feature description
- [[docs/adr/027-service-profiles-and-network-auto-switch|ADR-027]] — Architecture decision
- [[docs/api/index|API Overview]] — Response envelope, error codes
- [[docs/api/config|Configuration API]] — Service instance CRUD
- [[apps/backend/openapi.yaml|OpenAPI Spec]] — Authoritative schema definitions
- [[apps/backend/src/transport/http/routes/profiles.ts]]
- [[apps/backend/src/config/store/ProfileStore.ts]]
