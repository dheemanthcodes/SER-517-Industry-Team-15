import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import LandingPage from './pages/LandingPage'
import PublicLandingPage from './pages/PublicLandingPage'
import DeviceManagement from './pages/DeviceManagement'
import RaspberryPiConfig from './pages/RaspberryPiConfig'
import EventHistory from './pages/EventHistory'
import AlertPopupHost from './components/AlertPopupHost'

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
        if (path === '/raspberry' || path === '/dashboard/raspberry') {
            return 'raspberry'
        }
        return null
    }

    const normalizeLoggedInPath = (path) => {
        if (path === '/dashboard/home') return '/dashboard'
        if (path === '/dashboard/devices') return '/devices'
        if (path === '/dashboard/events') return '/events'
        if (path === '/dashboard/raspberry') return '/raspberry'
        return path
    }

    const redirectToPublicHome = () => {
        if (window.location.pathname !== '/') {
            window.location.replace('/')
            return true
        }

        return false
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

        if (path !== '/' && redirectToPublicHome()) {
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
            } else {
                syncViewFromLocation(null)
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
                syncViewFromLocation(null)
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
        } else if (page === 'raspberry') {
            path = '/raspberry'
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
            <AlertPopupHost />
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
                    <div
                        className={`sidebar-item ${activePage === 'raspberry' ? 'active' : ''}`}
                        onClick={() => navigateDashboard('raspberry')}
                    >
                        <span className="sidebar-item-icon">🍓</span>
                        <span className="sidebar-item-text">Raspberry Pi Configuration</span>
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
                {activePage === 'devices' && <DeviceManagement isActive={activePage === 'devices'} />}
                {activePage === 'events' && <EventHistory />}
                {activePage === 'raspberry' && <RaspberryPiConfig />}
            </main>
        </div>
    )
}

export default App
