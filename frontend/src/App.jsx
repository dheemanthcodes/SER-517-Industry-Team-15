import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
import DeviceManagement from './pages/DeviceManagement'

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [user, setUser] = useState(null)
    const [session, setSession] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [activePage, setActivePage] = useState('home')
    const [showLanding, setShowLanding] = useState(true)

    useEffect(() => {
        
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            if (session?.user) {
                setUser(session.user)
                setIsLoggedIn(true)
                setShowLanding(false)
            }
        })

        
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            if (session?.user) {
                setUser(session.user)
                setIsLoggedIn(true)
                setShowLanding(false)
            } else {
                setUser(null)
                setIsLoggedIn(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    const handleLogin = (userData) => {
        setUser(userData)
        setIsLoggedIn(true)
        setShowLanding(false)
    }

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut()
        } catch (err) {
            
        }
        setUser(null)
        setSession(null)
        setIsLoggedIn(false)
        setShowLanding(true)
    }

    const handleGetStarted = () => {
        setShowLanding(false)
    }

   
    if (showLanding) {
        return (
            <div className="landing-page">
                <div className="landing-content">
                    <div className="landing-logo">🚑</div>
                    <h1 className="landing-title">Ambulance Asset Tracker</h1>
                    <p className="landing-subtitle">
                        Track and manage drug boxes and narcotics pouches in ambulances using BLE technology
                    </p>
                    <button className="landing-btn" onClick={handleGetStarted}>
                        Click here to login
                    </button>
                </div>
            </div>
        )
    }

    
    if (!isLoggedIn || !user) {
        return <LoginPage onLogin={handleLogin} />
    }

    return (
        <div className="app-layout">
           
            <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : 'expanded'}`}>
                <div className="sidebar-header">
                    {!sidebarCollapsed && <span className="sidebar-logo">App</span>}
                    <button
                        className="sidebar-toggle"
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    >
                        {sidebarCollapsed ? '☰' : '←'}
                    </button>
                </div>
                <div className="sidebar-menu">
                    <div
                        className={`sidebar-item ${activePage === 'home' ? 'active' : ''}`}
                        onClick={() => setActivePage('home')}
                    >
                        <span className="sidebar-item-icon">🏠</span>
                        <span className="sidebar-item-text">Homepage</span>
                    </div>
                    <div
                        className={`sidebar-item ${activePage === 'devices' ? 'active' : ''}`}
                        onClick={() => setActivePage('devices')}
                    >
                        <span className="sidebar-item-icon">📱</span>
                        <span className="sidebar-item-text">Device Management Page</span>
                    </div>
                </div>
            </div>

            
            <div className="main-content">
                {activePage === 'home' ? (
                    <LandingPage user={user} onLogout={handleLogout} />
                ) : (
                    <DeviceManagement />
                )}
            </div>
        </div>
    )
}

export default App
