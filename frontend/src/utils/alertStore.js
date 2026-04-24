import { supabase } from "../supabaseClient"

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

const buildAlertDetails = async (rows) => {
  const assetIds = Array.from(
    new Set((rows ?? []).map((row) => row?.asset_id).filter(Boolean))
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
    const asset = row?.asset_id ? assetsById.get(row.asset_id) : null
    const bleMacAddress = (asset?.ble_identifier || "").trim()
    const bleTag = bleMacAddress ? bleByIdentifier.get(bleMacAddress) : null

    return {
      ...row,
      ambulanceNumber: row?.vehicles?.unit_number ?? row?.vehicle_id ?? "Unknown ambulance",
      ambulanceName: row?.vehicles?.station_name ?? "",
      vehicleLabel: row?.vehicles?.unit_number ?? row?.vehicle_id ?? "Unknown ambulance",
      assetName: asset?.label || row?.asset_id || "Unknown asset",
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

  return data ? (await buildAlertDetails([data]))[0] : null
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
