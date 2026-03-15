function LandingPage() {
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

    </div>
  )
}

export default LandingPage