import { useEffect, useState } from "react";
import AlertPopup from "../components/AlertPopup";

function LandingPage() {
  const [alertsQueue, setAlertsQueue] = useState([]);
  const [currentAlert, setCurrentAlert] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const mockAlerts = [
        {
          id: 1,
          title: "Drug box moved out of ambulance",
          description: "Ambulance 888",
        },
        {
          id: 2,
          title: "Base station connection lost",
          description: "Ambulance 264",
        },
      ];

      setAlertsQueue(mockAlerts);
      setCurrentAlert(mockAlerts[0]);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleCloseAlert = () => {
    const remaining = alertsQueue.slice(1);
    setAlertsQueue(remaining);
    setCurrentAlert(remaining[0] || null);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Overview of ambulance assets and system status</p>
      </div>

      <div className="dashboard-cards">
        <div className="dashboard-card">
          <h3>Active Ambulances</h3>
          <p className="dashboard-number">12</p>
        </div>

        <div className="dashboard-card">
          <h3>Tracked Drug Boxes</h3>
          <p className="dashboard-number">28</p>
        </div>

        <div className="dashboard-card">
          <h3>Open Alerts</h3>
          <p className="dashboard-number">3</p>
        </div>

        <div className="dashboard-card">
          <h3>Base Stations Online</h3>
          <p className="dashboard-number">5 / 6</p>
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
            <div className="dashboard-list-item">
              <strong>Drug box out of range</strong>
              <span>Ambulance 201</span>
            </div>
            <div className="dashboard-list-item">
              <strong>Base station offline</strong>
              <span>Station 3</span>
            </div>
            <div className="dashboard-list-item">
              <strong>Battery low</strong>
              <span>Beacon Tag 17</span>
            </div>
          </div>
        </div>

        <div className="dashboard-panel dashboard-panel-wide">
          <div className="dashboard-panel-header">
            <h2>Recent Activity</h2>
          </div>
          <div className="dashboard-panel-body">
            <div className="dashboard-list-item">
              <strong>Ambulance 102 checked in</strong>
              <span>2 mins ago</span>
            </div>
            <div className="dashboard-list-item">
              <strong>Drug box linked successfully</strong>
              <span>8 mins ago</span>
            </div>
            <div className="dashboard-list-item">
              <strong>Inventory sync completed</strong>
              <span>15 mins ago</span>
            </div>
            <div className="dashboard-list-item">
              <strong>Alert acknowledged by operator</strong>
              <span>22 mins ago</span>
            </div>
          </div>
        </div>
      </div>

      {/* ALERT POPUP */}
      <AlertPopup alert={currentAlert} onClose={handleCloseAlert} />
    </div>
  );
}

export default LandingPage;