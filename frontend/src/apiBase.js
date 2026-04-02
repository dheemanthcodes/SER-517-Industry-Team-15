const configuredApiBase =
    import.meta.env.VITE_API_URL?.trim() ||
    'https://ser-517-industry-team-15.onrender.com'

let apiBase = configuredApiBase

try {
    if (configuredApiBase) {
        const parsedUrl = new URL(configuredApiBase)
        if (parsedUrl.hostname === '0.0.0.0') {
            apiBase = ''
        }
    }
} catch {
    apiBase = configuredApiBase
}

export default apiBase