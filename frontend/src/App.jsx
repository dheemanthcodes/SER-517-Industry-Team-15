import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
import PublicLandingPage from './pages/PublicLandingPage'
import DeviceManagement from './pages/DeviceManagement'

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [user, setUser] = useState(null)
    const [session, setSession] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [activePage, setActivePage] = useState('home')
    const [showLanding, setShowLanding] = useState(true)
    const [loginInitialSignUp, setLoginInitialSignUp] = useState(false)
    const hadUserRef = useRef(false)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            if (session?.user) {
                hadUserRef.current = true
                setUser(session.user)
                setIsLoggedIn(true)
                setShowLanding(false)
            }
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            if (session?.user) {
                hadUserRef.current = true
                setUser(session.user)
                setIsLoggedIn(true)
                setShowLanding(false)
            } else {
                if (hadUserRef.current) setShowLanding(true)
                hadUserRef.current = false
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

    const handleLoginClick = () => {
        window.history.pushState({ view: 'login' }, '', window.location.pathname)
        setLoginInitialSignUp(false)
        setShowLanding(false)
    }

    const handleSignUpClick = () => {
        window.history.pushState({ view: 'login' }, '', window.location.pathname)
        setLoginInitialSignUp(true)
        setShowLanding(false)
    }

    useEffect(() => {
        const handlePopState = () => {
            if (!user) setShowLanding(true)
        }
        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [user])

    if (showLanding) {
        return (
            <PublicLandingPage
                onLoginClick={handleLoginClick}
                onSignUpClick={handleSignUpClick}
            />
        )
    }

    if (!isLoggedIn || !user) {
        return (
            <LoginPage
                onLogin={handleLogin}
                initialSignUp={loginInitialSignUp}
            />
        )
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
