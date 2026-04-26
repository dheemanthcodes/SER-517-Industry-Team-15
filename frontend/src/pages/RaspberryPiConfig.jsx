import React, { useState, useEffect } from 'react'
import './RaspberryPiConfig.css'
import apiBase from '../apiBase'
import { normalizePiSnapshot } from '../utils/piSnapshot'

const BLE_SLOT_COUNT = 4

const normalizeMacAddress = (value) => String(value || '').trim().replace(/-/g, ':').toUpperCase()
const normalizeBleName = (value) => String(value || '').trim().toLowerCase()

const isValidMacAddress = (value) => {
    const normalized = normalizeMacAddress(value)
    return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalized)
}

const areSlotsComplete = (slot) => Boolean((slot?.name || '').trim()) && Boolean((slot?.mac || '').trim())

const buildEmptyBleSlots = () =>
    Array.from({ length: BLE_SLOT_COUNT }, () => ({
        id: '',
        name: '',
        mac: '',
    }))

const buildBleSlotsFromPiDevices = (pi) => {
    const devices = Array.isArray(pi?.devices) ? pi.devices : []
    const slots = devices.slice(0, BLE_SLOT_COUNT).map((device) => ({
        id: device?.id || '',
        name: device?.name || '',
        mac: device?.address || '',
    }))

    while (slots.length < BLE_SLOT_COUNT) {
        slots.push({ id: '', name: '', mac: '' })
    }

    return slots
}

