import { supabase } from "../supabaseClient"
import apiBase from "../apiBase"

const ALERT_SELECT = `id,
  asset_id,
  vehicle_id,
  status,
  reason,
  opened_at,
  acknowledged_at,
  closed_at,
  vehicles ( unit_number, station_name )
`

const DEVICE_AUDIT_PREFIX = "Device "

const isMissingAssetAlert = (row) =>
  /\basset\b/i.test(row?.reason || "") && /\bmissing\b/i.test(row?.reason || "")

const buildAlertDetails = async (rows) => {
  const alertRows = rows ?? []
  const directAssetIds = Array.from(
    new Set(alertRows.map((row) => row?.asset_id).filter(Boolean))
  )
  const missingAlertVehicleIds = Array.from(
    new Set(
      alertRows
        .filter((row) => isMissingAssetAlert(row) && row?.vehicle_id)
        .map((row) => row.vehicle_id)
    )
  )

  const { data: missingEventsData, error: missingEventsError } =
    missingAlertVehicleIds.length
      ? await supabase
          .from("presence_events")
          .select("asset_id, vehicle_id, observed_at")
          .eq("state", "MISSING")
          .in("vehicle_id", missingAlertVehicleIds)
          .order("observed_at", { ascending: false })
      : { data: [], error: null }

  if (missingEventsError) throw missingEventsError

  const latestMissingEventByVehicleId = new Map()
  for (const event of missingEventsData ?? []) {
    if (!event?.vehicle_id || latestMissingEventByVehicleId.has(event.vehicle_id)) {
      continue
    }

    latestMissingEventByVehicleId.set(event.vehicle_id, event)
  }

  const assetIds = Array.from(
    new Set([
      ...directAssetIds,
      ...(missingEventsData ?? []).map((event) => event?.asset_id).filter(Boolean),
    ])
  )

  const { data: assetsData, error: assetsError } = assetIds.length
    ? await supabase
        .from("assets")
        .select("id, vehicle_id, label, type, ble_identifier")
        .in("id", assetIds)
    : { data: [], error: null }

  if (assetsError) throw assetsError

  const bleIdentifiers = Array.from(
    new Set(
      (assetsData ?? [])
        .map((asset) => (asset?.ble_identifier || "").trim())
        .filter(Boolean)
    )
  )

  const { data: bleTagsData, error: bleTagsError } = bleIdentifiers.length
    ? await supabase
        .from("ble_tags")
        .select("identifier, tag_model")
        .in("identifier", bleIdentifiers)
    : { data: [], error: null }

  if (bleTagsError) throw bleTagsError

  const assetsById = new Map((assetsData ?? []).map((asset) => [asset.id, asset]))
  const bleByIdentifier = new Map(
    (bleTagsData ?? []).map((tag) => [(tag?.identifier || "").trim(), tag])
  )

  return (rows ?? []).map((row) => {
    const fallbackMissingEvent = isMissingAssetAlert(row)
      ? latestMissingEventByVehicleId.get(row?.vehicle_id)
      : null
    const effectiveAssetId = assetsById.has(row?.asset_id)
      ? row.asset_id
      : fallbackMissingEvent?.asset_id
    const asset = effectiveAssetId ? assetsById.get(effectiveAssetId) : null
    const bleMacAddress = (asset?.ble_identifier || "").trim()
    const bleTag = bleMacAddress ? bleByIdentifier.get(bleMacAddress) : null

    return {
      ...row,
      ambulanceNumber: row?.vehicles?.unit_number ?? row?.vehicle_id ?? "Unknown ambulance",
      ambulanceName: row?.vehicles?.station_name ?? "",
      vehicleLabel: row?.vehicles?.unit_number ?? row?.vehicle_id ?? "Unknown ambulance",
      assetName: asset?.label || effectiveAssetId || row?.asset_id || "Unknown asset",
      assetType: asset?.type || "",
      bleName: bleTag?.tag_model || "",
      bleMacAddress,
      title: row?.reason ?? "Alert",
      description: row?.reason ?? "",
    }
  })
}

const fetchAlerts = async (queryBuilder) => {
  let query = supabase.from("alerts").select(ALERT_SELECT)
  query = queryBuilder(query)

  const { data, error } = await query

  if (error) throw error

  return buildAlertDetails(data ?? [])
}

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
  return fetchAlerts((query) =>
    query.eq("status", "OPEN").order("opened_at", { ascending: false })
  )
}

export const fetchRecentAlerts = async (limit = 4) => {
  return fetchAlerts((query) =>
    query.order("opened_at", { ascending: false }).limit(limit)
  )
}

export const fetchAlertHistory = async () => {
  return fetchAlerts((query) =>
    query.order("opened_at", { ascending: false })
  )
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

const buildStatusUpdate = (status) => {
  const now = new Date().toISOString()

  if (status === "OPEN") {
    return {
      status: "OPEN",
      acknowledged_at: null,
      closed_at: null,
    }
  }

  if (status === "ACK") {
    return {
      status: "ACK",
      acknowledged_at: now,
      closed_at: null,
    }
  }

  if (status === "CLOSED") {
    return {
      status: "CLOSED",
      acknowledged_at: now,
      closed_at: now,
    }
  }

  return { status }
}

const updateAlertStatusViaSupabase = async (id, status) => {
  const { data: existingAlert, error: fetchError } = await supabase
    .from("alerts")
    .select("id, status")
    .eq("id", id)
    .maybeSingle()

  if (fetchError) throw fetchError
  if (!existingAlert) throw new Error("Alert was not found.")
  if (existingAlert.status === "CLOSED" && status !== "CLOSED") {
    throw new Error("Resolved alerts cannot be moved back to another status.")
  }

  const { data, error } = await supabase
    .from("alerts")
    .update(buildStatusUpdate(status))
    .eq("id", id)
    .select(ALERT_SELECT)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("Alert status did not update. No row was returned.")
  if (data.status !== status) {
    throw new Error(`Alert status did not update. Expected ${status}, found ${data.status || "EMPTY"}.`)
  }

  return (await buildAlertDetails([data]))[0]
}

export const updateAlertStatus = async (id, status) => {
  let response

  try {
    response = await fetch(`${apiBase}/api/alerts/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    })
  } catch {
    return updateAlertStatusViaSupabase(id, status)
  }

  const json = await response.json().catch(() => ({}))

  if (response.status === 404 || response.status === 405) {
    return updateAlertStatusViaSupabase(id, status)
  }

  if (!response.ok) {
    throw new Error(json?.detail || json?.message || "Failed to update alert status")
  }

  if (!json?.data) throw new Error("Alert status did not update. No row was returned.")
  if (json.data.status !== status) {
    throw new Error(`Alert status did not update. Expected ${status}, found ${json.data.status || "EMPTY"}.`)
  }

  return (await buildAlertDetails([json.data]))[0]
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

  return data ? (await buildAlertDetails([data]))[0] : null
}

export const addAlert = async (alert) => createAlert(alert)

export const getAlerts = async () => fetchOpenAlerts()
