const configuredApiBase = import.meta.env.VITE_API_URL?.trim() || ''

let apiBase = configuredApiBase

try {
    if (configuredApiBase) {
        const parsedUrl = new URL(configuredApiBase)

        // `0.0.0.0` works for binding a dev server, but browsers should call the
        // current origin so Vite can proxy `/api` requests locally.
        if (parsedUrl.hostname === '0.0.0.0') {
            apiBase = ''
        }
    }
} catch {
    apiBase = configuredApiBase
}

export default apiBase
