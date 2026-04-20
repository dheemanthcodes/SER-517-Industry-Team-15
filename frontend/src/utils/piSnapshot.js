export const normalizePiSnapshot = (payload) => {
    const snapshot =
        payload && typeof payload === 'object' && !Array.isArray(payload)
            ? (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
                ? payload.data
                : payload)
            : {}

    return Object.entries(snapshot).map(([piKey, piData]) => ({
        piKey,
        id: piData?.id || '',
        ambulanceId: piData?.ambulanceId || '',
        ipAddress: piData?.ipAddress || piData?.ip_address || '',
        devices: Array.isArray(piData?.devices) ? piData.devices : [],
    }))
}

export const getUnassignedPis = (pis) =>
    (Array.isArray(pis) ? pis : []).filter((pi) => !pi?.ambulanceId)
