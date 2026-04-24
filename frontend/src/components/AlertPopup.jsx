import { createPortal } from "react-dom"

const AlertPopup = ({ alert, onClose }) => {
  if (!alert) return null

  const title = alert.reason || alert.title || "Alert"
  const ambulanceNumber = alert.ambulanceNumber || alert.vehicleLabel || "Unknown ambulance"
  const ambulanceName = alert.ambulanceName || "Not available"
  const assetName = alert.assetName || "Unknown asset"
  const bleName = alert.bleName || "Not available"
  const bleMacAddress = alert.bleMacAddress || "Not available"
  const openedAt = alert.opened_at
    ? new Date(alert.opened_at).toLocaleString()
    : "Not available"

  const popupContent = (
    <div style={styles.overlay}>
      <div style={styles.popup}>
        <div style={styles.badge}>Active Alert</div>
        <h3 style={styles.heading}>{title}</h3>
        <p style={styles.subtitle}>
          Review the ambulance and BLE assignment details below.
        </p>

        <div style={styles.detailsGrid}>
          <div style={styles.detailCard}>
            <span style={styles.detailLabel}>Ambulance Number</span>
            <span style={styles.detailValue}>{ambulanceNumber}</span>
          </div>
          <div style={styles.detailCard}>
            <span style={styles.detailLabel}>Ambulance Name</span>
            <span style={styles.detailValue}>{ambulanceName}</span>
          </div>
          <div style={styles.detailCard}>
            <span style={styles.detailLabel}>Asset Name</span>
            <span style={styles.detailValue}>{assetName}</span>
          </div>
          <div style={styles.detailCard}>
            <span style={styles.detailLabel}>BLE Name</span>
            <span style={styles.detailValue}>{bleName}</span>
          </div>
          <div style={styles.detailCardWide}>
            <span style={styles.detailLabel}>BLE MAC Address</span>
            <span style={styles.monoValue}>{bleMacAddress}</span>
          </div>
          <div style={styles.detailCardWide}>
            <span style={styles.detailLabel}>Status</span>
            <span style={styles.statusValue}>
              {alert.status || "OPEN"} • Opened {openedAt}
            </span>
          </div>
        </div>

        <button onClick={onClose} style={styles.okButton}>
          OK
        </button>
      </div>
    </div>
  )

  return createPortal(popupContent, document.body)
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(15, 23, 42, 0.48)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    padding: "20px",
  },
  popup: {
    width: "min(560px, 100%)",
    background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    padding: "28px",
    borderRadius: "24px",
    border: "1px solid rgba(148, 163, 184, 0.22)",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.22)",
    color: "#0f172a",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "#fee2e2",
    color: "#b91c1c",
    fontSize: "12px",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  heading: {
    margin: "16px 0 10px",
    fontSize: "28px",
    lineHeight: 1.1,
    fontWeight: 800,
  },
  subtitle: {
    margin: "0 0 20px",
    color: "#475569",
    fontSize: "14px",
    lineHeight: 1.6,
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
  },
  detailCard: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "16px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #dbeafe",
    boxShadow: "0 10px 30px rgba(37, 99, 235, 0.08)",
  },
  detailCardWide: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "16px",
    borderRadius: "18px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
  },
  detailLabel: {
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#64748b",
  },
  detailValue: {
    fontSize: "17px",
    fontWeight: 700,
    color: "#0f172a",
  },
  monoValue: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#0f172a",
    fontFamily: "Consolas, Monaco, monospace",
    wordBreak: "break-word",
  },
  statusValue: {
    fontSize: "15px",
    fontWeight: 700,
    color: "#1d4ed8",
  },
  okButton: {
    marginTop: "22px",
    width: "100%",
    padding: "14px 18px",
    border: "none",
    borderRadius: "16px",
    background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 14px 30px rgba(185, 28, 28, 0.3)",
  },
}

export default AlertPopup
