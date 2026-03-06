import { useState } from 'react'
import { Button, Input, Typography, Divider } from '@supabase/ui'
import { supabase } from '../supabaseClient'

function AddDeviceModal({ show, onClose, onSuccess }) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [deviceForm, setDeviceForm] = useState({
        ambulanceNumber: '',
        drugBox1Label: '',
        drugBox1BleId: '',
        drugBox2Label: '',
        drugBox2BleId: '',
        narcoticsPouch1Label: '',
        narcoticsPouch1BleId: '',
        narcoticsPouch2Label: '',
        narcoticsPouch2BleId: ''
    })

    const handleAddDevice = async (e) => {
        if (e) e.preventDefault()

        try {
            setLoading(true)
            setError(null)

            // Step 1: Create vehicle
            const { data: vehicleData, error: vehicleError } = await supabase
                .from('vehicles')
                .insert([
                    {
                        unit_number: deviceForm.ambulanceNumber,
                        station_name: 'Main Station'
                    }
                ])
                .select()

            if (vehicleError) throw vehicleError
            const vehicleId = vehicleData[0].id

            // Step 2: Create Drug Box 1 (type='BOX')
            const { data: box1Data, error: box1Error } = await supabase
                .from('assets')
                .insert([
                    {
                        vehicle_id: vehicleId,
                        type: 'BOX',
                        label: deviceForm.drugBox1Label,
                        is_active: true
                    }
                ])
                .select()

            if (box1Error) throw box1Error
            const box1Id = box1Data[0].id

            // Step 3: Create BLE tag for Drug Box 1
            const { error: ble1Error } = await supabase
                .from('ble_tags')
                .insert([
                    {
                        asset_id: box1Id,
                        identifier: deviceForm.drugBox1BleId,
                        tag_model: 'Minew E8'
                    }
                ])

            if (ble1Error) throw ble1Error

            // Step 4: Create Drug Box 2 (type='BOX')
            const { data: box2Data, error: box2Error } = await supabase
                .from('assets')
                .insert([
                    {
                        vehicle_id: vehicleId,
                        type: 'BOX',
                        label: deviceForm.drugBox2Label,
                        is_active: true
                    }
                ])
                .select()

            if (box2Error) throw box2Error
            const box2Id = box2Data[0].id

            // Step 5: Create BLE tag for Drug Box 2
            const { error: ble2Error } = await supabase
                .from('ble_tags')
                .insert([
                    {
                        asset_id: box2Id,
                        identifier: deviceForm.drugBox2BleId,
                        tag_model: 'Minew E8'
                    }
                ])

            if (ble2Error) throw ble2Error

            // Step 6: Create Narcotics Pouch 1 (type='POUCH', parent=box1)
            const { data: pouch1Data, error: pouch1Error } = await supabase
                .from('assets')
                .insert([
                    {
                        vehicle_id: vehicleId,
                        type: 'POUCH',
                        label: deviceForm.narcoticsPouch1Label,
                        parent_asset_id: box1Id,
                        is_active: true
                    }
                ])
                .select()

            if (pouch1Error) throw pouch1Error
            const pouch1Id = pouch1Data[0].id

            // Step 7: Create BLE tag for Narcotics Pouch 1
            const { error: ble3Error } = await supabase
                .from('ble_tags')
                .insert([
                    {
                        asset_id: pouch1Id,
                        identifier: deviceForm.narcoticsPouch1BleId,
                        tag_model: 'Minew E8'
                    }
                ])

            if (ble3Error) throw ble3Error

            // Step 8: Create Narcotics Pouch 2 (type='POUCH', parent=box2)
            const { data: pouch2Data, error: pouch2Error } = await supabase
                .from('assets')
                .insert([
                    {
                        vehicle_id: vehicleId,
                        type: 'POUCH',
                        label: deviceForm.narcoticsPouch2Label,
                        parent_asset_id: box2Id,
                        is_active: true
                    }
                ])
                .select()

            if (pouch2Error) throw pouch2Error
            const pouch2Id = pouch2Data[0].id

            // Step 9: Create BLE tag for Narcotics Pouch 2
            const { error: ble4Error } = await supabase
                .from('ble_tags')
                .insert([
                    {
                        asset_id: pouch2Id,
                        identifier: deviceForm.narcoticsPouch2BleId,
                        tag_model: 'Minew E8'
                    }
                ])

            if (ble4Error) throw ble4Error

            // Step 10: Create Raspberry Pi device entry
            const { error: deviceError } = await supabase
                .from('devices')
                .insert([
                    {
                        vehicle_id: vehicleId,
                        device_name: `Raspberry Pi - ${deviceForm.ambulanceNumber}`,
                        is_active: true
                    }
                ])

            if (deviceError) throw deviceError

            // Success! Reset form and notify parent
            setDeviceForm({
                ambulanceNumber: '',
                drugBox1Label: '',
                drugBox1BleId: '',
                drugBox2Label: '',
                drugBox2BleId: '',
                narcoticsPouch1Label: '',
                narcoticsPouch1BleId: '',
                narcoticsPouch2Label: '',
                narcoticsPouch2BleId: ''
            })

            if (onSuccess) await onSuccess()
            onClose()
        } catch (err) {
            console.error('Error adding device:', err)
            setError(`Failed to add device: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    if (!show) return null

    return (
        <div className="modal-overlay" onClick={() => !loading && onClose()}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <Typography.Title level={3}>Add Ambulance Device</Typography.Title>
                    <button
                        className="modal-close"
                        onClick={() => !loading && onClose()}
                        disabled={loading}
                    >
                        ✕
                    </button>
                </div>
                <Divider />

                {error && (
                    <div style={{ color: '#c00', padding: '0 24px', marginBottom: '16px' }}>
                        {error}
                    </div>
                )}

                <form className="device-form" onSubmit={handleAddDevice}>
                    {/* Ambulance Section */}
                    <div className="form-section">
                        <Typography.Title level={4}>🚑 Ambulance</Typography.Title>
                        <div className="form-field">
                            <Typography.Text>Unit Number</Typography.Text>
                            <Input
                                type="text"
                                value={deviceForm.ambulanceNumber}
                                onChange={(e) => setDeviceForm({ ...deviceForm, ambulanceNumber: e.target.value })}
                                placeholder="e.g., AMB-001"
                                required
                                disabled={loading}
                            />
                        </div>
                    </div>

                    {/* Drug Box 1 Section */}
                    <div className="form-section">
                        <Typography.Title level={4}>💊 Drug Box 1</Typography.Title>
                        <div className="form-row">
                            <div className="form-field">
                                <Typography.Text>Box Label</Typography.Text>
                                <Input
                                    type="text"
                                    value={deviceForm.drugBox1Label}
                                    onChange={(e) => setDeviceForm({ ...deviceForm, drugBox1Label: e.target.value })}
                                    placeholder="e.g., Box A"
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <div className="form-field">
                                <Typography.Text>BLE ID</Typography.Text>
                                <Input
                                    type="text"
                                    value={deviceForm.drugBox1BleId}
                                    onChange={(e) => setDeviceForm({ ...deviceForm, drugBox1BleId: e.target.value })}
                                    placeholder="e.g., AC:23:3F:A4:12:89"
                                    required
                                    disabled={loading}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Drug Box 2 Section */}
                    <div className="form-section">
                        <Typography.Title level={4}>💊 Drug Box 2</Typography.Title>
                        <div className="form-row">
                            <div className="form-field">
                                <Typography.Text>Box Label</Typography.Text>
                                <Input
                                    type="text"
                                    value={deviceForm.drugBox2Label}
                                    onChange={(e) => setDeviceForm({ ...deviceForm, drugBox2Label: e.target.value })}
                                    placeholder="e.g., Box B"
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <div className="form-field">
                                <Typography.Text>BLE ID</Typography.Text>
                                <Input
                                    type="text"
                                    value={deviceForm.drugBox2BleId}
                                    onChange={(e) => setDeviceForm({ ...deviceForm, drugBox2BleId: e.target.value })}
                                    placeholder="e.g., AC:23:3F:A4:12:90"
                                    required
                                    disabled={loading}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Narcotics Pouch 1 Section */}
                    <div className="form-section">
                        <Typography.Title level={4}>🔒 Narcotics Pouch 1</Typography.Title>
                        <div className="form-row">
                            <div className="form-field">
                                <Typography.Text>Pouch Label</Typography.Text>
                                <Input
                                    type="text"
                                    value={deviceForm.narcoticsPouch1Label}
                                    onChange={(e) => setDeviceForm({ ...deviceForm, narcoticsPouch1Label: e.target.value })}
                                    placeholder="e.g., Pouch A"
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <div className="form-field">
                                <Typography.Text>BLE ID</Typography.Text>
                                <Input
                                    type="text"
                                    value={deviceForm.narcoticsPouch1BleId}
                                    onChange={(e) => setDeviceForm({ ...deviceForm, narcoticsPouch1BleId: e.target.value })}
                                    placeholder="e.g., AC:23:3F:A4:12:91"
                                    required
                                    disabled={loading}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Narcotics Pouch 2 Section */}
                    <div className="form-section">
                        <Typography.Title level={4}>🔒 Narcotics Pouch 2</Typography.Title>
                        <div className="form-row">
                            <div className="form-field">
                                <Typography.Text>Pouch Label</Typography.Text>
                                <Input
                                    type="text"
                                    value={deviceForm.narcoticsPouch2Label}
                                    onChange={(e) => setDeviceForm({ ...deviceForm, narcoticsPouch2Label: e.target.value })}
                                    placeholder="e.g., Pouch B"
                                    required
                                    disabled={loading}
                                />
                            </div>
                            <div className="form-field">
                                <Typography.Text>BLE ID</Typography.Text>
                                <Input
                                    type="text"
                                    value={deviceForm.narcoticsPouch2BleId}
                                    onChange={(e) => setDeviceForm({ ...deviceForm, narcoticsPouch2BleId: e.target.value })}
                                    placeholder="e.g., AC:23:3F:A4:12:92"
                                    required
                                    disabled={loading}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="modal-actions">
                        <Button
                            type="default"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                        >
                            {loading ? 'Adding...' : 'Add Device'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default AddDeviceModal