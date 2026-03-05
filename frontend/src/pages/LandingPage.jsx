import { Card, Button, Typography, Divider } from '@supabase/ui'

function LandingPage({ user, onLogout }) {
    return (
        <div className="auth-container">
            <Card className="auth-card">
                <Typography.Title level={3}>
                    Welcome back!
                </Typography.Title>

                <Divider />

                <Typography.Text>
                    Logged in as: <strong>{user.email || user.username}</strong>
                </Typography.Text>

                {user.user_metadata?.avatar_url && (
                    <div style={{ marginTop: '16px', textAlign: 'center' }}>
                        <img
                            src={user.user_metadata.avatar_url}
                            alt="Profile"
                            style={{ borderRadius: '50%', width: '64px', height: '64px' }}
                        />
                    </div>
                )}

                <Divider />

                <Button block onClick={onLogout}>
                    Sign Out
                </Button>
            </Card>
        </div>
    )
}

export default LandingPage