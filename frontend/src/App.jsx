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

    useEffect(() => {
        // Check for existing session on mount
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            if (session?.user) {
                setUser(session.user)
                setIsLoggedIn(true)
            }
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            if (session?.user) {
                setUser(session.user)
                setIsLoggedIn(true)
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
    }

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut()
        } catch (err) {
            // Continue with local logout even if remote fails
        }
        setUser(null)
        setSession(null)
        setIsLoggedIn(false)
    }

    // Show login page if not logged in
    if (!isLoggedIn || !user) {
        return <LoginPage onLogin={handleLogin} />
    }

    return (
        <div className="app-layout">
            {/* Sidebar */}
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
                        <span className="sidebar-item-text">Device Management</span>
                    </div>
                </div>
            </div>

            {/* Main Content */}
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
