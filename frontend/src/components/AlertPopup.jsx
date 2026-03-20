import React from "react";

const AlertPopup = ({ alert, onClose }) => {
  if (!alert) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.popup}>
        <h3 style={{ marginBottom: "10px" }}>🚨 Alert</h3>
        <p><strong>{alert.title}</strong></p>
        <p style={{ margin: "10px 0", color: "#555" }}>
          {alert.description}
        </p>

        <button onClick={onClose} style={styles.button}>
          OK
        </button>
      </div>
    </div>
  );
};

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
  button: {
    marginTop: "15px",
    padding: "8px 20px",
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  },
};

export default AlertPopup;