import { useCallback, useEffect, useState } from "react"
import AlertPopup from "../components/AlertPopup"
import {
  fetchDashboardCounts,
  fetchOpenAlerts,
  fetchRecentAlerts,
} from "../utils/alertStore"
import { supabase } from "../supabaseClient"

const initialCounts = {
  activeAmbulances: 0,
  trackedBoxes: 0,
  openAlerts: 0,
  activeDevices: 0,
}

const formatDateTime = (value) => {
  if (!value) return "Just now"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Just now"
  return date.toLocaleString()
}

function LandingPage() {
  const [counts, setCounts] = useState(initialCounts)
  const [openAlerts, setOpenAlerts] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [currentAlert, setCurrentAlert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadDashboardData = useCallback(async ({ showLoading = false } = {}) => {
    try {
      if (showLoading) setLoading(true)
      setError("")

      const [dashboardCounts, alerts, recent] = await Promise.all([
        fetchDashboardCounts(),
        fetchOpenAlerts(),
        fetchRecentAlerts(4),
      ])

      setCounts(dashboardCounts)
      setOpenAlerts(alerts)
      setRecentActivity(recent)
    } catch (err) {
      console.error("Error loading dashboard data:", err)
      setError("Failed to load live dashboard data.")
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboardData({ showLoading: true })

    const channel = supabase
      .channel("landing-alerts-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          loadDashboardData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadDashboardData])

  useEffect(() => {
    if (openAlerts.length === 0) {
      setCurrentAlert(null)
      return
    }

    setCurrentAlert((prev) => {
      if (prev && openAlerts.some((alert) => alert.id === prev.id)) {
        return prev
      }

      return openAlerts[0]
    })
  }, [openAlerts])

  const openAlertsToShow = openAlerts.slice(0, 3)

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Overview of ambulance assets and system status</p>
      </div>

      {error ? <div className="dashboard-error">{error}</div> : null}

      <div className="dashboard-cards">
        <div className="dashboard-card">
          <h3>Active Ambulances</h3>
          <p className="dashboard-number">
            {loading ? "..." : counts.activeAmbulances}
          </p>
        </div>

        <div className="dashboard-card">
          <h3>Tracked Drug Boxes</h3>
          <p className="dashboard-number">
            {loading ? "..." : counts.trackedBoxes}
          </p>
        </div>

        <div className="dashboard-card">
          <h3>Open Alerts</h3>
          <p className="dashboard-number">{loading ? "..." : counts.openAlerts}</p>
        </div>

        <div className="dashboard-card">
          <h3>Base Stations Online</h3>
          <p className="dashboard-number">
            {loading ? "..." : counts.activeDevices}
          </p>
        </div>
      </div>

      <div className="dashboard-panels">
        <div className="dashboard-panel dashboard-panel-large">
          <div className="dashboard-panel-header">
            <h2>Map View</h2>
          </div>

          <div className="dashboard-panel-body">
            <div className="dashboard-map-frame">
              <iframe
                title="Ambulance Tracking Map"
                src="https://www.openstreetmap.org/export/embed.html?bbox=-112.12%2C33.36%2C-111.78%2C33.56&layer=mapnik"
                className="dashboard-map"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-header">
            <h2>Open Alerts</h2>
          </div>

          <div className="dashboard-panel-body">
            {loading ? (
              <div className="dashboard-list-item">
                <strong>Loading live alerts...</strong>
                <span>Fetching data from Supabase</span>
              </div>
            ) : openAlertsToShow.length > 0 ? (
              openAlertsToShow.map((alert) => (
                <div key={alert.id} className="dashboard-list-item">
                  <strong>{alert.reason || "Open alert"}</strong>
                  <span>
                    {alert.vehicleLabel || alert.vehicle_id || "Unknown vehicle"}
                  </span>
                </div>
              ))
            ) : (
              <div className="dashboard-list-item">
                <strong>No open alerts</strong>
                <span>All tracked alerts are resolved</span>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-panel dashboard-panel-wide">
          <div className="dashboard-panel-header">
            <h2>Recent Activity</h2>
          </div>

          <div className="dashboard-panel-body">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => (
                <div key={activity.id} className="dashboard-list-item">
                  <strong>{activity.reason || "Alert activity"}</strong>
                  <span>
                    {activity.vehicleLabel || activity.vehicle_id || "Unknown vehicle"}
                    {" • "}
                    {formatDateTime(activity.opened_at)}
                  </span>
                </div>
              ))
            ) : (
              <div className="dashboard-list-item">
                <strong>No recent activity</strong>
                <span>Live updates will appear here</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertPopup
        alert={currentAlert}
        onClose={() => setCurrentAlert(null)}
        onUpdated={loadDashboardData}
      />
    </div>
  )
}

export default LandingPage