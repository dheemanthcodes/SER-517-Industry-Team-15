import React, { useState } from "react"
import { updateAlertStatus } from "../utils/alertStore"

const AlertPopup = ({ alert, onClose, onUpdated }) => {
  const [loading, setLoading] = useState(false)

  if (!alert) return null

  const title = alert.reason || alert.title || "Alert"
  const vehicleLine = alert.vehicleLabel
    ? `Vehicle: ${alert.vehicleLabel}`
    : alert.vehicle_id
      ? `Vehicle: ${alert.vehicle_id}`
      : null
  const assetLine = alert.asset_id ? `Asset: ${alert.asset_id}` : null

  const handleAction = async (status) => {
    setLoading(true)
    try {
      await updateAlertStatus(alert.id, status)
      onUpdated?.()
      onClose?.()
    } catch (error) {
      console.error(`Error updating alert to ${status}:`, error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.popup}>
        <h3 style={{ marginBottom: "10px" }}>🚨 Alert</h3>

        <p style={{ fontWeight: 700, marginBottom: "10px" }}>{title}</p>

        {vehicleLine ? (
          <p style={{ margin: "6px 0", color: "#555" }}>{vehicleLine}</p>
        ) : null}

        {assetLine ? (
          <p style={{ margin: "6px 0", color: "#555" }}>{assetLine}</p>
        ) : null}

        <p style={{ margin: "10px 0", color: "#777", fontSize: "14px" }}>
          Status: {alert.status || "OPEN"}
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
          <button
            onClick={() => handleAction("ACK")}
            style={styles.ackButton}
            disabled={loading}
          >
            {loading ? "..." : "Acknowledge"}
          </button>

          <button
            onClick={() => handleAction("CLOSED")}
            style={styles.closeButton}
            disabled={loading}
          >
            {loading ? "..." : "Close"}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  popup: {
    background: "#fff",
    padding: "20px 30px",
    borderRadius: "10px",
    width: "350px",
    textAlign: "center",
    boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
  },
  ackButton: {
    marginTop: "15px",
    padding: "8px 16px",
    background: "#f59e0b",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  },
  closeButton: {
    marginTop: "15px",
    padding: "8px 16px",
    background: "#10b981",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  },
}

export default AlertPopup