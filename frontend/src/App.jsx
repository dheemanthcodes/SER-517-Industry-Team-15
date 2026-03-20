import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import LandingPage from './pages/LandingPage'
import PublicLandingPage from './pages/PublicLandingPage'
import DeviceManagement from './pages/DeviceManagement'
import EventHistory from './pages/EventHistory'

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [user, setUser] = useState(null)
    const [session, setSession] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [activePage, setActivePage] = useState('home')
    const [showLanding, setShowLanding] = useState(true)
    const [authView, setAuthView] = useState('login')
    const [bootstrapping, setBootstrapping] = useState(true)
    const hadUserRef = useRef(false)

    const getPageFromPath = (path) => {
        if (path === '/dashboard' || path === '/dashboard/' || path === '/dashboard/home') {
            return 'home'
        }

        if (path === '/devices' || path === '/dashboard/devices') {
            return 'devices'
        }

        if (path === '/events' || path === '/dashboard/events') {
            return 'events'
        }

        return null
    }

    const normalizeLoggedInPath = (path) => {
        if (path === '/dashboard/home') return '/dashboard'
        if (path === '/dashboard/devices') return '/devices'
        if (path === '/dashboard/events') return '/events'
        return path
    }

    const syncViewFromLocation = (currentUser) => {
        const path = window.location.pathname || '/'

        if (currentUser) {
            const normalizedPath = normalizeLoggedInPath(path)
            if (normalizedPath !== path) {
                window.history.replaceState({}, '', normalizedPath)
            }

            const page = getPageFromPath(normalizedPath)

            if (page) {
                setActivePage(page)
                setShowLanding(false)
                return
            }

            window.history.replaceState({}, '', '/dashboard')
            setActivePage('home')
            setShowLanding(false)
            return
        }

        if (path === '/login') {
            setAuthView('login')
            setShowLanding(false)
            return
        }

        if (path === '/signup') {
            setAuthView('signup')
            setShowLanding(false)
            return
        }

        setShowLanding(true)
    }

    const navigateAuth = (view) => {
        const path = view === 'signup' ? '/signup' : '/login'
        window.history.pushState({ view }, '', path)
        setAuthView(view)
        setShowLanding(false)
    }

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)

            if (session?.user) {
                hadUserRef.current = true
                setUser(session.user)
                setIsLoggedIn(true)
                syncViewFromLocation(session.user)
            }

            if (window.location.hash) {
                window.history.replaceState({}, '', window.location.pathname + window.location.search)
            }

            setBootstrapping(false)
        })

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)

            if (session?.user) {
                hadUserRef.current = true
                setUser(session.user)
                setIsLoggedIn(true)
                syncViewFromLocation(session.user)
            } else {
                if (hadUserRef.current) setShowLanding(true)
                hadUserRef.current = false
                setUser(null)
                setIsLoggedIn(false)
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    useEffect(() => {
        const handlePopState = () => {
            syncViewFromLocation(user)
        }

        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [user])

    useEffect(() => {
        if (!user && bootstrapping) {
            syncViewFromLocation(null)
        }
    }, [bootstrapping, user])

    const handleLogin = (userData) => {
        setUser(userData)
        setIsLoggedIn(true)
        setShowLanding(false)
    }

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut()
        } catch (err) {
            // ignore sign-out errors here
        }

        setUser(null)
        setSession(null)
        setIsLoggedIn(false)
        window.history.pushState({ view: 'landing' }, '', '/')
        setShowLanding(true)
    }

    const handleLoginClick = () => {
        navigateAuth('login')
    }

    const handleSignUpClick = () => {
        navigateAuth('signup')
    }

    const navigateDashboard = (page) => {
        if (!user) return

        let path = '/dashboard'

        if (page === 'devices') {
            path = '/devices'
        } else if (page === 'events') {
            path = '/events'
        }

        window.history.pushState({ page }, '', path)
        setActivePage(page)
    }

    if (bootstrapping) {
        return null
    }

    if (showLanding) {
        return (
            <PublicLandingPage
                onLoginClick={handleLoginClick}
                onSignUpClick={handleSignUpClick}
            />
        )
    }

    if (!isLoggedIn || !user) {
        return authView === 'signup' ? (
            <SignupPage onGoToLogin={handleLoginClick} />
        ) : (
            <LoginPage onLogin={handleLogin} onGoToSignUp={handleSignUpClick} />
        )
    }

    const userDisplayName =
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email ||
        user?.username ||
        'User'

    const userEmail = user?.email || user?.username || 'No email available'

    return (
        <div className="app-layout">
            <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : 'expanded'}`}>
                <div className="sidebar-header">
                    {!sidebarCollapsed && (
                        <div className="sidebar-brand">
                            <img
                                src="/logo.png"
                                alt="Ambulance Tracker"
                                className="sidebar-brand-logo"
                            />
                            <span className="sidebar-logo">AmbulanceTracker</span>
                        </div>
                    )}

                    <button
                        type="button"
                        className="sidebar-toggle"
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {sidebarCollapsed ? '☰' : '←'}
                    </button>
                </div>

                <div className="sidebar-menu">
                    <div
                        className={`sidebar-item ${activePage === 'home' ? 'active' : ''}`}
                        onClick={() => navigateDashboard('home')}
                    >
                        <span className="sidebar-item-icon">🏠</span>
                        {!sidebarCollapsed && <span className="sidebar-item-text">Homepage</span>}
                    </div>

                    <div
                        className={`sidebar-item ${activePage === 'devices' ? 'active' : ''}`}
                        onClick={() => navigateDashboard('devices')}
                    >
                        <span className="sidebar-item-icon">📱</span>
                        {!sidebarCollapsed && (
                            <span className="sidebar-item-text">Device Management</span>
                        )}
                    </div>

                    <div
                        className={`sidebar-item ${activePage === 'events' ? 'active' : ''}`}
                        onClick={() => navigateDashboard('events')}
                    >
                        <span className="sidebar-item-icon">📜</span>
                        {!sidebarCollapsed && (
                            <span className="sidebar-item-text">Event History</span>
                        )}
                    </div>
                </div>

                {!sidebarCollapsed && (
                    <div className="sidebar-user-panel">
                        <div className="sidebar-user-label">Logged in as</div>
                        <div className="sidebar-user-name">{userDisplayName}</div>
                        <div className="sidebar-user-email">{userEmail}</div>

                        <button
                            type="button"
                            className="sidebar-signout-btn"
                            onClick={handleLogout}
                        >
                            Sign Out
                        </button>
                    </div>
                )}
            </aside>

            <main className="main-content">
                {activePage === 'home' && <LandingPage />}
                {activePage === 'devices' && <DeviceManagement />}
                {activePage === 'events' && <EventHistory />}
            </main>
        </div>
    )
}

export default App