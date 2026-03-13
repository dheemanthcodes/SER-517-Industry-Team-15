import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { Card, Button, Input, Typography, Divider } from '@supabase/ui'

function LoginPage({ onLogin, onGoToSignUp }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)

    const handleLogin = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password
            })

            if (signInError) {
                setError(signInError.message)
                return
            }

            if (data.user) {
                onLogin(data.user)
            }
        } catch (err) {
            setError('An error occurred during login')
        } finally {
            setLoading(false)
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

                            <Button block htmlType="submit" loading={loading}>
                                Sign In
                            </Button>
                        </form>

                        

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