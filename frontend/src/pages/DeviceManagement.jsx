import { useState, useEffect } from 'react'
import { Card, Button, Input, Typography, Divider } from '@supabase/ui'
import { supabase } from '../supabaseClient'


function DeviceManagement() {
    const [showAddDeviceModal, setShowAddDeviceModal] = useState(false)

    // Sample/Mock data for demonstration
    const sampleVehicles = [
        {
            id: 'sample-1',
            unit_number: 'AMB-001',
            station_name: 'Main Station',
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

    // Fetch vehicles with their assets from Supabase on component mount
    useEffect(() => {
        fetchVehicles()
    }, [])

    // Vehicles already includes sample data from useState and fetchVehicles

    const fetchVehicles = async () => {
        try {
            setFetchLoading(true)
            setError(null)

            // Fetch vehicles with their assets and ble_tags
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

            // Keep sample data plus any fetched real vehicles
            const realVehicles = (data || []).filter(v => !v.id?.startsWith('sample-'))
            setVehicles([...sampleVehicles, ...realVehicles])
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

    return (
        <div className="page-container">
            <div className="page-header">
                <Typography.Title level={2}>Device Management</Typography.Title>
                <Typography.Text type="secondary">Manage your connected devices</Typography.Text>
            </div>

            {/* Device Grid */}
            <div className="device-grid">
                <div onClick={() => setShowAddDeviceModal(true)} style={{ cursor: 'pointer' }}>
                    <Card className="device-card add-device">
                        <div className="device-icon">➕</div>
                        <Typography.Title level={4}>Add Device</Typography.Title>
                        <Typography.Text type="secondary">Connect new device</Typography.Text>
                    </Card>
                </div>
            </div>
        
        </div>
    )
}

export default DeviceManagement