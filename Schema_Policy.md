# Drug Box Smart Tracking System  
## Database Security, RLS and Policy Design

This document describes the security architecture of the Supabase database.

---

## 1. Row Level Security (RLS)

RLS is enabled on all tables:

- vehicles
- assets
- ble_tags
- devices
- presence_events
- asset_status
- alerts
- presence_config
- profiles

RLS ensures that access is explicitly granted via policies.

---

## 2. Authentication Model

The system uses:

- Supabase Auth for user authentication
- A `profiles` table for role-based access control
- Backend service-role access for telemetry ingestion

---

## 3. Device Authentication

- Raspberry Pi devices authenticate at the ingestion API layer.
- Devices use a unique API key.
- Only the backend (service role) can insert into `presence_events`.
- No direct client-side inserts are allowed.

This prevents spoofed telemetry.

---

## 4. Role-Based Access Control (RBAC)

User roles:

- ADMIN
- SUPERVISOR
- VIEWER

Policies are enforced via:

- `profiles` table
- Helper function: `is_admin_or_supervisor()`

Permissions:

| Role | Read | Update Alerts | Update Config |
|-------|------|--------------|---------------|
| ADMIN | Yes | Yes | Yes |
| SUPERVISOR | Yes | Yes | Yes |
| VIEWER | Yes | No | No |

---

## 5. Read Policies

Authenticated users can read:

- vehicles
- assets
- asset_status
- alerts
- presence_events
- presence_config

Future improvement:
- Restrict by `station_name` if needed.

---

## 6. Write Restrictions

The following tables do NOT allow client inserts/updates:

- presence_events
- asset_status
- vehicles
- assets

These tables are only written by:
- Backend service role
- Database triggers

This prevents malicious manipulation of tracking data.

---

## 7. Alert Update Policy

Supervisors and Admins can:

- ACK alerts
- CLOSE alerts

Enforced via RLS policy:
public.is_admin_or_supervisor()
---

## 8. Configuration Update Policy

Only Admins and Supervisors can update:

- missing_timeout_seconds
- rssi_threshold

Prevents unauthorized tuning of detection rules.

---

## 9. Encryption & Transport Security

- All communication uses HTTPS (TLS encryption).
- Supabase manages encryption at rest.
- No sensitive data is transmitted over BLE (only identifiers).

---

## 10. Production Security Posture

The database design ensures:

- Telemetry integrity
- Role-based data access
- Append-only event history
- Secure device authentication
- Controlled administrative privileges

This architecture supports safe deployment in operational emergency-response environments.