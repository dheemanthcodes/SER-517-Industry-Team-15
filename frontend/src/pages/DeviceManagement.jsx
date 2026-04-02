import { useState, useEffect } from 'react'
import { Button, Input } from '@supabase/ui'
import { supabase } from '../supabaseClient'
import AddDeviceModal from '../components/AddDeviceModal'
import apiBase from '../apiBase'

const normalizeAllDetailsRows = (rows) => {
    const vehiclesById = new Map()

    for (const row of Array.isArray(rows) ? rows : []) {
        const vehicleId = row?.vehicle_id
        if (!vehicleId) continue

        if (!vehiclesById.has(vehicleId)) {
            vehiclesById.set(vehicleId, {
                id: vehicleId,
                unit_number: row?.unit_number || '',
                station_name: row?.station_name || '',
                raspberry_pi: {
                    name: row?.device_name || '',
                    ip_address: row?.ip_address || ''
                },
                assets: []
            })
        }

        const vehicle = vehiclesById.get(vehicleId)
        vehicle.assets.push({
            id: row?.asset_id || `${vehicleId}-asset-${vehicle.assets.length}`,
            type: row?.asset_type || '',
            label: row?.label || '',
            parent_asset_id: row?.parent_asset_id || null,
            ble_tag: {
                identifier: row?.ble_identifier || '',
                tag_model: row?.tag_model || ''
            }
        })
    }

    return Array.from(vehiclesById.values())
}