function RaspberryPiConfig() {
    const [pis, setPis] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedPi, setSelectedPi] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [expandedPis, setExpandedPis] = useState(new Set())
    const [newPiName, setNewPiName] = useState('')
    const [newPiIp, setNewPiIp] = useState('')
    const [addPiMessage, setAddPiMessage] = useState('')
    const [deletingPiKey, setDeletingPiKey] = useState('')
    const [piPendingDelete, setPiPendingDelete] = useState(null)

    const toggleExpand = (piKey) => {
        setExpandedPis((prev) => {
            const next = new Set(prev)
            if (next.has(piKey)) {
                next.delete(piKey)
            } else {
                next.add(piKey)
            }
            return next
        })
    }

    const [message, setMessage] = useState('')
    const [bleSlots, setBleSlots] = useState(() => buildEmptyBleSlots())
    const [editingSlots, setEditingSlots] = useState(() => new Set())
    const [savingSlotIndex, setSavingSlotIndex] = useState(-1)
    const [clearingSlotIndex, setClearingSlotIndex] = useState(-1)
    const hasFetched = React.useRef(false)

    useEffect(() => {
        if (!hasFetched.current) {
            fetchPiDetails()
            hasFetched.current = true
        }
    }, [])

   
    const fetchPiDetails = async () => {
        try {
            const res = await fetch(`${apiBase}/api/fetchpidetails`, {
                cache: 'no-store',
            })
            const json = await res.json()
            if (!res.ok) {
                throw new Error(json.detail || json.message || 'Failed to fetch Pi details')
            }

            const piList = normalizePiSnapshot(json)
            setPis(piList)
            return piList
        } catch (e) {
            console.error('Failed to fetch Pi details:', e)
            return []
        } finally {
            setLoading(false)
        }
    }

    const handleAddPi = async () => {
        const normalizedName = newPiName.trim()
        const normalizedIp = newPiIp.trim()

        if (!normalizedName) return setAddPiMessage('Name is required.')
        if (!normalizedIp) return setAddPiMessage('IP Address is required.')

        const duplicateName = pis.some(
            (pi) => (pi?.piKey || '').trim().toLowerCase() === normalizedName.toLowerCase()
        )
        if (duplicateName) {
            return setAddPiMessage('A Raspberry Pi with this name already exists.')
        }

        const duplicateIp = pis.some(
            (pi) => (pi?.ipAddress || '').trim() === normalizedIp
        )
        if (duplicateIp) {
            return setAddPiMessage('A Raspberry Pi with this IP address already exists.')
        }

        setAddPiMessage('Adding...')
        try {
            const res = await fetch(`${apiBase}/api/addpidetails`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: normalizedName,
                    ip_address: normalizedIp,
                }),
            })
            const json = await res.json()
            if (res.ok) {
                const newPi = {
                    piKey: normalizedName,
                    id: '',
                    ipAddress: normalizedIp,
                    devices: [],
                }
                setPis((prev) => [newPi, ...prev])
                setNewPiName('')
                setNewPiIp('')
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

    useEffect(() => {
        if (!piPendingDelete) return undefined

        const handleEscape = (event) => {
            if (event.key === 'Escape' && deletingPiKey !== piPendingDelete?.piKey) {
                setPiPendingDelete(null)
            }
        }

        window.addEventListener('keydown', handleEscape)
        return () => window.removeEventListener('keydown', handleEscape)
    }, [piPendingDelete, deletingPiKey])

    const requestDeletePi = (pi) => {
        if (!pi?.piKey) return
        setPiPendingDelete(pi)
    }

    const handleDeletePi = async (pi) => {
        if (!pi?.piKey) return

        setDeletingPiKey(pi.piKey)
        setAddPiMessage(`Deleting ${pi.piKey}...`)

        try {
            const res = await fetch(`${apiBase}/api/deletepi/${encodeURIComponent(pi.piKey)}`, {
                method: 'DELETE',
            })
            const json = await res.json()

            if (!res.ok) {
                throw new Error(json.detail || json.message || 'Delete failed')
            }

            setPis((prev) => prev.filter((item) => item.piKey !== pi.piKey))
            setExpandedPis((prev) => {
                const next = new Set(prev)
                next.delete(pi.piKey)
                return next
            })

            const unassignedVehicle = json?.data?.unassigned_vehicle
            if (selectedPi?.piKey === pi.piKey) {
                setSelectedPi(null)
            }

            if (unassignedVehicle?.unit_number) {
                const statusMessage = `Raspberry Pi ${pi.piKey} deleted. Ambulance ${unassignedVehicle.unit_number} is now unassigned.`
                window.sessionStorage.setItem('deviceManagementPiStatusMessage', statusMessage)
                setAddPiMessage(statusMessage)
            } else {
                setAddPiMessage(`Raspberry Pi ${pi.piKey} deleted successfully.`)
            }
        } catch (e) {
            console.error('Failed to delete Pi:', e)
            setAddPiMessage(e?.message || 'Failed to delete Raspberry Pi.')
        } finally {
            setDeletingPiKey('')
            setPiPendingDelete(null)
        }
    }

    const duplicateNameWarning = newPiName.trim() && pis.some(pi => (pi?.piKey || '').trim().toLowerCase() === newPiName.trim().toLowerCase());
    const duplicateIpWarning = newPiIp.trim() && pis.some(pi => (pi?.ipAddress || '').trim() === newPiIp.trim());

    const filteredPis = pis.reduce((acc, pi) => {
        const term = searchTerm.toLowerCase()
        const piMatches = pi.piKey.toLowerCase().includes(term) || (pi.ipAddress || '').toLowerCase().includes(term)
        
        const matchedDevices = pi.devices.filter(device => 
            `${device?.name || ''} ${device?.address || ''}`.toLowerCase().includes(term)
        )

        if (piMatches || matchedDevices.length > 0) {
            acc.push({
                ...pi,
                displayDevices: piMatches ? pi.devices : matchedDevices,
            })
        }
        return acc
    }, [])

    useEffect(() => {
        if (selectedPi) {
            const nextSlots = buildBleSlotsFromPiDevices(selectedPi)
            setBleSlots(nextSlots)
            setEditingSlots(() => {
                const next = new Set()
                for (let i = 0; i < BLE_SLOT_COUNT; i++) {
                    if (!areSlotsComplete(nextSlots[i])) next.add(i)
                }
                return next
            })
            setMessage('')
        } else {
            setMessage('')
            setBleSlots(buildEmptyBleSlots())
            setEditingSlots(new Set())
        }
    }, [selectedPi])

    const updateBleSlot = (index, patch) => {
        setBleSlots((prev) =>
            prev.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot))
        )
    }

    const setEditingSlot = (index, enabled) => {
        setEditingSlots((prev) => {
            const next = new Set(prev)
            if (enabled) next.add(index)
            else next.delete(index)
            return next
        })
    }

    const getMacUniquenessError = (slots, currentIndex) => {
        const current = normalizeMacAddress(slots?.[currentIndex]?.mac)
        if (!current) return ''

        for (let i = 0; i < (slots || []).length; i++) {
            if (i === currentIndex) continue
            const other = normalizeMacAddress(slots?.[i]?.mac)
            if (other && other === current) return 'MAC address is already used in another slot.'
        }
        return ''
    }

    const getBleNameUniquenessError = (slots, currentIndex) => {
        const currentName = normalizeBleName(slots?.[currentIndex]?.name)
        if (!currentName) return ''

        const currentId = String(slots?.[currentIndex]?.id || '').trim()

        for (let i = 0; i < (slots || []).length; i++) {
            if (i === currentIndex) continue
            const otherName = normalizeBleName(slots?.[i]?.name)
            if (otherName && otherName === currentName) {
                return 'BLE name is already used by another tag.'
            }
        }

        for (const pi of pis || []) {
            for (const device of pi?.devices || []) {
                const otherName = normalizeBleName(device?.name)
                if (!otherName || otherName !== currentName) continue

                const otherId = String(device?.id || '').trim()
                if (currentId && otherId && otherId === currentId) continue

                return 'BLE name is already used by another tag.'
            }
        }

        return ''
    }

    const handleSaveSlot = async (index) => {
        if (savingSlotIndex === index) return

        const slot = bleSlots[index]
        const name = (slot?.name || '').trim()
        const mac = normalizeMacAddress(slot?.mac)

        if (!name || !mac) {
            setMessage('Both name and MAC address are required.')
            return
        }

        if (!isValidMacAddress(mac)) {
            setMessage('Enter a valid MAC address (AA:BB:CC:DD:EE:FF).')
            return
        }

        const duplicateNameError = getBleNameUniquenessError(bleSlots, index)
        if (duplicateNameError) {
            setMessage(duplicateNameError)
            return
        }

        const duplicateError = getMacUniquenessError(bleSlots, index)
        if (duplicateError) {
            setMessage(duplicateError)
            return
        }

        setSavingSlotIndex(index)
        setMessage('Saving...')

        try {
            const res = await fetch(`${apiBase}/api/ble-tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    identifier: mac,
                    pi_id: selectedPi?.id || '',
                    pi_name: selectedPi?.piKey || '',
                    ble_tag_id: slot?.id || '',
                }),
            })

            let json = null
            try {
                json = await res.json()
            } catch (e) {
                json = null
            }

            if (!res.ok) {
                const detail = json?.detail || json?.message || res.statusText || 'Unknown error'
                setMessage(`Save failed: ${detail}`)
                return
            }

            updateBleSlot(index, { id: json?.data?.ble_tag_id || slot?.id || '', name, mac })
            setEditingSlot(index, false)
            setMessage('Saved.')
            const refreshedPis = await fetchPiDetails()
            setSelectedPi((prev) => {
                if (!prev?.piKey) return prev
                const refreshedPi = refreshedPis.find((pi) => pi.piKey === prev.piKey)
                return refreshedPi || prev
            })
        } catch (e) {
            console.error(e)
            setMessage('Save failed: could not reach server.')
        } finally {
            setSavingSlotIndex(-1)
        }
    }

    const handleClearSlot = async (index) => {
        const slot = bleSlots[index]

        if (!slot?.id) {
            updateBleSlot(index, { id: '', name: '', mac: '' })
            setEditingSlot(index, true)
            setMessage('')
            return
        }

        setClearingSlotIndex(index)
        setMessage('Deleting...')

        try {
            const params = new URLSearchParams()
            if (selectedPi?.id) params.set('pi_id', selectedPi.id)
            else if (selectedPi?.piKey) params.set('pi_name', selectedPi.piKey)

            const res = await fetch(
                `${apiBase}/api/ble-tags/${encodeURIComponent(slot.id)}?${params.toString()}`,
                { method: 'DELETE' }
            )

            let json = null
            try {
                json = await res.json()
            } catch (e) {
                json = null
            }

            if (!res.ok) {
                const detail = json?.detail || json?.message || res.statusText || 'Unknown error'
                setMessage(`Delete failed: ${detail}`)
                return
            }

            updateBleSlot(index, { id: '', name: '', mac: '' })
            setEditingSlot(index, true)
            setMessage('Deleted.')
            const refreshedPis = await fetchPiDetails()
            setSelectedPi((prev) => {
                if (!prev?.piKey) return prev
                const refreshedPi = refreshedPis.find((pi) => pi.piKey === prev.piKey)
                return refreshedPi || prev
            })
        } catch (e) {
            console.error(e)
            setMessage('Delete failed: could not reach server.')
        } finally {
            setClearingSlotIndex(-1)
        }
    }

    return (
        <div className="raspberry-config-page">
            <h1 className="page-title">Raspberry Pi Configuration</h1>

            {!selectedPi ? (
                <div className="pi-list-view">
                    <div className="add-pi-box" style={{ marginTop: 0, marginBottom: '32px' }}>
                        <h3 className="section-title" style={{ fontSize: '16px' }}>Add Raspberry Pi</h3>
                        <div className="add-pi-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <input
                                    className={`mac-input ${duplicateNameWarning ? 'ble-input-invalid' : ''}`}
                                    placeholder="Name (e.g. pi-3)"
                                    value={newPiName}
                                    onChange={(e) => setNewPiName(e.target.value)}
                                />
                                <input
                                    className={`mac-input ${duplicateIpWarning ? 'ble-input-invalid' : ''}`}
                                    placeholder="IP Address (e.g. 192.168.1.100)"
                                    value={newPiIp}
                                    onChange={(e) => setNewPiIp(e.target.value)}
                                />
                                <button 
                                    onClick={handleAddPi} 
                                    className="btn-secondary" 
                                    disabled={Boolean(duplicateNameWarning || duplicateIpWarning)}
                                >
                                    Add Device
                                </button>
                            </div>
                            {(duplicateNameWarning || duplicateIpWarning) && (
                                <div style={{ color: '#ef4444', fontSize: '14px', marginTop: '4px' }}>
                                    {duplicateNameWarning && <div>A Raspberry Pi with this name already exists.</div>}
                                    {duplicateIpWarning && <div>A Raspberry Pi with this IP address already exists.</div>}
                                </div>
                            )}
                        </div>
                        {addPiMessage && (
                            <p className="status-message" style={{ marginTop: '12px' }}>{addPiMessage}</p>
                        )}
                    </div>

                    <h2 className="section-title">Pi Devices with Connected BLEs</h2>
                    <div className="search-box" style={{ marginBottom: '20px' }}>
                        <input
                            type="text"
                            className="mac-input"
                            placeholder="Search by Pi name, IP, or BLE device"
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
                            <p className="muted">{searchTerm ? 'No Pi devices found matching your search.' : 'No Raspberry Pis configured.'}</p>
                        </div>
                    ) : (
                        <div className="pi-grid">
                            {filteredPis.map((pi) => (
                                <div key={pi.piKey} className="pi-card">
                                    <div className="pi-card-header" onClick={() => toggleExpand(pi.piKey)}>
                                        <div className="pi-card-header-left">
                                            <span className={`chevron ${expandedPis.has(pi.piKey) ? 'chevron-open' : ''}`}>&#9654;</span>
                                            <span className="detail-label">Pi Name:</span>
                                            <span className="detail-value pi-name-heading">{pi.piKey}</span>
                                        </div>
                                        <span className="device-count-badge">{pi.displayDevices.length} devices</span>
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
                                                    <span className="detail-label">Connected BLE Devices:</span>
                                                    <span className="detail-value">{pi.displayDevices.length} tracked</span>
                                                </div>
                                            </div>

                                            {pi.displayDevices.length > 0 && (
                                                <div className="pi-device-list">
                                                    <h4 className="pi-device-list-title">BLE Devices Connected to This Pi</h4>
                                                    <ul className="device-list">
                                                        {pi.displayDevices.map((device, idx) => (
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
                                                    Manage Bluetooth Devices
                                                </button>
                                                <button
                                                    onClick={() => requestDeletePi(pi)}
                                                    className="btn-danger-outline"
                                                    disabled={deletingPiKey === pi.piKey}
                                                >
                                                    {deletingPiKey === pi.piKey ? 'Deleting...' : 'Delete Pi'}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <h2 className="section-title" style={{ marginBottom: 0 }}>
                                {selectedPi.piKey}
                                <span className="muted" style={{ fontWeight: 400, marginLeft: '8px' }}>
                                    {selectedPi.ipAddress || 'No IP'}
                                </span>
                            </h2>
                            <button
                                onClick={() => requestDeletePi(selectedPi)}
                                className="btn-danger-outline"
                                disabled={deletingPiKey === selectedPi.piKey}
                            >
                                {deletingPiKey === selectedPi.piKey ? 'Deleting...' : 'Delete Pi'}
                            </button>
                        </div>
                    </div>

                    <div className="pi-bluetooth-section">
                        <section className="device-lists-container">
                            <div className="device-column">
                                <h2 className="section-title">Configure BLE Devices</h2>
                                <p className="ble-config-help">
                                    Configure up to {BLE_SLOT_COUNT} BLE devices for this Pi. Enter a device name and
                                    MAC address.
                                </p>

                                {message ? <div className="status-message ble-config-message">{message}</div> : null}

                                <div className="ble-config-list">
                                    {bleSlots.map((slot, index) => {
                                        const isEditing = editingSlots.has(index) || !areSlotsComplete(slot)
                                        const isMacValid = !slot.mac || isValidMacAddress(slot.mac)
                                        const duplicateNameError = getBleNameUniquenessError(bleSlots, index)
                                        const showDuplicateNameError = Boolean((slot.name || '').trim()) && Boolean(duplicateNameError)
                                        const duplicateError = getMacUniquenessError(bleSlots, index)
                                        const showDuplicateError = Boolean(slot.mac) && Boolean(duplicateError)

                                        return (
                                            <div key={index} className="ble-config-row">
                                                <div className="ble-config-index">{index + 1}</div>
                                                {isEditing ? (
                                                    <>
                                                        <input
                                                            className={`ble-name-input ${showDuplicateNameError ? 'ble-input-invalid' : ''}`}
                                                            placeholder="Device name (e.g. BLE Device 1)"
                                                            value={slot.name}
                                                            onChange={(e) => updateBleSlot(index, { name: e.target.value })}
                                                        />
                                                        <input
                                                            className={`mac-input ${isMacValid && !showDuplicateError ? '' : 'ble-input-invalid'}`}
                                                            placeholder="MAC (e.g. AA:BB:CC:DD:EE:FF)"
                                                            value={slot.mac}
                                                            onChange={(e) => updateBleSlot(index, { mac: e.target.value })}
                                                            onBlur={() =>
                                                                updateBleSlot(index, { mac: normalizeMacAddress(slot.mac) })
                                                            }
                                                        />
                                                        <div className="ble-config-row-actions">
                                                            <button
                                                                type="button"
                                                                className="btn-primary"
                                                                disabled={savingSlotIndex === index || clearingSlotIndex === index || showDuplicateNameError}
                                                                onClick={() => handleSaveSlot(index)}
                                                            >
                                                                {savingSlotIndex === index ? 'Saving...' : 'Add BLE Device'}
                                                            </button>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="ble-config-summary">
                                                            <strong>{slot.name}</strong>
                                                            <div className="muted">{normalizeMacAddress(slot.mac)}</div>
                                                        </div>
                                                        <div className="ble-config-row-actions">
                                                            <button
                                                                type="button"
                                                                className="btn-secondary"
                                                                disabled={clearingSlotIndex === index}
                                                                onClick={() => setEditingSlot(index, true)}
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-danger"
                                                                disabled={clearingSlotIndex === index}
                                                                onClick={() => handleClearSlot(index)}
                                                            >
                                                                {clearingSlotIndex === index ? 'Deleting...' : 'Clear'}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}

                                                {showDuplicateNameError || showDuplicateError ? (
                                                    <div className="ble-inline-error">
                                                        {showDuplicateNameError ? duplicateNameError : duplicateError}
                                                    </div>
                                                ) : null}
                                            </div>
                                        )
                                    })}
                                </div>

                                <div className="ble-config-actions">
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {piPendingDelete ? (
                <div
                    className="modal-overlay"
                    onClick={() => deletingPiKey !== piPendingDelete.piKey && setPiPendingDelete(null)}
                >
                    <div
                        className="modal-content pi-delete-modal"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="pi-delete-modal-title"
                    >
                        <div className="pi-delete-modal-body">
                            <h3 id="pi-delete-modal-title" className="pi-delete-modal-title">
                                Delete Raspberry Pi?
                            </h3>
                            <p className="pi-delete-modal-text">
                                This will remove <strong>{piPendingDelete.piKey}</strong> from the configuration.
                            </p>
                            <div className="pi-delete-modal-actions">
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => setPiPendingDelete(null)}
                                    disabled={deletingPiKey === piPendingDelete.piKey}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn-danger-outline"
                                    onClick={() => handleDeletePi(piPendingDelete)}
                                    disabled={deletingPiKey === piPendingDelete.piKey}
                                >
                                    {deletingPiKey === piPendingDelete.piKey ? 'Deleting...' : 'Delete Pi'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}

export default RaspberryPiConfig
