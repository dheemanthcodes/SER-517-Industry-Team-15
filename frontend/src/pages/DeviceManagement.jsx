import { useState, useEffect } from 'react'
import { Card, Button, Input, Typography, Divider } from '@supabase/ui'
import { supabase } from '../supabaseClient'
import AddDeviceModal from '../components/AddDeviceModal'


function DeviceManagement() {
    const [showAddDeviceModal, setShowAddDeviceModal] = useState(false)

    // Sample/Mock data for demonstration
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
            //setVehicles([...sampleVehicles, ...realVehicles])
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
            // Here you would typically update the database
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
        <div className="page-container">
            <div className="page-header">
                <Typography.Title level={2}>Device Management</Typography.Title>
                <Typography.Text type="secondary">Manage your connected devices</Typography.Text>
            </div>

            <div className="device-grid">
                <div onClick={() => setShowAddDeviceModal(true)} style={{ cursor: 'pointer' }}>
                    <Card className="device-card add-device">
                        <div className="device-icon">➕</div>
                        <Typography.Title level={4}>Add Device</Typography.Title>
                        <Typography.Text type="secondary">Connect new device</Typography.Text>
                    </Card>
                </div>
            </div>

            <div className="devices-list" style={{ marginTop: '40px' }}>
                <Typography.Title level={3} style={{ color: 'white', marginBottom: '20px' }}>
                    Registered Ambulances
                </Typography.Title>

                {fetchLoading ? (
                    <div style={{ color: 'white', textAlign: 'center', padding: '20px' }}>
                        Loading vehicles...
                    </div>
                ) : error ? (
                    <div style={{ color: '#ff6b6b', textAlign: 'center', padding: '20px', background: 'rgba(255,0,0,0.1)', borderRadius: '8px' }}>
                        {error}
                        <br />
                        <Button onClick={fetchVehicles} style={{ marginTop: '10px' }}>
                            Retry
                        </Button>
                    </div>
                ) : vehicles.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', padding: '20px' }}>
                        No vehicles registered yet. Click "Add Device" to register an ambulance.
                    </div>
                ) : (
                    vehicles.map((vehicle) => {
                        const drugBoxes = vehicle.assets?.filter(a => a.type === 'BOX') || []
                        const pouches = vehicle.assets?.filter(a => a.type === 'POUCH') || []

                        return (
                            <div key={vehicle.id} className="device-entry">
                                <div
                                    className="device-entry-header"
                                    onClick={() => toggleVehicle(vehicle.id)}
                                >
                                    <span className="device-entry-title">
                                        🚑 {vehicle.unit_number}
                                        {vehicle.id?.startsWith('sample-') && (
                                            <span style={{
                                                background: '#f59e0b',
                                                color: 'white',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '10px',
                                                marginLeft: '8px'
                                            }}>SAMPLE</span>
                                        )}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <button
                                            onClick={(e) => {
                                                
                                                e.stopPropagation()
                                                if (window.confirm(`Delete ${vehicle.unit_number}?`)) {
                                                    console.log('Delete vehicle:', vehicle.id)
                                                    deleteData()
                                                }
                                            }}
                                            style={{
                                                background: '#ff6b6b',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                padding: '4px 12px',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            🗑️ Delete
                                        </button>
                                        <span className="device-entry-toggle">
                                            {expandedVehicle === vehicle.id ? '▼' : '▶'}
                                        </span>
                                    </div>
                                </div>

                                {expandedVehicle === vehicle.id && (
                                    <div className="device-entry-content">
                                        <div className="device-info-section">
                                            <Typography.Title level={5}>Ambulance</Typography.Title>
                                            <div className="device-info-row">
                                                <span>Unit Number: {vehicle.unit_number}</span>
                                            </div>
                                            {vehicle.station_name && (
                                                <div className="device-info-row">
                                                    <span>Station: {vehicle.station_name}</span>
                                                </div>
                                            )}
                                        </div>

                                        {drugBoxes.length > 0 && (
                                            <div className="device-info-section">
                                                <Typography.Title level={5}>Drug Boxes</Typography.Title>
                                                {drugBoxes.map((box, index) => {
                                                    const labelFieldId = `${box.id}-label`
                                                    const bleFieldId = `${box.id}-ble`
                                                    const isLabelEditing = editingField === labelFieldId
                                                    const isBleEditing = editingField === bleFieldId

                                                    return (
                                                        <div key={box.id} className="device-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>Box {index + 1}:</span>
                                                                {vehicle.id?.startsWith('sample-') ? (
                                                                    isLabelEditing ? (
                                                                        <Input
                                                                            value={editingValues[labelFieldId] ?? box.label}
                                                                            onChange={(e) => setEditingValues({ ...editingValues, [labelFieldId]: e.target.value })}
                                                                            style={{ background: 'transparent', color: 'white', width: '150px' }}
                                                                        />
                                                                    ) : (
                                                                        <span
                                                                            style={{ fontWeight: 600, cursor: 'pointer', padding: '2px 6px', borderRadius: '4px' }}
                                                                            onClick={() => startEditing(labelFieldId)}
                                                                        >
                                                                            {editingValues[labelFieldId] || box.label}
                                                                        </span>
                                                                    )
                                                                ) : (
                                                                    <span style={{ fontWeight: 600 }}>{box.label}</span>
                                                                )}
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>BLE:</span>
                                                                {vehicle.id?.startsWith('sample-') ? (
                                                                    isBleEditing ? (
                                                                        <>
                                                                            <Input
                                                                                value={editingValues[bleFieldId] ?? box.ble_tag?.identifier}
                                                                                onChange={(e) => setEditingValues({ ...editingValues, [bleFieldId]: e.target.value })}
                                                                                style={{ background: 'transparent', color: 'white', width: '180px' }}
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
                                                                            style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                                                            onClick={() => startEditing(bleFieldId)}
                                                                        >
                                                                            {editingValues[bleFieldId] || box.ble_tag?.identifier}
                                                                        </span>
                                                                    )
                                                                ) : (
                                                                    <span style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '2px 8px', borderRadius: '4px' }}>
                                                                        {box.ble_tag?.identifier}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}

                                        {pouches.length > 0 && (
                                            <div className="device-info-section">
                                                <Typography.Title level={5}>Narcotics Pouches</Typography.Title>
                                                {pouches.map((pouch, index) => {
                                                    const labelFieldId = `${pouch.id}-label`
                                                    const bleFieldId = `${pouch.id}-ble`
                                                    const isLabelEditing = editingField === labelFieldId
                                                    const isBleEditing = editingField === bleFieldId

                                                    return (
                                                        <div key={pouch.id} className="device-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>Pouch {index + 1}:</span>
                                                                {vehicle.id?.startsWith('sample-') ? (
                                                                    isLabelEditing ? (
                                                                        <Input
                                                                            value={editingValues[labelFieldId] ?? pouch.label}
                                                                            onChange={(e) => setEditingValues({ ...editingValues, [labelFieldId]: e.target.value })}
                                                                            style={{ background: 'transparent', color: 'white', width: '150px' }}
                                                                        />
                                                                    ) : (
                                                                        <span
                                                                            style={{ fontWeight: 600, cursor: 'pointer', padding: '2px 6px', borderRadius: '4px' }}
                                                                            onClick={() => startEditing(labelFieldId)}
                                                                        >
                                                                            {editingValues[labelFieldId] || pouch.label}
                                                                        </span>
                                                                    )
                                                                ) : (
                                                                    <span style={{ fontWeight: 600 }}>{pouch.label}</span>
                                                                )}
                                                            </div>

                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>BLE:</span>
                                                                {vehicle.id?.startsWith('sample-') ? (
                                                                    isBleEditing ? (
                                                                        <>
                                                                            <Input
                                                                                value={editingValues[bleFieldId] ?? pouch.ble_tag?.identifier}
                                                                                onChange={(e) => setEditingValues({ ...editingValues, [bleFieldId]: e.target.value })}
                                                                                style={{ background: 'transparent', color: 'white', width: '180px' }}
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
                                                                            style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                                                            onClick={() => startEditing(bleFieldId)}
                                                                        >
                                                                            {editingValues[bleFieldId] || pouch.ble_tag?.identifier}
                                                                        </span>
                                                                    )
                                                                ) : (
                                                                    <span style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '2px 8px', borderRadius: '4px' }}>
                                                                        {pouch.ble_tag?.identifier}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
            
            {/* Add Device Modal */}
            <AddDeviceModal
    show={showAddDeviceModal}
    onClose={() => setShowAddDeviceModal(false)}
    onSuccess={handleAddSampleVehicle}
/>

        </div>
    )
}

export default DeviceManagement