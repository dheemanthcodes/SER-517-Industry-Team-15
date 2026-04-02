import { useState, useEffect } from 'react'
import { authRedirectUrl, supabase } from '../supabaseClient'
import { Card, Button, Input, Typography, Divider } from '@supabase/ui'

function LoginPage({ onLogin, onGoToSignUp }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)

    const isValidEmail = (email) => {
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return pattern.test(email)
    }

    const getLoginErrorMessage = (message) => {
        if (!message) return 'Login failed, please try again'

        const normalized = message.toLowerCase()

        if (normalized.includes('invalid login credentials')) {
            return 'Invalid email or password'
        }

        if (normalized.includes('email not confirmed')) {
            return 'Please verify your email before signing in'
        }

        return 'Login failed, please try again'
    }

    const handleLogin = async (e) => {
        e.preventDefault()
        setError('')

        if (loading) return


        if (!email.trim() || !password.trim()) {
            setError('Email and password are required')
            return
        }

        if (!isValidEmail(email.trim())) {
            setError('Enter a valid email address')
            return
        }

        setLoading(true)

        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password
            })

            if (signInError) {
                setError(getLoginErrorMessage(signInError.message))
                return
            }

            if (data.user) {
                onLogin(data.user)
            }
        } catch (err) {
            setError('Login failed, please try again')
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleSignIn = async () => {
        try {
            setGoogleLoading(true)
            setError('')
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: authRedirectUrl
                }
            })
            if (error) {
                setError('Failed to sign in with Google')
            }
        } catch (err) {
            setError('An error occurred during Google sign-in')
        } finally {
            setGoogleLoading(false)
        }
    }

    return (
        <div className="auth-container auth-split">
            <div className="auth-split-shell">
                <div className="auth-split-left" aria-hidden="true">
                    <div className="auth-left-inner">
                        <div className="auth-left-badge">
                            <img src="/logo.png" alt="" />
                        </div>
                        <div className="auth-left-title">Ambulance</div>
                        <div className="auth-left-subtitle">AssetTracker</div>
                        <div className="auth-left-tagline">Modernizing asset control for EMS</div>
                    </div>
                </div>

                <div className="auth-split-right">
                    <Card className="auth-card auth-card--split">
                        <div className="login-header">
                            <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                                <img
                                    src="/logo.png"
                                    alt="Logo"
                                    style={{ width: '64px', height: 'auto' }}
                                />
                            </div>
                            <Typography.Title level={3}>Welcome Back</Typography.Title>
                            <Typography.Text type="secondary">
                                Please sign in to your account
                            </Typography.Text>
                        </div>

                        {error && (
                            <div className="error-message">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleLogin}>
                            <div className="form-group">
                                <Typography.Text>Email</Typography.Text>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <Typography.Text>Password</Typography.Text>
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    required
                                />
                            </div>

                            <Button block htmlType="submit" loading={loading} disabled={loading || googleLoading}>
                                Sign In
                            </Button>
                        </form>

                        <Divider />

                        <button
                            type="button"
                            className="auth-google-btn"
                            onClick={handleGoogleSignIn}
                            disabled={googleLoading}
                        >
                            <svg className="auth-google-icon" viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    fill="#4285F4"
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                                <path
                                    fill="#34A853"
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                />
                                <path
                                    fill="#FBBC05"
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                />
                                <path
                                    fill="#EA4335"
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                />
                            </svg>
                            <span className="auth-google-text">
                                {googleLoading ? 'Connecting…' : 'Continue with Google'}
                            </span>
                        </button>

                        <Divider />

                        <Typography.Text
                            type="secondary"
                            style={{ display: 'block', textAlign: 'center' }}
                        >
                            Don't have an account?{' '}
                            <a
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault()
                                    setError('')
                                    onGoToSignUp?.()
                                }}
                            >
                                Sign Up
                            </a>
                        </Typography.Text>
                    </Card>
                </div>
            </div>
        </div>
    )
}

export default LoginPage
