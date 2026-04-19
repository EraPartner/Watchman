---
title: Service History API
type: api
status: active
date: 2026-04-18
tags: [api, endpoints, timeseries, history, backend, fastify]
description: Time-series history endpoint documentation - query historical metrics for services
aliases: [history endpoint, time-series API, metrics history, service history]
---

# Service History API

> [!abstract] Overview
> The **History endpoint** provides time-series data for service metrics. Query by service kind, metric name, and time range; the API auto-selects an appropriate resolution tier (raw, 1m, 5m, 1h) based on window size.

## Endpoint

```
GET /services/{kind}/history
```

**Base URL**: `http://localhost:3101` (development)

**Response Format**: Standard [[docs/api/index#response-envelope|API response envelope]]

## Request Parameters

### Path Parameters

| Parameter | Type     | Required | Description          |
| --------- | -------- | -------- | -------------------- |
| `kind`    | string   | Yes      | Service kind (e.g., `bitcoin`, `ipfs`, `adguard`) |

### Query Parameters

| Parameter    | Type           | Required | Description                                                                                      | Example                  |
| ------------ | -------------- | -------- | ------------------------------------------------------------------------------------------------ | ------------------------ |
| `metric`     | string         | Yes      | Metric name to query (must exist in service stats)                                               | `block_height`, `peer_count` |
| `from`       | number\|string | Yes      | Start timestamp (epoch ms or RFC3339 string)                                                     | `1713446400000` or `2026-04-18T12:00:00Z` |
| `to`         | number\|string | Yes      | End timestamp (epoch ms or RFC3339 string); must be after `from`                                 | `1713450000000` or `2026-04-18T13:00:00Z` |
| `instance`   | string         | No       | Instance ID; omit to use first registered instance                                              | `main`, `secondary` |
| `resolution` | enum           | No       | Data resolution tier: `raw`, `1m`, `5m`, `1h`. Omit for auto-selection based on window size     | `1m`            |
| `agg`        | enum           | No       | Aggregation function for rollup tiers (ignored for `raw`): `avg`, `min`, `max`, `last`          | `avg`           |
| `limit`      | number         | No       | Max number of data points to return (1–20000); default 20000                                     | `1000`          |

### Auto-Resolution Logic

If `resolution` is omitted, the endpoint automatically selects a tier based on the time window:

| Window Duration  | Selected Resolution | Retention       |
| ---------------- | ------------------- | --------------- |
| ≤ 1 hour         | `raw`               | 6 hours         |
| ≤ 24 hours       | `1m` (1 minute avg) | 48 hours        |
| ≤ 7 days         | `5m` (5 minute avg) | 14 days         |
| > 7 days         | `1h` (1 hour avg)   | 30 days         |

## Constraints

- **Max window**: 30 days (259,200,000 ms) — requests spanning > 30 days are rejected with `VALIDATION` error.
- **Max limit**: 20,000 points.
- **Min window**: > 0 (required: `from < to`).

## Response Format

### Success (200 OK)

```json
{
  "data": {
    "kind": "bitcoin",
    "instance": "main",
    "metric": "block_height",
    "resolution": "1m",
    "points": [
      { "t": 1713446400000, "v": 835000, "min": 834999, "max": 835000 },
      { "t": 1713446460000, "v": 835001, "min": 835000, "max": 835001 }
    ]
  }
}
```

### Response Schema

| Field        | Type              | Description                                                 |
| ------------ | ----------------- | ----------------------------------------------------------- |
| `kind`       | string            | Service kind (echoed from request)                          |
| `instance`   | string \| null    | Instance ID (null if not specified in request)              |
| `metric`     | string            | Metric name (echoed from request)                           |
| `resolution` | enum              | Actual resolution used (`raw`, `1m`, `5m`, `1h`)            |
| `points`     | array             | Array of HistoryPoint objects (sorted by timestamp ASC)     |

#### HistoryPoint Object

| Field  | Type            | Description                                      |
| ------ | --------------- | ------------------------------------------------ |
| `t`    | number          | Timestamp (epoch milliseconds)                   |
| `v`    | number \| null  | Primary value (for `raw`: value_num; for rollup: selected agg) |
| `min`  | number \| null  | Min value in bucket (rollup tiers only; null for `raw`) |
| `max`  | number \| null  | Max value in bucket (rollup tiers only; null for `raw`) |

### Error Responses

#### 400 Bad Request (VALIDATION)

Triggers include:
- Missing `metric` query parameter
- Missing, unparseable, or invalid `from`/`to`
- `from >= to`
- Time window exceeds 30 days
- Invalid `resolution` (not one of raw/1m/5m/1h)
- Invalid `agg` (not one of avg/min/max/last)
- Invalid `limit` (non-numeric or ≤ 0)

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "range exceeds 30 days"
  }
}
```

#### 404 Not Found (NOT_FOUND)

- Service kind is not registered
- Instance ID does not exist for the kind

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "no instances for kind: invalidservice"
  }
}
```

## Examples

### Query last 1 hour of raw data (auto-resolution)

```bash
curl -X GET 'http://localhost:3101/services/bitcoin/history?metric=block_height&from=1713446400000&to=1713450000000'
```

**Request**: 1 hour window → auto-selects `raw` resolution.

### Query 24 hours with explicit 1m resolution and min aggregation

```bash
curl -X GET 'http://localhost:3101/services/bitcoin/history?metric=block_height&from=1713360000000&to=1713446400000&resolution=1m&agg=min&instance=main'
```

### Query 7 days with 5m resolution, limit to 500 points

```bash
curl -X GET 'http://localhost:3101/services/ipfs/history?metric=peer_count&from=1713100800000&to=1713705600000&resolution=5m&limit=500'
```

## Implementation

- **Route**: [[apps/backend/src/transport/http/routes/history.ts|routes/history.ts]]
- **Use Case**: [[apps/backend/src/application/GetServiceHistory.ts|GetServiceHistory.ts]]
- **Reader**: [[apps/backend/src/infra/timeseries/TimeSeriesReader.ts|TimeSeriesReader.ts]]
- **OpenAPI Spec**: [[apps/backend/openapi.yaml#L107|/services/{kind}/history]]

## Notes

- **Timestamp format**: Unix epoch milliseconds (not seconds). Use `Date.now()` or `new Date().getTime()` in JavaScript.
- **Parsing**: The endpoint accepts both numeric epoch ms and RFC3339 ISO strings for `from`/`to`.
- **No aggregation for raw**: When querying `raw` resolution, the `agg` parameter is ignored; only `value_num` is returned.
- **Null values**: Metrics with no numeric value (e.g., unset or non-numeric) return `v: null` in points.
- **Ordering**: Points are always sorted by timestamp ascending.

## Related

- [[docs/features/time-series-history|Time-Series Feature]]
- [[docs/adr/014-time-series-duckdb-and-bento-design-system|ADR-014: Time-Series + Bento]]
- [[docs/api/index|API Index]]
