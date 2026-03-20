import React, { useState, useEffect } from 'react'
import './RaspberryPiConfig.css'

function RaspberryPiConfig() {
    const [scanned, setScanned] = useState([])
    const [paired, setPaired] = useState([])
    const [scanning, setScanning] = useState(false)
    const [message, setMessage] = useState('')
    const [manualMac, setManualMac] = useState('')

    useEffect(() => {
        fetchPaired()
    }, [])

    const fetchPaired = async () => {
        try {
            const res = await fetch('/api/bluetooth/paired')
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
            const res = await fetch('/api/bluetooth/scan?seconds=6')
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
            const res = await fetch('/api/bluetooth/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac })
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
            const res = await fetch('/api/bluetooth/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac })
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
            <h1 className="page-title">Raspberry Pi — Bluetooth</h1>

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
    )
}

export default RaspberryPiConfig
