import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import LandingPage from './pages/LandingPage'
import PublicLandingPage from './pages/PublicLandingPage'
import DeviceManagement from './pages/DeviceManagement'
import RaspberryPiConfig from './pages/RaspberryPiConfig'

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [user, setUser] = useState(null)
    const [session, setSession] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [activePage, setActivePage] = useState('home')
    const [showLanding, setShowLanding] = useState(true)
    const [authView, setAuthView] = useState('login')
    const hadUserRef = useRef(false)
    const [bootstrapping, setBootstrapping] = useState(true)

    const syncViewFromLocation = (currentUser) => {
        const path = window.location.pathname || '/'
        if (currentUser) {
            const base = '/dashboard'
            if (path.startsWith(base)) {
                const suffix = path.slice(base.length) || '/'
                if (suffix.startsWith('/devices')) {
                    setActivePage('devices')
                } else if (suffix.startsWith('/raspberry')) {
                    setActivePage('raspberry')
                } else {
                    setActivePage('home')
                }
                setShowLanding(false)
                return
            }
            window.history.replaceState({}, '', `${base}/home`)
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
                window.history.replaceState(
                    {},
                    '',
                    window.location.pathname + window.location.search
                )
            }
            setBootstrapping(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

    const navigateDashboard = (page) => {
        if (!user) return
        const base = '/dashboard'
        const path = page === 'devices' ? `${base}/devices` : page === 'raspberry' ? `${base}/raspberry` : `${base}/home`
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
                        onClick={() => navigateDashboard('home')}
                    >
                        <span className="sidebar-item-icon">🏠</span>
                        <span className="sidebar-item-text">Homepage</span>
                    </div>
                    <div
                        className={`sidebar-item ${activePage === 'devices' ? 'active' : ''}`}
                        onClick={() => navigateDashboard('devices')}
                    >
                        <span className="sidebar-item-icon">📱</span>
                        <span className="sidebar-item-text">Device Management Page</span>
                    </div>
                    <div
                        className={`sidebar-item ${activePage === 'raspberry' ? 'active' : ''}`}
                        onClick={() => navigateDashboard('raspberry')}
                    >
                        <span className="sidebar-item-icon">🍓</span>
                        <span className="sidebar-item-text">Raspberry Pi Configuration</span>
                    </div>
                </div>
            </div>

            
            <div className="main-content">
                {activePage === 'home' ? (
                    <LandingPage user={user} onLogout={handleLogout} />
                ) : activePage === 'devices' ? (
                    <DeviceManagement />
                ) : activePage === 'raspberry' ? (
                    <RaspberryPiConfig />
                ) : (
                    <DeviceManagement />
                )}
            </div>
        </div>
    )
}

export default App
