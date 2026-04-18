import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Typography, Divider } from '@supabase/ui'
import apiBase from '../apiBase'

function AddDeviceModal({
    show,
    onClose,
    onSuccess,
    availablePis: preloadedPis = [],
    piLoading: preloadedPiLoading = false,
    piLoadError: preloadedPiLoadError = '',
    onRefreshPis
}) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [deviceForm, setDeviceForm] = useState({
        ambulanceNumber: '',
        raspberryPiKey: '',
        drugBox1Label: '',
        drugBox1BleId: '',
        drugBox2Label: '',
        drugBox2BleId: '',
        narcoticsPouch1Label: '',
        narcoticsPouch1BleId: '',
        narcoticsPouch2Label: '',
        narcoticsPouch2BleId: ''
    })
    
    const [fallbackAvailablePis, setFallbackAvailablePis] = useState([])
    const [fallbackPiLoading, setFallbackPiLoading] = useState(false)
    const [fallbackPiLoadError, setFallbackPiLoadError] = useState('')

    const loadAvailablePis = async () => {
        setFallbackPiLoading(true)
        setFallbackPiLoadError('')

        try {
            const res = await fetch(`${apiBase}/api/fetchpidetails`)
            const json = await res.json()
            if (!res.ok) {
                throw new Error(json.detail || json.message || 'Failed to fetch Pi details')
            }

            const piList = Object.entries(json || {}).map(([piKey, piData]) => ({
                piKey,
                ambulanceId: piData?.ambulanceId || '',
                ipAddress: piData?.ipAddress || '',
                devices: Array.isArray(piData?.devices) ? piData.devices : []
            }))

            const unassignedPis = piList.filter((pi) => !pi.ambulanceId)
            setFallbackAvailablePis(unassignedPis)
        } catch (err) {
            console.error('Failed to load Raspberry Pi options:', err)
            setFallbackPiLoadError('Failed to load Raspberry Pi options.')
            setFallbackAvailablePis([])
        } finally {
            setFallbackPiLoading(false)
        }
    }

    const usingParentPiState = typeof onRefreshPis === 'function'
    const availablePis = usingParentPiState ? preloadedPis : fallbackAvailablePis
    const piLoading = usingParentPiState ? preloadedPiLoading : fallbackPiLoading
    const piLoadError = usingParentPiState ? preloadedPiLoadError : fallbackPiLoadError

    useEffect(() => {
        if (!show) return

        if (usingParentPiState) {
            onRefreshPis()
        } else {
            loadAvailablePis()
        }
    }, [show, usingParentPiState, onRefreshPis])

    useEffect(() => {
        if (!deviceForm.raspberryPiKey) return

        const piStillAvailable = availablePis.some((pi) => pi.piKey === deviceForm.raspberryPiKey)
        if (piStillAvailable) return

        setDeviceForm((prev) => ({
            ...prev,
            raspberryPiKey: ''
        }))
    }, [availablePis, deviceForm.raspberryPiKey])

    const selectedPi = useMemo(() => {
        return availablePis.find((pi) => pi.piKey === deviceForm.raspberryPiKey) || null
    }, [availablePis, deviceForm.raspberryPiKey])

    const selectedPiDevices = useMemo(() => {
        return Array.isArray(selectedPi?.devices) ? selectedPi.devices : []
    }, [selectedPi])

    const boxDevices = useMemo(() => {
        return selectedPiDevices.filter((device) =>
            (device.name || '').toLowerCase().includes('box')
        )
    }, [selectedPiDevices])

    const pouchDevices = useMemo(() => {
        return selectedPiDevices.filter((device) =>
            (device.name || '').toLowerCase().includes('pouch')
        )
    }, [selectedPiDevices])

    const noPiAvailable = !piLoading && availablePis.length === 0
    const assetFieldsDisabled = loading || noPiAvailable

    const handleAddDevice = async (e) => {
        e.preventDefault()

        setLoading(true)
        setError(null)
        try {
            if (onSuccess) await onSuccess(deviceForm)

            setDeviceForm({
                ambulanceNumber: '',
                raspberryPiKey: '',
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
                            value={deviceForm.raspberryPiKey}
                            onChange={(e) =>
                                setDeviceForm({
                                    ...deviceForm,
                                    raspberryPiKey: e.target.value
                                })
                            }
                            disabled={loading || piLoading || availablePis.length === 0}
                        >
                            <option value="">
                                {piLoading
                                    ? 'Loading Raspberry Pis...'
                                    : availablePis.length > 0
                                        ? 'Select Raspberry Pi'
                                        : 'No unassigned Raspberry Pis available'}
                            </option>

                            {availablePis.map((pi) => (
                                <option key={pi.piKey} value={pi.piKey}>
                                    {pi.piKey}{pi.ipAddress ? ` (${pi.ipAddress})` : ''}
                                </option>
                            ))}
                        </select>

                        {piLoadError && (
                            <div className="pi-inline-note pi-inline-note-error">
                                {piLoadError}
                            </div>
                        )}

                        {noPiAvailable && !piLoadError && (
                            <div className="pi-inline-note">
                                No unassigned Raspberry Pis are available. This form is disabled until one is available.
                            </div>
                        )}

                        {selectedPi && (
                            <div className="pi-selected-preview">
                                <div><strong>Selected Raspberry Pi:</strong> {selectedPi.piKey}</div>
                                <div><strong>IP Address:</strong> {selectedPi.ipAddress || 'Not available'}</div>
                                <div><strong>BLE Tags Found #:</strong> {selectedPi.devices.length}</div>
                            </div>
                        )}

                        {selectedPi && (
                            <div className="ble-device-pool">
                                <div className="ble-device-pool-header">
                                    <Typography.Text>Available BLE Tags from Selected Raspberry Pi</Typography.Text>
                                </div>

                                {selectedPiDevices.length > 0 ? (
                                    <div className="ble-device-groups">
                                        <div className="ble-device-group">
                                            <div className="ble-device-group-title">Drug Box IDs</div>
                                            {boxDevices.length > 0 ? (
                                                <div className="ble-device-list">
                                                    {boxDevices.map((device, index) => (
                                                        <div
                                                            key={`${device.name || 'box'}-${device.address || index}`}
                                                            className="ble-device-card"
                                                        >
                                                            <div className="ble-device-name">
                                                                {device.name || `Box Device ${index + 1}`}
                                                            </div>
                                                            <div className="ble-device-address">
                                                                {device.address || 'No BLE address available'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="ble-device-empty">
                                                    No box BLE devices were returned for this Raspberry Pi.
                                                </div>
                                            )}
                                        </div>

                                        <div className="ble-device-group">
                                            <div className="ble-device-group-title">Narcotics Pouch IDs</div>
                                            {pouchDevices.length > 0 ? (
                                                <div className="ble-device-list">
                                                    {pouchDevices.map((device, index) => (
                                                        <div
                                                            key={`${device.name || 'pouch'}-${device.address || index}`}
                                                            className="ble-device-card"
                                                        >
                                                            <div className="ble-device-name">
                                                                {device.name || `Pouch Device ${index + 1}`}
                                                            </div>
                                                            <div className="ble-device-address">
                                                                {device.address || 'No BLE address available'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="ble-device-empty">
                                                    No pouch BLE devices were returned for this Raspberry Pi.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="ble-device-empty">
                                        No BLE devices were returned for the selected Raspberry Pi.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    </div>

                    <fieldset
                        className={`asset-form-group${assetFieldsDisabled ? ' asset-form-group-disabled' : ''}`}
                        disabled={assetFieldsDisabled}
                        aria-disabled={assetFieldsDisabled}
                    >
                        <div className={`form-section${assetFieldsDisabled ? ' form-section-disabled' : ''}`}>
                            <Typography.Title level={4}>Drug Box 1</Typography.Title>
                            <div className="form-row">
                                <div className="form-field">
                                    <Typography.Text>Box Label</Typography.Text>
                                    <Input
                                        type="text"
                                        value={deviceForm.drugBox1Label}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, drugBox1Label: e.target.value })}
                                        placeholder="e.g., Box A"
                                        disabled={assetFieldsDisabled}
                                    />
                                </div>
                                <div className="form-field">
                                    <Typography.Text>BLE ID</Typography.Text>
                                    <Input
                                        type="text"
                                        value={deviceForm.drugBox1BleId}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, drugBox1BleId: e.target.value })}
                                        placeholder="e.g., AC:23:3F:A4:12:89"
                                        disabled={assetFieldsDisabled}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={`form-section${assetFieldsDisabled ? ' form-section-disabled' : ''}`}>
                            <Typography.Title level={4}>Drug Box 2</Typography.Title>
                            <div className="form-row">
                                <div className="form-field">
                                    <Typography.Text>Box Label</Typography.Text>
                                    <Input
                                        type="text"
                                        value={deviceForm.drugBox2Label}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, drugBox2Label: e.target.value })}
                                        placeholder="e.g., Box B"
                                        disabled={assetFieldsDisabled}
                                    />
                                </div>
                                <div className="form-field">
                                    <Typography.Text>BLE ID</Typography.Text>
                                    <Input
                                        type="text"
                                        value={deviceForm.drugBox2BleId}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, drugBox2BleId: e.target.value })}
                                        placeholder="e.g., AC:23:3F:A4:12:90"
                                        disabled={assetFieldsDisabled}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={`form-section${assetFieldsDisabled ? ' form-section-disabled' : ''}`}>
                            <Typography.Title level={4}>Narcotics Pouch 1</Typography.Title>
                            <div className="form-row">
                                <div className="form-field">
                                    <Typography.Text>Pouch Label</Typography.Text>
                                    <Input
                                        type="text"
                                        value={deviceForm.narcoticsPouch1Label}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, narcoticsPouch1Label: e.target.value })}
                                        placeholder="e.g., Pouch A"
                                        disabled={assetFieldsDisabled}
                                    />
                                </div>
                                <div className="form-field">
                                    <Typography.Text>BLE ID</Typography.Text>
                                    <Input
                                        type="text"
                                        value={deviceForm.narcoticsPouch1BleId}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, narcoticsPouch1BleId: e.target.value })}
                                        placeholder="e.g., AC:23:3F:A4:12:91"
                                        disabled={assetFieldsDisabled}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={`form-section${assetFieldsDisabled ? ' form-section-disabled' : ''}`}>
                            <Typography.Title level={4}>Narcotics Pouch 2</Typography.Title>
                            <div className="form-row">
                                <div className="form-field">
                                    <Typography.Text>Pouch Label</Typography.Text>
                                    <Input
                                        type="text"
                                        value={deviceForm.narcoticsPouch2Label}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, narcoticsPouch2Label: e.target.value })}
                                        placeholder="e.g., Pouch B"
                                        disabled={assetFieldsDisabled}
                                    />
                                </div>
                                <div className="form-field">
                                    <Typography.Text>BLE ID</Typography.Text>
                                    <Input
                                        type="text"
                                        value={deviceForm.narcoticsPouch2BleId}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, narcoticsPouch2BleId: e.target.value })}
                                        placeholder="e.g., AC:23:3F:A4:12:92"
                                        disabled={assetFieldsDisabled}
                                    />
                                </div>
                            </div>
                        </div>
                    </fieldset>

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
