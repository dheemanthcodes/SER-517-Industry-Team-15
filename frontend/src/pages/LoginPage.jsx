import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Card, Button, Input, Typography, Divider } from '@supabase/ui'

function LoginPage({ onLogin }) {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)
    const [isSignUp, setIsSignUp] = useState(false)
    const [message, setMessage] = useState('')
    }
return (
        <div className="auth-container">
            <Card className="auth-card">
                <div className="login-header">
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <img
                            src="/logo.png"
                            alt="Logo"
                            style={{ width: '80px', height: 'auto' }}
                        />
                    </div>
                    <Typography.Title level={3}>
                        {isSignUp ? 'Create Account' : 'Welcome Back'}
                    </Typography.Title>
                    <Typography.Text type="secondary">
                        {isSignUp ? 'Sign up to get started' : 'Please sign in to your account'}
                    </Typography.Text>
                </div>
            </Card> 
        </div>
    )
export default LoginPage