function DeviceManagement() {
    const [showAddDeviceModal, setShowAddDeviceModal] = useState(false)

    const [vehicles, setVehicles] = useState([])
    const [allPis, setAllPis] = useState([])
    const [availablePis, setAvailablePis] = useState([])
    const [piLoading, setPiLoading] = useState(false)
    const [piLoadError, setPiLoadError] = useState('')
    const [expandedVehicle, setExpandedVehicle] = useState(null)
    const [fetchLoading, setFetchLoading] = useState(true)
    const [error, setError] = useState(null)

    const [editingVehicleId, setEditingVehicleId] = useState(null)
    const [editingVehicleData, setEditingVehicleData] = useState(null)
    const [editingError, setEditingError] = useState('')

    useEffect(() => {
        fetchVehicles()
        fetchPiDetails()
    }, [])

    const fetchVehicles = async () => {
        try {
            setFetchLoading(true)
            setError(null)

            const res = await fetch(`${apiBase}/api/fetchalldetails`)
            const json = await res.json()

            if (!res.ok) {
                throw new Error(json.detail || json.message || 'Failed to load vehicles')
            }

            const backendRows = Array.isArray(json?.data) ? json.data : []
            setVehicles(normalizeAllDetailsRows(backendRows))
        } catch (err) {
            console.error('Error fetching vehicles:', err)
            setError('Failed to load vehicles. Please try again.')
        } finally {
            setFetchLoading(false)
        }
    }

    const fetchPiDetails = async () => {
        try {
            setPiLoading(true)
            setPiLoadError('')

            const res = await fetch(`${apiBase}/api/fetchpidetails`)
            const json = await res.json()

            if (!res.ok) {
                throw new Error(json.detail || json.message || 'Failed to load Raspberry Pi options')
            }

            const piList = Object.entries(json || {}).map(([piKey, piData]) => ({
                piKey,
                ambulanceId: piData?.ambulanceId || '',
                ipAddress: piData?.ipAddress || '',
                devices: Array.isArray(piData?.devices) ? piData.devices : []
            }))

            setAllPis(piList)
            const unassignedPis = piList.filter((pi) => !pi.ambulanceId)
            setAvailablePis(unassignedPis)
        } catch (err) {
            console.error('Failed to load Raspberry Pi options:', err)
            setPiLoadError('Failed to load Raspberry Pi options.')
            setAllPis([])
            setAvailablePis([])
        } finally {
            setPiLoading(false)
        }
    }

    const toggleVehicle = (vehicleId) => {
        setExpandedVehicle(expandedVehicle === vehicleId ? null : vehicleId)
    }

    const startVehicleEdit = (vehicle) => {
        if (expandedVehicle !== vehicle.id) {
            setExpandedVehicle(vehicle.id)
        }

        const copy = JSON.parse(JSON.stringify(vehicle))
        setEditingVehicleId(vehicle.id)
        setEditingVehicleData(copy)
        setEditingError('')
    }

    const handleAmbulanceFieldChange = (field, value) => {
        setEditingVehicleData((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                [field]: value
            }
        })
    }

    const handleRaspberryPiChange = (piKey) => {
        setEditingVehicleData((prev) => {
            if (!prev) return prev

            const selectedPi = allPis.find((pi) => pi.piKey === piKey)

            if (!selectedPi) {
                return {
                    ...prev,
                    raspberry_pi: {
                        ...(prev.raspberry_pi || {}),
                        name: '',
                        ip_address: ''
                    },
                    assets: (prev.assets || []).map((asset) => ({
                        ...asset,
                        ble_tag: {
                            ...(asset.ble_tag || {}),
                            identifier: ''
                        }
                    }))
                }
            }

            return {
                ...prev,
                raspberry_pi: {
                    ...(prev.raspberry_pi || {}),
                    name: selectedPi.piKey,
                    ip_address: selectedPi.ipAddress || ''
                },
                assets: (prev.assets || []).map((asset) => ({
                    ...asset,
                    ble_tag: {
                        ...(asset.ble_tag || {}),
                        identifier: ''
                    }
                }))
            }
        })
    }

    const handleAssetLabelChange = (assetId, value) => {
        setEditingVehicleData((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                assets: (prev.assets || []).map((asset) =>
                    asset.id === assetId ? { ...asset, label: value } : asset
                )
            }
        })
    }

    const handleAssetBleChange = (assetId, value) => {
        setEditingVehicleData((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                assets: (prev.assets || []).map((asset) =>
                    asset.id === assetId
                        ? {
                            ...asset,
                            ble_tag: {
                                ...(asset.ble_tag || {}),
                                identifier: value
                            }
                        }
                        : asset
                )
            }
        })
    }

    const handleAssetParentChange = (assetId, parentId) => {
        setEditingVehicleData((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                assets: (prev.assets || []).map((asset) =>
                    asset.id === assetId
                        ? { ...asset, parent_asset_id: parentId || null }
                        : asset
                )
            }
        })
    }

    const handleCancelVehicleEdit = () => {
        setEditingVehicleId(null)
        setEditingVehicleData(null)
        setEditingError('')
    }

    const handleSaveVehicleEdit = async () => {
        if (!editingVehicleId || !editingVehicleData) return

        const vehicleIdToSave = editingVehicleId
        const vehicleDataToSave = editingVehicleData
        const unitNumber = (vehicleDataToSave.unit_number || '').trim()

        if (!unitNumber) {
            setEditingError('Unit number is required.')
            return
        }

        const assets = vehicleDataToSave.assets || []
        for (const asset of assets) {
            if (asset.type === 'BOX' || asset.type === 'POUCH') {
                const ble =
                    asset.ble_tag && typeof asset.ble_tag.identifier === 'string'
                        ? asset.ble_tag.identifier.trim()
                        : ''

                if (!ble) {
                    setEditingError('All BLE identifiers are required.')
                    return
                }
            }
        }

        try {
            const payload = {
                vehicle_id: vehicleIdToSave,
                unit_number: unitNumber,
                station_name: (vehicleDataToSave.station_name || '').trim(),
                assets: (vehicleDataToSave.assets || []).map((asset) => ({
                    id: asset.id,
                    type: asset.type,
                    label: asset.label,
                    ble_identifier:
                        asset.ble_tag && typeof asset.ble_tag.identifier === 'string'
                            ? asset.ble_tag.identifier.trim()
                            : '',
                    parent_asset_id: asset.type === 'POUCH' ? asset.parent_asset_id || null : null
                }))
            }

            const res = await fetch(`${apiBase}/api/updateambulance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const json = await res.json()
            if (!res.ok) throw new Error(json.detail || json.message || 'Update failed')

            await fetchVehicles()
            setExpandedVehicle(vehicleIdToSave)
            setEditingVehicleId(null)
            setEditingVehicleData(null)
            setEditingError('')
        } catch (error) {
            console.error('Error updating device:', error)
            setEditingError(
                error?.message || 'Failed to update device. Please try again.'
            )
        }
    }
    const deleteData = async (vehicleId) => {
        const vehicle = vehicles.find((v) => v.id === vehicleId)
        setError(null)

        try {
            // Delete from Supabase via RPC because direct client writes to
            // `vehicles`/`assets` are restricted by your RLS policy.
            const { error: rpcError } = await supabase.rpc('delete_ambulance', {
                p_vehicle_id: vehicleId
            })
            if (rpcError) throw rpcError

            setVehicles((prev) => prev.filter((v) => v.id !== vehicleId))
            if (vehicle) {
                // Log a UI-level audit entry (separate from telemetry history).
                await supabase.from('alerts').insert({
                    asset_id: vehicleId,
                    vehicle_id: vehicleId,
                    status: 'OPEN',
                    reason: `Device deleted: ${vehicle.unit_number}`,
                    opened_at: new Date().toISOString()
                })
            }

            // Refresh UI after successful deletion.
            await fetchVehicles()

            if (editingVehicleId === vehicleId) {
                handleCancelVehicleEdit()
            }

            if (expandedVehicle === vehicleId) {
                setExpandedVehicle(null)
            }
        } catch (error) {
            console.error('Error deleting device:', error)
            setError('Failed to delete device. Please try again.')
        }
    }

    const handleAddSampleVehicle = (formData) => {
        const newVehicleId = `sample-${Date.now()}`

        const newVehicle = {
            id: newVehicleId,
            unit_number: formData.ambulanceNumber,
            station_name: 'Main Station',
            created_at: new Date().toISOString(),
            assets: [
                {
                    id: `box-1-${newVehicleId}`,
                    type: 'BOX',
                    label: formData.drugBox1Label,
                    ble_tag: { identifier: formData.drugBox1BleId }
                },
                {
                    id: `box-2-${newVehicleId}`,
                    type: 'BOX',
                    label: formData.drugBox2Label,
                    ble_tag: { identifier: formData.drugBox2BleId }
                },
                {
                    id: `pouch-1-${newVehicleId}`,
                    type: 'POUCH',
                    label: formData.narcoticsPouch1Label,
                    parent_asset_id: `box-1-${newVehicleId}`,
                    ble_tag: { identifier: formData.narcoticsPouch1BleId }
                },
                {
                    id: `pouch-2-${newVehicleId}`,
                    type: 'POUCH',
                    label: formData.narcoticsPouch2Label,
                    parent_asset_id: `box-2-${newVehicleId}`,
                    ble_tag: { identifier: formData.narcoticsPouch2BleId }
                }
            ]
        }

        setVehicles((prev) => [...prev, newVehicle])
        setExpandedVehicle(newVehicleId)

        supabase
            .from('alerts')
            .insert({
                asset_id: newVehicleId,
                vehicle_id: newVehicleId,
                status: 'OPEN',
                reason: `Device added: ${formData.ambulanceNumber}`,
                opened_at: new Date().toISOString()
            })
            .catch((error) => console.error('Error logging device add event:', error))
    }

    const handleRegisterAmbulance = async (formData) => {
        const unitNumber = (formData.ambulanceNumber || '').trim()
        if (!unitNumber) throw new Error('Unit number is required.')

        const payload = {
            p_unit_number: unitNumber,
            p_station_name: 'Main Station',
            p_box1_label: (formData.drugBox1Label || '').trim(),
            p_box1_ble_id: (formData.drugBox1BleId || '').trim(),
            p_box2_label: (formData.drugBox2Label || '').trim(),
            p_box2_ble_id: (formData.drugBox2BleId || '').trim(),
            p_pouch1_label: (formData.narcoticsPouch1Label || '').trim(),
            p_pouch1_ble_id: (formData.narcoticsPouch1BleId || '').trim(),
            p_pouch2_label: (formData.narcoticsPouch2Label || '').trim(),
            p_pouch2_ble_id: (formData.narcoticsPouch2BleId || '').trim()
        }

        try {
            const { data, error } = await supabase.rpc('register_ambulance', payload)
            if (error) throw error

            const createdVehicleId =
                typeof data === 'object' && data?.id ? data.id : data

            await supabase.from('alerts').insert({
                asset_id: createdVehicleId,
                vehicle_id: createdVehicleId,
                status: 'OPEN',
                reason: `Device added: ${payload.p_unit_number}`,
                opened_at: new Date().toISOString()
            })

            await fetchVehicles()
            if (createdVehicleId) setExpandedVehicle(createdVehicleId)
        } catch (error) {
            console.error('Error registering ambulance:', error)
            throw error
        }
    }

    return (
        <div className="devices-page">
            <div className="page-container">
                <div className="devices-header">
                    <div className="devices-header-main">
                        <h1 className="devices-header-title">Device Management</h1>
                        <p className="devices-header-subtitle">
                            Register and manage ambulances and BLE assets
                        </p>
                    </div>

                    <div className="devices-header-actions">
                        <button
                            type="button"
                            className="btn-register-ambulance"
                            onClick={() => setShowAddDeviceModal(true)}
                        >
                            <span className="btn-register-icon">+</span>
                            <span>Register Ambulance</span>
                        </button>
                    </div>
                </div>

                <div className="vehicles-list">
                    {fetchLoading ? (
                        <div className="vehicles-state vehicles-state--subtle">
                            Loading vehicles...
                        </div>
                    ) : error ? (
                        <div className="vehicles-state vehicles-state--error">
                            <div className="vehicles-state-message">{error}</div>
                            <Button onClick={fetchVehicles}>Retry</Button>
                        </div>
                    ) : vehicles.length === 0 ? (
                        <div className="vehicles-state vehicles-state--subtle">
                            No vehicles registered yet. Use "Register Ambulance" to add one.
                        </div>
                    ) : (
                        vehicles.map((vehicle) => {
                            const isEditing =
                                editingVehicleId === vehicle.id &&
                                expandedVehicle === vehicle.id &&
                                editingVehicleData

                            const currentVehicle =
                                isEditing &&
                                    editingVehicleData &&
                                    editingVehicleData.id === vehicle.id
                                    ? editingVehicleData
                                    : vehicle

                            const assets = currentVehicle.assets || []
                            const drugBoxes = assets.filter((a) => a.type === 'BOX') || []
                            const pouches = assets.filter((a) => a.type === 'POUCH') || []

                            const boxLabelById = drugBoxes.reduce((acc, box) => {
                                acc[box.id] = box.label
                                return acc
                            }, {})

                            const raspberryPiOptions = [
                                ...(currentVehicle.raspberry_pi?.name
                                    ? [
                                        {
                                            piKey: currentVehicle.raspberry_pi.name,
                                            ipAddress: currentVehicle.raspberry_pi.ip_address || ''
                                        }
                                    ]
                                    : []),
                                ...availablePis.filter(
                                    (pi) => pi.piKey !== currentVehicle.raspberry_pi?.name
                                )
                            ]
                            const selectedEditPi = allPis.find(
                                (pi) => pi.piKey === currentVehicle.raspberry_pi?.name
                            )
                            const selectedEditPiDevices = Array.isArray(selectedEditPi?.devices)
                                ? selectedEditPi.devices
                                : []
                            const getBleOptionsForType = (assetType) =>
                                selectedEditPiDevices.filter((device) =>
                                    (device.name || '').toLowerCase().includes(
                                        assetType === 'BOX' ? 'box' : 'pouch'
                                    )
                                )

                            return (
                                <div key={vehicle.id} className="vehicle-card">
                                    <div
                                        className="vehicle-card-header"
                                        onClick={() => toggleVehicle(vehicle.id)}
                                    >
                                        <div className="vehicle-card-header-main">
                                            <div className="vehicle-card-title">
                                                <span className="vehicle-card-icon" aria-hidden="true">
                                                    🚑
                                                </span>
                                                <div className="vehicle-card-title-text">
                                                    <div className="vehicle-card-unit">
                                                        {currentVehicle.unit_number}
                                                        {vehicle.id?.startsWith('sample-') && (
                                                            <span className="vehicle-card-sample-pill">
                                                                SAMPLE
                                                            </span>
                                                        )}
                                                    </div>
                                                    {currentVehicle.station_name && (
                                                        <div className="vehicle-card-station">
                                                            {currentVehicle.station_name}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="vehicle-card-header-actions">
                                            <button
                                                type="button"
                                                className="icon-button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (expandedVehicle !== vehicle.id) {
                                                        setExpandedVehicle(vehicle.id)
                                                    }
                                                    startVehicleEdit(currentVehicle)
                                                }}
                                                aria-label="Edit ambulance"
                                            >
                                                ✏️
                                            </button>

                                            <button
                                                type="button"
                                                className="icon-button icon-button-danger"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    deleteData(vehicle.id)
                                                }}
                                                aria-label="Delete ambulance"
                                            >
                                                🗑
                                            </button>

                                            <span className="vehicle-card-toggle" aria-hidden="true">
                                                {expandedVehicle === vehicle.id ? '▾' : '▸'}
                                            </span>
                                        </div>
                                    </div>

                                    {expandedVehicle === vehicle.id && (
                                        <div className="vehicle-card-body">
                                            <div className="vehicle-section">
                                                <div className="vehicle-section-label">AMBULANCE</div>
                                                <div className="vehicle-ambulance-grid">
                                                    <div className="vehicle-field">
                                                        <div className="vehicle-field-label">Unit number</div>
                                                        <div className="vehicle-field-value">
                                                            {isEditing ? (
                                                                <Input
                                                                    value={currentVehicle.unit_number || ''}
                                                                    onChange={(e) =>
                                                                        handleAmbulanceFieldChange(
                                                                            'unit_number',
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                />
                                                            ) : (
                                                                currentVehicle.unit_number
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="vehicle-field">
                                                        <div className="vehicle-field-label">Station</div>
                                                        <div className="vehicle-field-value">
                                                            {isEditing ? (
                                                                <Input
                                                                    value={currentVehicle.station_name || ''}
                                                                    onChange={(e) =>
                                                                        handleAmbulanceFieldChange(
                                                                            'station_name',
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                />
                                                            ) : (
                                                                currentVehicle.station_name || '—'
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="vehicle-field">
                                                        <div className="vehicle-field-label">Raspberry Pi</div>
                                                        <div className="vehicle-field-value">
                                                            {isEditing ? (
                                                                <select
                                                                    value={currentVehicle.raspberry_pi?.name || ''}
                                                                    onChange={(e) =>
                                                                        handleRaspberryPiChange(
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    className="vehicle-asset-select"
                                                                    disabled={piLoading}
                                                                >
                                                                    <option value="">
                                                                        {piLoading
                                                                            ? 'Loading Raspberry Pis...'
                                                                            : 'Select Raspberry Pi'}
                                                                    </option>
                                                                    {raspberryPiOptions.map((pi) => (
                                                                        <option key={pi.piKey} value={pi.piKey}>
                                                                            {pi.piKey}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                currentVehicle.raspberry_pi?.name || '—'
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="vehicle-field">
                                                        <div className="vehicle-field-label">Pi IP Address</div>
                                                        <div className="vehicle-field-value">
                                                            {isEditing ? (
                                                                <div className="vehicle-asset-value">
                                                                    {currentVehicle.raspberry_pi?.ip_address || '—'}
                                                                </div>
                                                            ) : (
                                                                currentVehicle.raspberry_pi?.ip_address || '—'
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {isEditing && piLoadError && (
                                                <div
                                                    style={{
                                                        color: '#b91c1c',
                                                        fontSize: '13px',
                                                        marginTop: '8px'
                                                    }}
                                                >
                                                    {piLoadError}
                                                </div>
                                            )}

                                            <div className="vehicle-section">
                                                <div className="vehicle-section-label">BOXES</div>
                                                {drugBoxes.length === 0 ? (
                                                    <div className="vehicle-empty-row">
                                                        No boxes configured for this ambulance.
                                                    </div>
                                                ) : (
                                                    <div className="vehicle-assets-grid">
                                                        {drugBoxes.map((box, index) => (
                                                            <div key={box.id} className="vehicle-asset-card">
                                                                <div className="vehicle-asset-header">
                                                                    <span className="vehicle-asset-icon">📦</span>
                                                                    <span className="vehicle-asset-title">
                                                                        Box {index + 1}
                                                                    </span>
                                                                </div>
                                                                <div className="vehicle-asset-body">
                                                                    <div className="vehicle-asset-field">
                                                                        <div className="vehicle-asset-label">Label</div>
                                                                        {isEditing ? (
                                                                            <Input
                                                                                value={box.label || ''}
                                                                                onChange={(e) =>
                                                                                    handleAssetLabelChange(
                                                                                        box.id,
                                                                                        e.target.value
                                                                                    )
                                                                                }
                                                                            />
                                                                        ) : (
                                                                            <div className="vehicle-asset-value">
                                                                                {box.label}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="vehicle-asset-field">
                                                                        <div className="vehicle-asset-label">BLE Identifier</div>
                                                                        {isEditing ? (
                                                                            <select
                                                                                value={box.ble_tag?.identifier || ''}
                                                                                onChange={(e) =>
                                                                                    handleAssetBleChange(
                                                                                        box.id,
                                                                                        e.target.value
                                                                                    )
                                                                                }
                                                                                className="vehicle-asset-select"
                                                                            >
                                                                                <option value="">
                                                                                    Select device address
                                                                                </option>
                                                                                {getBleOptionsForType('BOX').map(
                                                                                    (device, deviceIndex) => (
                                                                                        <option
                                                                                            key={`${device.address || 'box'}-${deviceIndex}`}
                                                                                            value={device.address || ''}
                                                                                        >
                                                                                            {device.address || 'No address'}
                                                                                        </option>
                                                                                    )
                                                                                )}
                                                                            </select>
                                                                        ) : (
                                                                            <div className="vehicle-asset-ble">
                                                                                {box.ble_tag?.identifier}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="vehicle-asset-field">
                                                                        <div className="vehicle-asset-label">Tag Model</div>
                                                                        <div className="vehicle-asset-value">
                                                                            {box.ble_tag?.tag_model || '—'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="vehicle-section">
                                                <div className="vehicle-section-label">POUCHES</div>
                                                {pouches.length === 0 ? (
                                                    <div className="vehicle-empty-row">
                                                        No pouches configured for this ambulance.
                                                    </div>
                                                ) : (
                                                    <div className="vehicle-assets-grid">
                                                        {pouches.map((pouch, index) => {
                                                            const parentLabel = pouch.parent_asset_id
                                                                ? boxLabelById[pouch.parent_asset_id] ||
                                                                'Unassigned'
                                                                : 'Unassigned'

                                                            return (
                                                                <div key={pouch.id} className="vehicle-asset-card">
                                                                    <div className="vehicle-asset-header">
                                                                        <span className="vehicle-asset-icon">👝</span>
                                                                        <span className="vehicle-asset-title">
                                                                            Pouch {index + 1}
                                                                        </span>
                                                                    </div>
                                                                    <div className="vehicle-asset-body">
                                                                        <div className="vehicle-asset-field">
                                                                            <div className="vehicle-asset-label">Label</div>
                                                                            {isEditing ? (
                                                                                <Input
                                                                                    value={pouch.label || ''}
                                                                                    onChange={(e) =>
                                                                                        handleAssetLabelChange(
                                                                                            pouch.id,
                                                                                            e.target.value
                                                                                        )
                                                                                    }
                                                                                />
                                                                            ) : (
                                                                                <div className="vehicle-asset-value">
                                                                                    {pouch.label}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="vehicle-asset-field">
                                                                            <div className="vehicle-asset-label">BLE Identifier</div>
                                                                            {isEditing ? (
                                                                                <select
                                                                                    value={pouch.ble_tag?.identifier || ''}
                                                                                    onChange={(e) =>
                                                                                        handleAssetBleChange(
                                                                                            pouch.id,
                                                                                            e.target.value
                                                                                        )
                                                                                    }
                                                                                    className="vehicle-asset-select"
                                                                                >
                                                                                    <option value="">
                                                                                        Select device address
                                                                                    </option>
                                                                                    {getBleOptionsForType('POUCH').map(
                                                                                        (device, deviceIndex) => (
                                                                                            <option
                                                                                                key={`${device.address || 'pouch'}-${deviceIndex}`}
                                                                                                value={device.address || ''}
                                                                                            >
                                                                                                {device.address || 'No address'}
                                                                                            </option>
                                                                                        )
                                                                                    )}
                                                                                </select>
                                                                            ) : (
                                                                                <div className="vehicle-asset-ble">
                                                                                    {pouch.ble_tag?.identifier}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="vehicle-asset-field">
                                                                            <div className="vehicle-asset-label">Tag Model</div>
                                                                            <div className="vehicle-asset-value">
                                                                                {pouch.ble_tag?.tag_model || '—'}
                                                                            </div>
                                                                        </div>
                                                                        <div className="vehicle-asset-field">
                                                                            <div className="vehicle-asset-label">Assigned to</div>
                                                                            {isEditing ? (
                                                                                <select
                                                                                    value={pouch.parent_asset_id || ''}
                                                                                    onChange={(e) =>
                                                                                        handleAssetParentChange(
                                                                                            pouch.id,
                                                                                            e.target.value
                                                                                        )
                                                                                    }
                                                                                    className="vehicle-asset-select"
                                                                                >
                                                                                    <option value="">Unassigned</option>
                                                                                    {drugBoxes.map((box) => (
                                                                                        <option
                                                                                            key={box.id}
                                                                                            value={box.id}
                                                                                        >
                                                                                            {box.label}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            ) : (
                                                                                <div className="vehicle-asset-value">
                                                                                    {parentLabel}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {isEditing && editingError && (
                                                <div
                                                    style={{
                                                        color: '#b91c1c',
                                                        fontSize: '13px',
                                                        marginTop: '8px',
                                                        textAlign: 'right'
                                                    }}
                                                >
                                                    {editingError}
                                                </div>
                                            )}

                                            {isEditing && (
                                                <div className="vehicle-card-footer">
                                                    <button
                                                        type="button"
                                                        className="btn-secondary-outline"
                                                        onClick={handleCancelVehicleEdit}
                                                    >
                                                        Cancel Changes
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-primary-save"
                                                        onClick={handleSaveVehicleEdit}
                                                    >
                                                        Save Changes
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>

                <AddDeviceModal
                    show={showAddDeviceModal}
                    onClose={() => setShowAddDeviceModal(false)}
                    onSuccess={handleRegisterAmbulance}
                    availablePis={availablePis}
                    piLoading={piLoading}
                    piLoadError={piLoadError}
                    onRefreshPis={fetchPiDetails}
                />
            </div>
        </div>
    )
}

export default DeviceManagement
