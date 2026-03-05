# Drug Box Smart Tracking System  
## Database Schema Setup (Supabase)

This document describes the database schema design for the Drug Box Smart Tracking System using Supabase (PostgreSQL).

---

## 1. Extensions

The following extension is enabled:

- `pgcrypto` – Used for secure UUID generation (`gen_random_uuid()`).

---

## 2. Enum Types

Custom enumerated types were created to enforce strict state control:

- `asset_type`
  - BOX
  - POUCH

- `asset_state`
  - IN_VEHICLE
  - IN_USE
  - MISSING

- `alert_status`
  - OPEN
  - ACK
  - CLOSED

- `user_role`
  - ADMIN
  - SUPERVISOR
  - VIEWER

These enums prevent invalid state values and ensure consistency across the system.

---

## 3. Core Tables

### 3.1 vehicles
Stores fire engine units.

| Column | Description |
|---------|-------------|
| id | Primary key (UUID) |
| unit_number | Unique vehicle identifier |
| station_name | Station assignment |
| created_at | Timestamp |

---

### 3.2 assets
Stores tracked drug boxes and pouches.

| Column | Description |
|---------|-------------|
| id | Primary key |
| vehicle_id | References vehicle |
| type | BOX or POUCH |
| label | Human-readable name |
| parent_asset_id | Links pouch to box |
| is_active | Soft enable/disable |
| created_at | Timestamp |

Constraint:
- POUCH must reference a BOX as parent.

---

### 3.3 ble_tags
Maps BLE tag identifiers to assets.

| Column | Description |
|---------|-------------|
| id | Primary key |
| asset_id | Unique reference to asset |
| identifier | BLE MAC/UUID |
| tag_model | Hardware model (e.g., Minew E8) |

---

### 3.4 devices
Registers Raspberry Pi base stations.

| Column | Description |
|---------|-------------|
| id | Primary key |
| vehicle_id | One-to-one mapping |
| device_name | Human-readable label |
| api_key_hash | Stored device authentication hash |
| is_active | Device enable flag |

---

### 3.5 presence_events
Append-only audit log of tracking data.

| Column | Description |
|---------|-------------|
| id | Primary key |
| asset_id | Referenced asset |
| vehicle_id | Referenced vehicle |
| device_id | Optional device reference |
| state | IN_VEHICLE / IN_USE / MISSING |
| rssi | Signal strength |
| observed_at | Timestamp from Raspberry Pi |
| received_at | Timestamp stored in DB |

This table preserves full event history.

---

### 3.6 asset_status
Maintains the current state per asset.

| Column | Description |
|---------|-------------|
| asset_id | Primary key |
| vehicle_id | Vehicle reference |
| state | Current state |
| last_seen_at | Last detection timestamp |
| last_rssi | Last signal strength |
| updated_at | Timestamp |

This table is updated automatically via triggers.

---

### 3.7 alerts
Tracks missing asset alerts.

| Column | Description |
|---------|-------------|
| id | Primary key |
| asset_id | Referenced asset |
| vehicle_id | Referenced vehicle |
| status | OPEN / ACK / CLOSED |
| reason | Alert description |
| opened_at | When alert started |
| acknowledged_at | When acknowledged |
| closed_at | When resolved |

---

### 3.8 presence_config
Stores configurable presence rules per vehicle.

| Column | Description |
|---------|-------------|
| vehicle_id | Primary key |
| missing_timeout_seconds | Missing threshold |
| rssi_threshold | Minimum signal strength |
| updated_at | Timestamp |

Supports Strategy Pattern implementation.

---

## 4. Indexing Strategy

Indexes were created on:

- `assets.vehicle_id`
- `ble_tags.identifier`
- `presence_events.asset_id`
- `presence_events.vehicle_id`
- `alerts.status`

These indexes ensure fast lookups for:
- Dashboard queries
- Alert checks
- Event history retrieval

---

## 5. Triggers & Automation

### Trigger: `handle_presence_event()`

Executed AFTER INSERT on `presence_events`.

Automatically:
1. Upserts `asset_status`
2. Opens an alert if state = MISSING
3. Closes alert if state becomes IN_VEHICLE or IN_USE

This ensures consistent state transitions without application-side logic duplication.

---

## 6. Realtime Configuration

Supabase Realtime is enabled for:

- `asset_status`
- `alerts`

This allows the React dashboard to receive live updates without polling.

---

## Summary

The schema is designed to:

- Support real-time tracking
- Maintain full audit history
- Enforce state integrity
- Enable scalable multi-vehicle deployments
- Allow configurable rule tuning