import { useState, useEffect } from 'react'
import { Card, Button, Input, Typography, Divider } from '@supabase/ui'
import { supabase } from '../supabaseClient'
import AddDeviceModal from '../components/AddDeviceModal'


function DeviceManagement() {
    const [showAddDeviceModal, setShowAddDeviceModal] = useState(false)

    const sampleVehicles = [
        {
            id: 'sample-1',
            unit_number: 'AMB-001',
            station_name: 'Scottsdale Station 3',
            created_at: new Date().toISOString(),
            assets: [
                {
                    id: 'box-1',
                    type: 'BOX',
                    label: 'Primary Drug Box',
                    ble_tag: {
                        identifier: 'AC:23:3F:A4:12:89'
                    }
                },
                {
                    id: 'box-2',
                    type: 'BOX',
                    label: 'Secondary Drug Box',
                    ble_tag: {
                        identifier: 'AC:23:3F:A4:12:90'
                    }
                },
                {
                    id: 'pouch-1',
                    type: 'POUCH',
                    label: 'Controlled Substances A',
                    parent_asset_id: 'box-1',
                    ble_tag: {
                        identifier: 'AC:23:3F:A4:12:91'
                    }
                },
                {
                    id: 'pouch-2',
                    type: 'POUCH',
                    label: 'Controlled Substances B',
                    parent_asset_id: 'box-2',
                    ble_tag: {
                        identifier: 'AC:23:3F:A4:12:92'
                    }
                }
            ]
        }
    ]

    const [vehicles, setVehicles] = useState(sampleVehicles)
    const [expandedVehicle, setExpandedVehicle] = useState('sample-1')
    const [fetchLoading, setFetchLoading] = useState(true)
    const [error, setError] = useState(null)
    const [editingValues, setEditingValues] = useState({})
    const [editingField, setEditingField] = useState(null)

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

            const realVehicles = (data || []).filter(v => !v.id?.startsWith('sample-'))
            setVehicles(sampleVehicles)
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
    const deleteData = () =>{
        setVehicles([])
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

    setVehicles(prev => [...prev, newVehicle])
    console.log(vehicles)
    setExpandedVehicle(newVehicleId)
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
                            const drugBoxes = vehicle.assets?.filter(a => a.type === 'BOX') || []
                            const pouches = vehicle.assets?.filter(a => a.type === 'POUCH') || []
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
                                                        {vehicle.unit_number}
                                                        {vehicle.id?.startsWith('sample-') && (
                                                            <span className="vehicle-card-sample-pill">
                                                                SAMPLE
                                                            </span>
                                                        )}
                                                    </div>
                                                    {vehicle.station_name && (
                                                        <div className="vehicle-card-station">
                                                            {vehicle.station_name}
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
                                                }}
                                                aria-label="Edit ambulance (coming soon)"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                type="button"
                                                className="icon-button icon-button-danger"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (window.confirm(`Delete ${vehicle.unit_number}?`)) {
                                                        console.log('Delete vehicle:', vehicle.id)
                                                        deleteData()
                                                    }
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
                                                            {vehicle.unit_number}
                                                        </div>
                                                    </div>
                                                    {vehicle.station_name && (
                                                        <div className="vehicle-field">
                                                            <div className="vehicle-field-label">Station</div>
                                                            <div className="vehicle-field-value">
                                                                {vehicle.station_name}
                                                            </div>
                                                        </div>
                                                    )}
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
                                                        const labelFieldId = `${box.id}-label`
                                                        const bleFieldId = `${box.id}-ble`
                                                        const isLabelEditing = editingField === labelFieldId
                                                        const isBleEditing = editingField === bleFieldId

                                                        return (
                                                            <div key={box.id} className="vehicle-row">
                                                                <div className="vehicle-row-main">
                                                                    <span className="vehicle-row-prefix">
                                                                        Box {index + 1}
                                                                    </span>
                                                                    {vehicle.id?.startsWith('sample-') ? (
                                                                        isLabelEditing ? (
                                                                            <Input
                                                                                value={editingValues[labelFieldId] ?? box.label}
                                                                                onChange={(e) => setEditingValues({ ...editingValues, [labelFieldId]: e.target.value })}
                                                                                style={{ width: '160px' }}
                                                                            />
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                className="vehicle-inline-edit"
                                                                                onClick={() => startEditing(labelFieldId)}
                                                                            >
                                                                                {editingValues[labelFieldId] || box.label}
                                                                            </button>
                                                                        )
                                                                    ) : (
                                                                        <span className="vehicle-row-label">{box.label}</span>
                                                                    )}
                                                                </div>
                                                                <div className="vehicle-row-meta">
                                                                    <span className="pill pill-ble">
                                                                        {vehicle.id?.startsWith('sample-') && isBleEditing ? (
                                                                            <>
                                                                                <Input
                                                                                    value={editingValues[bleFieldId] ?? box.ble_tag?.identifier}
                                                                                    onChange={(e) => setEditingValues({ ...editingValues, [bleFieldId]: e.target.value })}
                                                                                    style={{ width: '190px' }}
                                                                                />
                                                                                <Button
                                                                                    size="tiny"
                                                                                    type="primary"
                                                                                    onClick={() => saveEdit(bleFieldId, box.id, 'ble')}
                                                                                >
                                                                                    Save
                                                                                </Button>
                                                                                <Button
                                                                                    size="tiny"
                                                                                    type="secondary"
                                                                                    onClick={cancelEdit}
                                                                                >
                                                                                    Cancel
                                                                                </Button>
                                                                            </>
                                                                        ) : (
                                                                            <span
                                                                                className="pill-code"
                                                                                onClick={() => {
                                                                                    if (vehicle.id?.startsWith('sample-')) {
                                                                                        startEditing(bleFieldId)
                                                                                    }
                                                                                }}
                                                                            >
                                                                                {editingValues[bleFieldId] || box.ble_tag?.identifier}
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
                                                        const labelFieldId = `${pouch.id}-label`
                                                        const bleFieldId = `${pouch.id}-ble`
                                                        const isLabelEditing = editingField === labelFieldId
                                                        const isBleEditing = editingField === bleFieldId

                                                        const parentLabel = pouch.parent_asset_id
                                                            ? boxLabelById[pouch.parent_asset_id] || 'Unassigned'
                                                            : 'Unassigned'

                                                        return (
                                                            <div key={pouch.id} className="vehicle-row">
                                                                <div className="vehicle-row-main">
                                                                    <span className="vehicle-row-prefix">
                                                                        Pouch {index + 1}
                                                                    </span>
                                                                    {vehicle.id?.startsWith('sample-') ? (
                                                                        isLabelEditing ? (
                                                                            <Input
                                                                                value={editingValues[labelFieldId] ?? pouch.label}
                                                                                onChange={(e) => setEditingValues({ ...editingValues, [labelFieldId]: e.target.value })}
                                                                                style={{ width: '180px' }}
                                                                            />
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                className="vehicle-inline-edit"
                                                                                onClick={() => startEditing(labelFieldId)}
                                                                            >
                                                                                {editingValues[labelFieldId] || pouch.label}
                                                                            </button>
                                                                        )
                                                                    ) : (
                                                                        <span className="vehicle-row-label">{pouch.label}</span>
                                                                    )}
                                                                </div>
                                                                <div className="vehicle-row-meta vehicle-row-meta--pouch">
                                                                    <span className="pill pill-ble">
                                                                        {vehicle.id?.startsWith('sample-') && isBleEditing ? (
                                                                            <>
                                                                                <Input
                                                                                    value={editingValues[bleFieldId] ?? pouch.ble_tag?.identifier}
                                                                                    onChange={(e) => setEditingValues({ ...editingValues, [bleFieldId]: e.target.value })}
                                                                                    style={{ width: '190px' }}
                                                                                />
                                                                                <Button
                                                                                    size="tiny"
                                                                                    type="primary"
                                                                                    onClick={() => saveEdit(bleFieldId, pouch.id, 'ble')}
                                                                                >
                                                                                    Save
                                                                                </Button>
                                                                                <Button
                                                                                    size="tiny"
                                                                                    type="secondary"
                                                                                    onClick={cancelEdit}
                                                                                >
                                                                                    Cancel
                                                                                </Button>
                                                                            </>
                                                                        ) : (
                                                                            <span
                                                                                className="pill-code"
                                                                                onClick={() => {
                                                                                    if (vehicle.id?.startsWith('sample-')) {
                                                                                        startEditing(bleFieldId)
                                                                                    }
                                                                                }}
                                                                            >
                                                                                {editingValues[bleFieldId] || pouch.ble_tag?.identifier}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                    <span className="pill pill-soft">
                                                                        {parentLabel}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )
                                                    })
                                                )}
                                            </div>

                                            <div className="vehicle-card-footer">
                                                <button
                                                    type="button"
                                                    className="btn-secondary-outline"
                                                >
                                                    Cancel Changes
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-primary-save"
                                                >
                                                    Save Changes
                                                </button>
                                            </div>
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
                    onSuccess={handleAddSampleVehicle}
                />
            </div>
        </div>
    )
}

export default DeviceManagement