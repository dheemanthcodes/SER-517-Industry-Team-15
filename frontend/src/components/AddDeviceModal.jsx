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
        e.preventDefault()

        if (onSuccess) {
            onSuccess(deviceForm)
        }

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

        onClose()
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