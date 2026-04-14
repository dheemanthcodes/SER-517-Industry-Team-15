import { supabase } from "../supabaseClient"

const ALERT_SELECT = `
  id,
  asset_id,
  vehicle_id,
  status,
  reason,
  opened_at,
  acknowledged_at,
  closed_at,
  vehicles ( unit_number )
`

const DEVICE_AUDIT_PREFIX = "Device "

const normalizeAlert = (row) => ({
  ...row,
  vehicleLabel: row?.vehicles?.unit_number ?? row?.vehicle_id ?? "Unknown vehicle",
  title: row?.reason ?? "Alert",
  description: row?.reason ?? "",
})

export const isDeviceAuditAlert = (alert) =>
  (alert?.reason || "").startsWith(DEVICE_AUDIT_PREFIX)

export const isPopupEligibleAlert = (alert) => !isDeviceAuditAlert(alert)

const fetchCount = async (table, buildQuery = (query) => query) => {
  let query = supabase.from(table).select("id", { count: "exact", head: true })
  query = buildQuery(query)

  const { count, error } = await query
  if (error) throw error

  return count ?? 0
}

export const fetchOpenAlerts = async () => {
  const { data, error } = await supabase
    .from("alerts")
    .select(ALERT_SELECT)
    .eq("status", "OPEN")
    .order("opened_at", { ascending: false })

  if (error) throw error

  return (data ?? []).map(normalizeAlert)
}

export const fetchRecentAlerts = async (limit = 4) => {
  const { data, error } = await supabase
    .from("alerts")
    .select(ALERT_SELECT)
    .order("opened_at", { ascending: false })
    .limit(limit)

  if (error) throw error

  return (data ?? []).map(normalizeAlert)
}

export const fetchAlertHistory = async () => {
  const { data, error } = await supabase
    .from("alerts")
    .select(ALERT_SELECT)
    .order("opened_at", { ascending: false })

  if (error) throw error

  return (data ?? []).map(normalizeAlert)
}

export const fetchDashboardCounts = async () => {
  const [activeAmbulances, trackedBoxes, openAlerts, activeDevices] =
    await Promise.all([
      fetchCount("vehicles"),
      fetchCount("assets", (query) =>
        query
          .eq("type", "BOX")
          .not("vehicle_id", "is", null)
      ),
      fetchCount("alerts", (query) => query.eq("status", "OPEN")),
      fetchCount("devices", (query) => query.eq("is_active", true)),
    ])

  return {
    activeAmbulances,
    trackedBoxes,
    openAlerts,
    activeDevices,
  }
}

export const updateAlertStatus = async (id, status) => {
  const now = new Date().toISOString()
  const update = { status }

  if (status === "ACK") {
    update.acknowledged_at = now
  }

  if (status === "CLOSED") {
    update.closed_at = now
  }

  const { data, error } = await supabase
    .from("alerts")
    .update(update)
    .eq("id", id)
    .select(ALERT_SELECT)
    .maybeSingle()

  if (error) throw error

  return data ? normalizeAlert(data) : null
}

export const createAlert = async (alert) => {
  const payload = {
    asset_id: alert?.asset_id ?? null,
    vehicle_id: alert?.vehicle_id ?? null,
    status: "OPEN",
    reason: alert?.reason ?? alert?.description ?? null,
    opened_at: alert?.opened_at ?? new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("alerts")
    .insert(payload)
    .select(ALERT_SELECT)
    .maybeSingle()

  if (error) throw error

  return data ? normalizeAlert(data) : null
}

export const addAlert = async (alert) => createAlert(alert)

export const getAlerts = async () => fetchOpenAlerts()
