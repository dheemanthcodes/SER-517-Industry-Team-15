import React, { useState, useEffect } from 'react'
import './RaspberryPiConfig.css'

function RaspberryPiConfig() {
    // pis is an array derived from the backend response object
    // Each entry: { piKey, ambulanceId, ipAddress, devices: [{name, address}] }
    const [pis, setPis] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedPi, setSelectedPi] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [expandedPis, setExpandedPis] = useState(new Set())
    const [newPiName, setNewPiName] = useState('')
    const [newPiIp, setNewPiIp] = useState('')
    const [newPiAmbulanceId, setNewPiAmbulanceId] = useState('')
    const [addPiMessage, setAddPiMessage] = useState('')

    const toggleExpand = (piKey) => {
        setExpandedPis(prev => {
            const next = new Set(prev)
            if (next.has(piKey)) {
                next.delete(piKey)
            } else {
                next.add(piKey)
            }
            return next
        })
    }

    const [scanned, setScanned] = useState([])
    const [paired, setPaired] = useState([])
    const [scanning, setScanning] = useState(false)
    const [message, setMessage] = useState('')
    const [manualMac, setManualMac] = useState('')
    const hasFetched = React.useRef(false)

    useEffect(() => {
        if (!hasFetched.current) {
            fetchPiDetails()
            hasFetched.current = true
        }
    }, [])

    /**
     * Backend returns an object like:
     * {
     *   "pi-1": { "ambulanceId": "AMB-001", "ipAddress": "192.168.1.101", "devices": [...] },
     *   "pi-2": { "ambulanceId": "AMB-002", "ipAddress": "192.168.1.102", "devices": [...] }
     * }
     */
    const fetchPiDetails = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/fetchpidetails`)
            const json = await res.json()

            // Convert the keyed object into an array for easier rendering
            const piList = Object.entries(json).map(([piKey, piData]) => ({
                piKey,
                ambulanceId: piData.ambulanceId,
                ipAddress: piData.ipAddress,
                devices: piData.devices || [],
            }))
            setPis(piList)
        } catch (e) {
            console.error('Failed to fetch Pi details:', e)
        } finally {
            setLoading(false)
        }
    }

    const handleAddPi = async () => {
        if (!newPiName.trim()) return setAddPiMessage('Name is required.')
        if (!newPiIp.trim()) return setAddPiMessage('IP Address is required.')
        if (!newPiAmbulanceId.trim()) return setAddPiMessage('Ambulance ID is required.')

        setAddPiMessage('Adding...')
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/addpidetails`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newPiName.trim(),
                    ip_address: newPiIp.trim(),
                    ambulance_id: newPiAmbulanceId.trim(),
                }),
            })
            const json = await res.json()
            if (res.ok) {
                const newPi = {
                    piKey: newPiName.trim(),
                    ipAddress: newPiIp.trim(),
                    ambulanceId: newPiAmbulanceId.trim(),
                    devices: [],
                }
                setPis(prev => [newPi, ...prev])
                setNewPiName('')
                setNewPiIp('')
                setNewPiAmbulanceId('')
                setAddPiMessage('Raspberry Pi added successfully.')
                setTimeout(() => setAddPiMessage(''), 3000)
            } else {
                setAddPiMessage(`Failed: ${json.detail || json.message || 'Unknown error'}`)
            }
        } catch (e) {
            console.error(e)
            setAddPiMessage('Error connecting to server.')
        }
    }

    const filteredPis = pis.filter(pi =>
        pi.ambulanceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pi.piKey.toLowerCase().includes(searchTerm.toLowerCase())
    )

    useEffect(() => {
        if (selectedPi) {
            fetchPaired()
        } else {
            setScanned([])
            setPaired([])
            setMessage('')
            setManualMac('')
        }
    }, [selectedPi])

    const fetchPaired = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/bluetooth/paired?pi_ip=${selectedPi?.ipAddress || ''}`)
            const json = await res.json()
            if (json.status === 'success') setPaired(json.data.paired_devices || [])
        } catch (e) {
            console.error(e)
        }
    }

    const handleScan = async () => {
        setScanning(true)
        setMessage('Scanning for devices...')
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/bluetooth/scan?seconds=6&pi_ip=${selectedPi?.ipAddress || ''}`)
            let json
            try {
                json = await res.json()
            } catch (parseError) {
                setMessage('Scan failed: Invalid response from server')
                setScanning(false)
                return
            }

            if (json.status === 'success') {
                const deviceCount = (json.data?.scanned_devices || []).length
                if (deviceCount === 0) {
                    setMessage('No devices found')
                } else {
                    setScanned(json.data.scanned_devices || [])
                    setMessage(`Found ${deviceCount} devices`)
                }
            } else {
                const errorMsg = json.detail || json.message || 'Unknown error'
                setMessage(`Scan failed: ${errorMsg}`)
            }
        } catch (e) {
            console.error(e)
            setMessage('Scan error: ' + e.message)
        }
        setScanning(false)
    }

    const handlePair = async (mac) => {
        setMessage(`Pairing ${mac}...`)
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/bluetooth/pair`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac, pi_ip: selectedPi?.ipAddress || '' })
            })
            const json = await res.json()
            if (json.status === 'success') {
                setMessage('Paired successfully')
                fetchPaired()
            } else {
                setMessage('Pair failed')
            }
        } catch (e) {
            console.error(e)
            setMessage('Pair error')
        }
    }

    const handleRemove = async (mac) => {
        setMessage(`Removing ${mac}...`)
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/bluetooth/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac, pi_ip: selectedPi?.ipAddress || '' })
            })
            const json = await res.json()
            if (json.status === 'success') {
                setMessage('Removed successfully')
                fetchPaired()
            } else {
                setMessage('Remove failed')
            }
        } catch (e) {
            console.error(e)
            setMessage('Remove error')
        }
    }

    const handleManualPair = async () => {
        if (!manualMac) return setMessage('Enter a MAC address')
        await handlePair(manualMac)
        setManualMac('')
    }

    return (
        <div className="raspberry-config-page">
            <h1 className="page-title">Raspberry Pi Configuration</h1>

            {!selectedPi ? (
                <div className="pi-list-view">
                    <div className="add-pi-box" style={{ marginTop: 0, marginBottom: '32px' }}>
                        <h3 className="section-title" style={{ fontSize: '16px' }}>Add Raspberry Pi</h3>
                        <div className="add-pi-form">
                            <input
                                className="mac-input"
                                placeholder="Name (e.g. pi-3)"
                                value={newPiName}
                                onChange={(e) => setNewPiName(e.target.value)}
                            />
                            <input
                                className="mac-input"
                                placeholder="IP Address (e.g. 192.168.1.100)"
                                value={newPiIp}
                                onChange={(e) => setNewPiIp(e.target.value)}
                            />
                            <input
                                className="mac-input"
                                placeholder="Ambulance ID (e.g. AMB-003)"
                                value={newPiAmbulanceId}
                                onChange={(e) => setNewPiAmbulanceId(e.target.value)}
                            />
                            <button onClick={handleAddPi} className="btn-secondary">
                                Add Device
                            </button>
                        </div>
                        {addPiMessage && (
                            <p className="status-message" style={{ marginTop: '12px' }}>{addPiMessage}</p>
                        )}
                    </div>

                    <h2 className="section-title">Ambulances with Pi Devices</h2>
                    <div className="search-box" style={{ marginBottom: '20px' }}>
                        <input
                            type="text"
                            className="mac-input"
                            placeholder="Search by Ambulance ID or Pi name"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    {loading ? (
                        <div className="empty-state">
                            <p className="muted">Loading...</p>
                        </div>
                    ) : filteredPis.length === 0 ? (
                        <div className="empty-state">
                            <p className="muted">{searchTerm ? 'No ambulances found matching your search.' : 'No Raspberry Pis configured.'}</p>
                        </div>
                    ) : (
                        <div className="pi-grid">
                            {filteredPis.map(pi => (
                                <div key={pi.piKey} className="pi-card">
                                    <div
                                        className="pi-card-header"
                                        onClick={() => toggleExpand(pi.piKey)}
                                    >
                                        <div className="pi-card-header-left">
                                            <span className={`chevron ${expandedPis.has(pi.piKey) ? 'chevron-open' : ''}`}>&#9654;</span>
                                            <span className="detail-label">Ambulance ID:</span>
                                            <span className="detail-value ambulance-id-heading">{pi.ambulanceId}</span>
                                        </div>
                                        <span className="device-count-badge">{pi.devices.length} devices</span>
                                    </div>

                                    {expandedPis.has(pi.piKey) && (
                                        <div className="pi-card-body">
                                            <div className="pi-details">
                                                <div className="detail-row">
                                                    <span className="detail-label">Pi Name:</span>
                                                    <span className="detail-value">{pi.piKey}</span>
                                                </div>
                                                <div className="detail-row">
                                                    <span className="detail-label">Pi IP Address:</span>
                                                    <span className="detail-value">{pi.ipAddress || 'No IP address'}</span>
                                                </div>
                                                <div className="detail-row">
                                                    <span className="detail-label">BLE Devices:</span>
                                                    <span className="detail-value">{pi.devices.length} tracked</span>
                                                </div>
                                            </div>

                                            {pi.devices.length > 0 && (
                                                <div className="pi-device-list">
                                                    <h4 className="pi-device-list-title">Tracked BLE Devices</h4>
                                                    <ul className="device-list">
                                                        {pi.devices.map((device, idx) => (
                                                            <li key={device.address || idx} className="device-row compact-row">
                                                                <div className="device-info">
                                                                    <strong>{device.name || 'Unknown'}</strong>
                                                                    <div className="muted">{device.address}</div>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="pi-card-actions">
                                                <button onClick={() => setSelectedPi(pi)} className="btn-primary">
                                                    Manage Bluetooth
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="pi-detail-view">
                    <div className="pi-detail-header">
                        <button onClick={() => setSelectedPi(null)} className="btn-outline back-btn">
                            &larr; Back to Devices
                        </button>
                        <h2 className="section-title" style={{ marginBottom: 0 }}>
                            {selectedPi.ambulanceId}
                            <span className="muted" style={{ fontWeight: 400, marginLeft: '8px' }}>
                                {selectedPi.piKey} — {selectedPi.ipAddress || 'No IP'}
                            </span>
                        </h2>
                    </div>

                    <div className="pi-bluetooth-section">
                        <section className="pi-bluetooth-actions">
                            <button onClick={handleScan} disabled={scanning} className="btn-primary">
                                {scanning ? 'Scanning…' : 'Scan for Devices'}
                            </button>
                            <span className="status-message">{message}</span>
                        </section>

                        <section className="device-lists-container">
                            <div className="device-column">
                                <h2 className="section-title">Discovered Devices</h2>
                                {scanned.length === 0 ? (
                                    <div className="empty-state">
                                        <p className="muted">No devices discovered — try scanning.</p>
                                    </div>
                                ) : (
                                    <ul className="device-list">
                                        {scanned.map((d, i) => (
                                            <li key={d.mac_address || i} className="device-row hover-lift">
                                                <div className="device-info">
                                                    <strong>{d.name || d.raw_output || 'Unknown'}</strong>
                                                    <div className="muted">{d.mac_address || d.raw_output}</div>
                                                </div>
                                                <div className="device-actions">
                                                    <button onClick={() => handlePair(d.mac_address)} className="btn btn-outline">
                                                        Pair
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="manual-entry-box">
                                    <input
                                        className="mac-input"
                                        placeholder="MAC (e.g. AA:BB:CC...)"
                                        value={manualMac}
                                        onChange={(e) => setManualMac(e.target.value)}
                                    />
                                    <button onClick={handleManualPair} className="btn-secondary">Add Device</button>
                                </div>
                            </div>

                            <div className="device-column">
                                <h2 className="section-title">Paired Devices</h2>
                                {paired.length === 0 ? (
                                    <div className="empty-state">
                                        <p className="muted">No paired devices.</p>
                                    </div>
                                ) : (
                                    <ul className="device-list">
                                        {paired.map((p, i) => (
                                            <li key={p.mac_address || i} className="device-row hover-lift paired-row">
                                                <div className="device-info">
                                                    <strong>{p.name || p.raw_output || 'Unknown'}</strong>
                                                    <div className="muted">{p.mac_address || p.raw_output}</div>
                                                </div>
                                                <div className="device-actions">
                                                    <button onClick={() => handleRemove(p.mac_address)} className="btn-danger">
                                                        Remove
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </div>
    )
}

export default RaspberryPiConfig
