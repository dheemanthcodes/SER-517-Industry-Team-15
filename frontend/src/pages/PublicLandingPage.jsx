function PublicLandingPage({ onLoginClick, onSignUpClick }) {
  return (
    <div className="public-landing">
      
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-logo-text">
            <span className="logo-ambulance">AMBULANCE</span>
            <span className="logo-asset">ASSETTRACKER</span>
          </div>
          <div className="header-buttons">
            <button className="btn-secondary" onClick={onLoginClick}>
              Login
            </button>
            <button className="btn-primary" onClick={onSignUpClick}>
              Sign up
            </button>
          </div>
        </div>
      </header>

      <section className="landing-hero" id="home">
        <div className="hero-inner">
          <div className="hero-content">
            <h1 className="hero-title">
              Modernizing Asset Control for Emergency Medical Services
            </h1>
            <p className="hero-desc">
              Securely track drug boxes and narcotics pouches across ambulances using BLE association, GPS monitoring, and automated charging. Designed for frontline reliability.
            </p>
            <div className="hero-buttons">
              <button className="btn-secondary" onClick={onLoginClick}>
                Login
              </button>
              <button className="btn-primary" onClick={onSignUpClick}>
                Sign up
              </button>
            </div>
          </div>
          <div className="hero-image-wrap">
            <img
              src="/AssetTracking.png"
              alt="Officer using asset tracking system for drug box and narcotics"
              className="hero-image"
            />
          </div>
        </div>
      </section>

      <section className="landing-features">
        <div className="features-inner">
          <div className="feature-card">
            <div className="feature-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            </div>
            <h3 className="feature-title">Real Time Location Monitoring</h3>
            <p className="feature-desc">
              Full GPS fleet-wide visibility. Monitor the exact location of high-value assets across multiple stations and mobile units in real-time.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>
            </div>
            <h3 className="feature-title">BLE Based Pouch Association</h3>
            <p className="feature-desc">
              Automated pairing of narcotics pouches to specific vehicles. Immediate alerts if a controlled substance pouch leaves the designated radius.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-enterprise">
        <div className="enterprise-inner">
          <h2 className="enterprise-title">
            Enterprise Management for High-Stakes Operations
          </h2>
          <p className="enterprise-desc">
            Our platform is engineered to meet the rigorous demands of public safety compliance and asset security.
          </p>
          <ul className="enterprise-list">
            <li>
              <span className="check-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
              Reduce compliance risk and regulatory overhead
            </li>
            <li>
              <span className="check-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
              Improve end-to-end chain of custody visibility
            </li>
            <li>
              <span className="check-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></span>
              Eliminate manual tracking errors and paperwork lag
            </li>
          </ul>
        </div>
      </section>

  
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-left">
            <div className="landing-logo-text footer-logo">
              <span className="logo-ambulance">AMBULANCE</span>
              <span className="logo-asset">ASSETTRACKER</span>
            </div>
            <p className="footer-copy">
              © 2023 Asset Control Technologies. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default PublicLandingPage;
