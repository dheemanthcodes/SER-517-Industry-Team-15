import { useEffect, useState } from 'react'
import { Button, Input, Typography, Divider } from '@supabase/ui'
import { supabase } from '../supabaseClient'

function AddDeviceModal({ show, onClose, onSuccess }) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [deviceForm, setDeviceForm] = useState({
        ambulanceNumber: '',
        raspberryPiId: '',
        drugBox1Label: '',
        drugBox1BleId: '',
        drugBox2Label: '',
        drugBox2BleId: '',
        narcoticsPouch1Label: '',
        narcoticsPouch1BleId: '',
        narcoticsPouch2Label: '',
        narcoticsPouch2BleId: ''
    })
    const [availableRaspberryPis, setAvailableRaspberryPis] = useState([])

    const loadAvailableRaspberryPis = () => {
        try {
            const savedPis = localStorage.getItem('configuredPis')
            if (!savedPis) {
                setAvailableRaspberryPis([])
                return
            }

            const parsedPis = JSON.parse(savedPis)
            if (!Array.isArray(parsedPis)) {
                setAvailableRaspberryPis([])
                return
            }

            const unassignedPis = parsedPis.filter(
                (pi) => !pi.assignedAmbulanceId
            )

            setAvailableRaspberryPis(unassignedPis)
        } catch (err) {
            console.error('Failed to load Raspberry Pis from localStorage:', err)
            setAvailableRaspberryPis([])
        }
    }

    useEffect(() => {
        if (show) {
            loadAvailableRaspberryPis()
        }
    }, [show])

    const handleAddDevice = async (e) => {
        e.preventDefault()

        setLoading(true)
        setError(null)
        try {
            if (onSuccess) await onSuccess(deviceForm)

            setDeviceForm({
                ambulanceNumber: '',
                raspberryPiId: '',
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
        } catch (err) {
            const message =
                err?.message ||
                err?.error_description ||
                err?.details ||
                'Failed to register ambulance. Please try again.'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    if (!show) return null

    return (
        <div className="modal-overlay" onClick={() => !loading && onClose()}>
            <div className="modal-content add-device-modal" onClick={(e) => e.stopPropagation()}>
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
                    <div className="modal-error">
                        {error}
                    </div>
                )}

                <form className="device-form" onSubmit={handleAddDevice}>
                    <div className="form-section">
                        <Typography.Title level={4}>Ambulance</Typography.Title>
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

                        <div className="form-field">
                            <Typography.Text>Link Raspberry Pi</Typography.Text>
                            <select
                                className="form-select"
                                value={deviceForm.raspberryPiId}
                                onChange={(e) =>
                                    setDeviceForm({
                                        ...deviceForm,
                                        raspberryPiId: e.target.value
                                    })
                                }
                                disabled={loading || availableRaspberryPis.length === 0}
                                required={availableRaspberryPis.length > 0}
                            >
                                <option value="">
                                    {availableRaspberryPis.length > 0
                                        ? 'Select Raspberry Pi'
                                        : 'No unassigned Raspberry Pis available'}
                                </option>

                                {availableRaspberryPis.map((pi) => (
                                    <option key={pi.id} value={pi.id}>
                                        {pi.name}{pi.ip ? ` (${pi.ip})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-section">
                        <Typography.Title level={4}>Drug Box 1</Typography.Title>
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
                        <Typography.Title level={4}>Drug Box 2</Typography.Title>
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
                        <Typography.Title level={4}>Narcotics Pouch 1</Typography.Title>
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
                        <Typography.Title level={4}>Narcotics Pouch 2</Typography.Title>
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