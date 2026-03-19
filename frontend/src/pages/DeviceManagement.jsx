import { useState, useEffect } from 'react'
import { Card, Button, Input, Typography, Divider } from '@supabase/ui'
import { supabase } from '../supabaseClient'
import AddDeviceModal from '../components/AddDeviceModal'


function DeviceManagement() {
    const [showAddDeviceModal, setShowAddDeviceModal] = useState(false)

    const [vehicles, setVehicles] = useState([])
    const [expandedVehicle, setExpandedVehicle] = useState(null)
    const [fetchLoading, setFetchLoading] = useState(true)
    const [error, setError] = useState(null)
    const [editingValues, setEditingValues] = useState({})
    const [editingField, setEditingField] = useState(null)
    const [editingVehicleId, setEditingVehicleId] = useState(null)
    const [editingVehicleData, setEditingVehicleData] = useState(null)
    const [editingError, setEditingError] = useState('')

    useEffect(() => {
        fetchVehicles()
    }, [])

    const fetchVehicles = async () => {
        try {
            setFetchLoading(true)
            setError(null)

            const { data, error: fetchError } = await supabase
                .from('vehicles')
                .select(`
                    *,
                    assets:assets(
                        *,
                        ble_tag:ble_tags(*)
                    )
                `)
                .order('created_at', { ascending: false })

            if (fetchError) {
                throw fetchError
            }

            setVehicles(data || [])
        } catch (err) {
            console.error('Error fetching vehicles:', err)
            setError('Failed to load vehicles. Please try again.')
        } finally {
            setFetchLoading(false)
        }
    }

    const toggleVehicle = (vehicleId) => {
        setExpandedVehicle(expandedVehicle === vehicleId ? null : vehicleId)
    }

    const startEditing = (fieldId) => {
        setEditingField(fieldId)
    }

    const saveEdit = (fieldId, assetId, fieldType) => {
        const newValue = editingValues[fieldId]
        if (newValue) {
            console.log(`Saving ${fieldType} for asset ${assetId}: ${newValue}`)
        }
        setEditingField(null)
    }

    const cancelEdit = () => {
        setEditingField(null)
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
        if (!editingVehicleData) return
        setEditingVehicleData((prev) => ({
            ...prev,
            [field]: value
        }))
    }

    const handleAssetLabelChange = (assetId, value) => {
        if (!editingVehicleData) return
        setEditingVehicleData((prev) => ({
            ...prev,
            assets: (prev.assets || []).map((asset) =>
                asset.id === assetId ? { ...asset, label: value } : asset
            )
        }))
    }

    const handleAssetBleChange = (assetId, value) => {
        if (!editingVehicleData) return
        setEditingVehicleData((prev) => ({
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
        }))
    }

    const handleAssetParentChange = (assetId, parentId) => {
        if (!editingVehicleData) return
        setEditingVehicleData((prev) => ({
            ...prev,
            assets: (prev.assets || []).map((asset) =>
                asset.id === assetId ? { ...asset, parent_asset_id: parentId || null } : asset
            )
        }))
    }

    const handleCancelVehicleEdit = () => {
        setEditingVehicleId(null)
        setEditingVehicleData(null)
        setEditingError('')
    }

    const handleSaveVehicleEdit = () => {
        if (!editingVehicleId || !editingVehicleData) return

        const unitNumber = (editingVehicleData.unit_number || '').trim()
        if (!unitNumber) {
            setEditingError('Unit number is required.')
            return
        }

        const assets = editingVehicleData.assets || []
        for (const asset of assets) {
            if (asset.type === 'BOX' || asset.type === 'POUCH') {
                const ble = asset.ble_tag && typeof asset.ble_tag.identifier === 'string'
                    ? asset.ble_tag.identifier.trim()
                    : ''
                if (!ble) {
                    setEditingError('All BLE identifiers are required.')
                    return
                }
            }
        }

        setVehicles((prev) =>
            prev.map((v) => (v.id === editingVehicleId ? editingVehicleData : v))
        )
        setEditingVehicleId(null)
        setEditingVehicleData(null)
        setEditingError('')
    }

    const deleteData = (vehicleId) => {
        setVehicles((prev) => prev.filter((v) => v.id !== vehicleId))
        if (editingVehicleId === vehicleId) {
            setEditingVehicleId(null)
            setEditingVehicleData(null)
            setEditingError('')
        }
        if (expandedVehicle === vehicleId) {
            setExpandedVehicle(null)
        }
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

        // Your RLS policy blocks client inserts into `vehicles`/`assets`,
        // so we use an RPC function (SECURITY DEFINER) to do the write safely.
        const { data, error: rpcError } = await supabase.rpc('register_ambulance', payload)
        if (rpcError) throw rpcError

        await fetchVehicles()
        if (data) setExpandedVehicle(data)
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
                            <Button onClick={fetchVehicles}>
                                Retry
                            </Button>
                        </div>
                    ) : vehicles.length === 0 ? (
                        <div className="vehicles-state vehicles-state--subtle">
                            No vehicles registered yet. Use &quot;Register Ambulance&quot; to add one.
                        </div>
                    ) : (
                        vehicles.map((vehicle) => {
                            const isEditing = editingVehicleId === vehicle.id && expandedVehicle === vehicle.id && editingVehicleData
                            const currentVehicle = isEditing && editingVehicleData && editingVehicleData.id === vehicle.id
                                ? editingVehicleData
                                : vehicle
                            const assets = currentVehicle.assets || []
                            const drugBoxes = assets.filter(a => a.type === 'BOX') || []
                            const pouches = assets.filter(a => a.type === 'POUCH') || []
                            const boxLabelById = drugBoxes.reduce((acc, box) => {
                                acc[box.id] = box.label
                                return acc
                            }, {})

                            return (
                                <div key={vehicle.id} className="vehicle-card">
                                    <div
                                        className="vehicle-card-header"
                                        onClick={() => toggleVehicle(vehicle.id)}
                                    >
                                        <div className="vehicle-card-header-main">
                                            <div className="vehicle-card-title">
                                                <span className="vehicle-card-icon" aria-hidden="true">🚑</span>
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
                                                                    onChange={(e) => handleAmbulanceFieldChange('unit_number', e.target.value)}
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
                                                                    onChange={(e) => handleAmbulanceFieldChange('station_name', e.target.value)}
                                                                />
                                                            ) : (
                                                                currentVehicle.station_name || '—'
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="vehicle-section">
                                                <div className="vehicle-section-label">DRUG BOXES</div>
                                                {drugBoxes.length === 0 ? (
                                                    <div className="vehicle-empty-row">
                                                        No drug boxes configured for this ambulance.
                                                    </div>
                                                ) : (
                                                    drugBoxes.map((box, index) => {
                                                        return (
                                                            <div key={box.id} className="vehicle-row">
                                                                <div className="vehicle-row-main">
                                                                    <span className="vehicle-row-prefix">
                                                                        Box {index + 1}
                                                                    </span>
                                                                    {isEditing ? (
                                                                        <Input
                                                                            value={box.label || ''}
                                                                            onChange={(e) => handleAssetLabelChange(box.id, e.target.value)}
                                                                            style={{ width: '160px' }}
                                                                        />
                                                                    ) : (
                                                                        <span className="vehicle-row-label">{box.label}</span>
                                                                    )}
                                                                </div>
                                                                <div className="vehicle-row-meta">
                                                                    <span className="pill pill-ble">
                                                                        {isEditing ? (
                                                                            <span className="pill-code">
                                                                                <Input
                                                                                    value={box.ble_tag?.identifier || ''}
                                                                                    onChange={(e) => handleAssetBleChange(box.id, e.target.value)}
                                                                                    style={{ width: '190px' }}
                                                                                />
                                                                            </span>
                                                                        ) : (
                                                                            <span
                                                                                className="pill-code"
                                                                            >
                                                                                {box.ble_tag?.identifier}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )
                                                    })
                                                )}
                                            </div>

                                            <div className="vehicle-section">
                                                <div className="vehicle-section-label">NARCOTICS POUCHES</div>
                                                {pouches.length === 0 ? (
                                                    <div className="vehicle-empty-row">
                                                        No narcotics pouches configured for this ambulance.
                                                    </div>
                                                ) : (
                                                    pouches.map((pouch, index) => {
                                                        const parentLabel = pouch.parent_asset_id
                                                            ? boxLabelById[pouch.parent_asset_id] || 'Unassigned'
                                                            : 'Unassigned'

                                                        return (
                                                            <div key={pouch.id} className="vehicle-row">
                                                                <div className="vehicle-row-main">
                                                                    <span className="vehicle-row-prefix">
                                                                        Pouch {index + 1}
                                                                    </span>
                                                                    {isEditing ? (
                                                                        <Input
                                                                            value={pouch.label || ''}
                                                                            onChange={(e) => handleAssetLabelChange(pouch.id, e.target.value)}
                                                                            style={{ width: '180px' }}
                                                                        />
                                                                    ) : (
                                                                        <span className="vehicle-row-label">{pouch.label}</span>
                                                                    )}
                                                                </div>
                                                                <div className="vehicle-row-meta vehicle-row-meta--pouch">
                                                                    <span className="pill pill-ble">
                                                                        {isEditing ? (
                                                                            <span className="pill-code">
                                                                                <Input
                                                                                    value={pouch.ble_tag?.identifier || ''}
                                                                                    onChange={(e) => handleAssetBleChange(pouch.id, e.target.value)}
                                                                                    style={{ width: '190px' }}
                                                                                />
                                                                            </span>
                                                                        ) : (
                                                                            <span
                                                                                className="pill-code"
                                                                            >
                                                                                {pouch.ble_tag?.identifier}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                    {isEditing ? (
                                                                        <select
                                                                            value={pouch.parent_asset_id || ''}
                                                                            onChange={(e) => handleAssetParentChange(pouch.id, e.target.value)}
                                                                        >
                                                                            <option value="">Unassigned</option>
                                                                            {drugBoxes.map((box) => (
                                                                                <option key={box.id} value={box.id}>
                                                                                    {box.label}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <span className="pill pill-soft">
                                                                            {parentLabel}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )
                                                    })
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
                />
            </div>
        </div>
    )
}

export default DeviceManagement