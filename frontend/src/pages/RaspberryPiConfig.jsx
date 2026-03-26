import React, { useState, useEffect } from 'react'
import './RaspberryPiConfig.css'

function RaspberryPiConfig() {
    const [pis, setPis] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedPi, setSelectedPi] = useState(null)
    const [newPiName, setNewPiName] = useState('')
    const [newPiIp, setNewPiIp] = useState('')
    const [newPiAmbulanceId, setNewPiAmbulanceId] = useState('')
    const [searchTerm, setSearchTerm] = useState('')

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

    const fetchPiDetails = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/fetchpidetails`)
            const json = await res.json()
            if (json.vehicles) {
                const piList = json.vehicles
                    .filter(v => v.pi_device)
                    .map(v => ({
                        id: v.pi_device.id,
                        ambulanceId: v.unit_number,
                        ipAddress: v.pi_device.ip_address,
                        deviceName: v.pi_device.device_name,
                        isActive: v.pi_device.is_active
                    }))
                setPis(piList)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const filteredPis = pis.filter(pi => {
        return pi.ambulanceId.toLowerCase().includes(searchTerm.toLowerCase())
    })

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

    const handleAddPi = () => {
        if (!newPiName.trim()) return
        const newPi = {
            id: Date.now().toString(),
            name: newPiName.trim(),
            ip: newPiIp.trim(),
            ambulanceId: newPiAmbulanceId.trim()
        }
        setPis([...pis, newPi])
        setNewPiName('')
        setNewPiIp('')
        setNewPiAmbulanceId('')
    }

    const handleRemovePi = (id) => {
        setPis(pis.filter(p => p.id !== id))
    }

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
                        <h3 className="section-title" style={{ fontSize: '16px' }}>Add New Raspberry Pi</h3>
                        <div className="add-pi-form">
                            <input
                                className="mac-input"
                                placeholder="Name (e.g. Living Room Pi)"
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
                                placeholder="Ambulance ID"
                                value={newPiAmbulanceId}
                                onChange={(e) => setNewPiAmbulanceId(e.target.value)}
                            />
                            <button onClick={handleAddPi} className="btn-secondary">
                                Add Device
                            </button>
                        </div>
                    </div>

                    <h2 className="section-title">Ambulances with Pi Devices</h2>
                    <div className="search-box" style={{ marginBottom: '20px' }}>
                        <input
                            type="text"
                            className="mac-input"
                            placeholder="Search by Ambulance ID"
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
                                <div key={pi.id} className="pi-card hover-lift">
                                    <div className="pi-card-info">
                                        {pi.ambulanceId && (
                                            <div className="detail-row">
                                                <span className="detail-label">Ambulance ID:</span>
                                                <span className="detail-value ambulance-id-heading">{pi.ambulanceId}</span>
                                            </div>
                                        )}
                                        <div className="pi-details">
                                            <div className="detail-row">
                                                <span className="detail-label">Pi ID:</span>
                                                <span className="detail-value">{pi.id}</span>
                                            </div>
                                            <div className="detail-row">
                                                <span className="detail-label">Pi IP Address:</span>
                                                <span className="detail-value">{pi.ipAddress || 'No IP address'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pi-card-actions">
                                        <button onClick={() => setSelectedPi(pi)} className="btn-primary">
                                            Manage Bluetooth
                                        </button>
                                        <button onClick={() => handleRemovePi(pi.id)} className="btn-danger-outline">
                                            Remove
                                        </button>
                                    </div>
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
                            {selectedPi.ambulanceId} <span className="muted" style={{ fontWeight: 400, marginLeft: '8px' }}>({selectedPi.ipAddress || 'No IP'})</span>
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
