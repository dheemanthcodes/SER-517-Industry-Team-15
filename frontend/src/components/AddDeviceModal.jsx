import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Typography, Divider } from '@supabase/ui'
import apiBase from '../apiBase'
import { getUnassignedPis, normalizePiSnapshot } from '../utils/piSnapshot'

function AddDeviceModal({
    show,
    onClose,
    onSuccess,
    availablePis: preloadedPis = [],
    piLoading: preloadedPiLoading = false,
    piLoadError: preloadedPiLoadError = '',
    onRefreshPis
}) {
    const createInitialDeviceForm = () => ({
        ambulanceNumber: '',
        stationName: '',
        raspberryPiKey: '',
        boxCount: '1',
        drugBox1Label: '',
        drugBox1BleId: '',
        drugBox2Label: '',
        drugBox2BleId: '',
        narcoticsPouch1Label: '',
        narcoticsPouch1BleId: '',
        narcoticsPouch2Label: '',
        narcoticsPouch2BleId: ''
    })

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [deviceForm, setDeviceForm] = useState(createInitialDeviceForm)
    
    const [fallbackAvailablePis, setFallbackAvailablePis] = useState([])
    const [fallbackPiLoading, setFallbackPiLoading] = useState(false)
    const [fallbackPiLoadError, setFallbackPiLoadError] = useState('')
    const onRefreshPisRef = useRef(onRefreshPis)

    const loadAvailablePis = async () => {
        setFallbackPiLoading(true)
        setFallbackPiLoadError('')

        try {
            const res = await fetch(`${apiBase}/api/fetchpidetails`)
            const json = await res.json()
            if (!res.ok) {
                throw new Error(json.detail || json.message || 'Failed to fetch Pi details')
            }

            const piList = normalizePiSnapshot(json)
            setFallbackAvailablePis(getUnassignedPis(piList))
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
        onRefreshPisRef.current = onRefreshPis
    }, [onRefreshPis])

    useEffect(() => {
        if (!show) return

        if (usingParentPiState) {
            onRefreshPisRef.current?.()
        } else {
            loadAvailablePis()
        }
    }, [show, usingParentPiState])

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

    const getBleOptionsForType = (assetType) => {
        const matchingDevices = selectedPiDevices.filter((device) =>
            (device.name || '').toLowerCase().includes(
                assetType === 'BOX' ? 'box' : 'pouch'
            )
        )

        return matchingDevices.length > 0 ? matchingDevices : selectedPiDevices
    }

    const noPiAvailable = !piLoading && availablePis.length === 0
    const assetFieldsDisabled = loading || noPiAvailable
    const hasSecondBox = deviceForm.boxCount === '2'

    const handleAddDevice = async (e) => {
        e.preventDefault()

        setLoading(true)
        setError(null)
        try {
            if (onSuccess) await onSuccess(deviceForm)

            setDeviceForm(createInitialDeviceForm())

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
                            <Typography.Text>Station Name</Typography.Text>
                            <Input
                                type="text"
                                value={deviceForm.stationName}
                                onChange={(e) => setDeviceForm({ ...deviceForm, stationName: e.target.value })}
                                placeholder="e.g., Main Station"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="form-field">
                            <Typography.Text>Number of Boxes</Typography.Text>
                            <select
                                className="form-select"
                                value={deviceForm.boxCount}
                                onChange={(e) =>
                                    setDeviceForm((prev) => ({
                                        ...prev,
                                        boxCount: e.target.value,
                                        ...(e.target.value === '1'
                                            ? {
                                                drugBox2Label: '',
                                                drugBox2BleId: '',
                                                narcoticsPouch2Label: '',
                                                narcoticsPouch2BleId: ''
                                            }
                                            : {})
                                    }))
                                }
                                disabled={loading}
                                required
                            >
                                <option value="1">1 box</option>
                                <option value="2">2 boxes</option>
                            </select>
                        </div>

                        <div className="form-field">
                        <Typography.Text>Link Raspberry Pi</Typography.Text>
                        <select
                            className="form-select"
                            value={deviceForm.raspberryPiKey}
                            onChange={(e) =>
                                setDeviceForm({
                                    ...deviceForm,
                                    raspberryPiKey: e.target.value,
                                    drugBox1BleId: '',
                                    drugBox2BleId: '',
                                    narcoticsPouch1BleId: '',
                                    narcoticsPouch2BleId: ''
                                })
                            }
                            disabled={loading || piLoading || availablePis.length === 0}
                            required
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
                                    <select
                                        className="form-select"
                                        value={deviceForm.drugBox1BleId}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, drugBox1BleId: e.target.value })}
                                        disabled={assetFieldsDisabled}
                                    >
                                        <option value="">
                                            {selectedPi
                                                ? 'Select device address'
                                                : 'Select Raspberry Pi first'}
                                        </option>
                                        {getBleOptionsForType('BOX').map((device, index) => (
                                            <option
                                                key={`${device.address || 'box'}-${index}`}
                                                value={device.address || ''}
                                            >
                                                {device.address || 'No address'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {hasSecondBox && (
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
                                        <select
                                            className="form-select"
                                            value={deviceForm.drugBox2BleId}
                                            onChange={(e) => setDeviceForm({ ...deviceForm, drugBox2BleId: e.target.value })}
                                            disabled={assetFieldsDisabled}
                                        >
                                            <option value="">
                                                {selectedPi
                                                    ? 'Select device address'
                                                    : 'Select Raspberry Pi first'}
                                            </option>
                                            {getBleOptionsForType('BOX').map((device, index) => (
                                                <option
                                                    key={`${device.address || 'box'}-${index}`}
                                                    value={device.address || ''}
                                                >
                                                    {device.address || 'No address'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

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
                                    <select
                                        className="form-select"
                                        value={deviceForm.narcoticsPouch1BleId}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, narcoticsPouch1BleId: e.target.value })}
                                        disabled={assetFieldsDisabled}
                                    >
                                        <option value="">
                                            {selectedPi
                                                ? 'Select device address'
                                                : 'Select Raspberry Pi first'}
                                        </option>
                                        {getBleOptionsForType('POUCH').map((device, index) => (
                                            <option
                                                key={`${device.address || 'pouch'}-${index}`}
                                                value={device.address || ''}
                                            >
                                                {device.address || 'No address'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {hasSecondBox && (
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
                                        <select
                                            className="form-select"
                                            value={deviceForm.narcoticsPouch2BleId}
                                            onChange={(e) => setDeviceForm({ ...deviceForm, narcoticsPouch2BleId: e.target.value })}
                                            disabled={assetFieldsDisabled}
                                        >
                                            <option value="">
                                                {selectedPi
                                                    ? 'Select device address'
                                                    : 'Select Raspberry Pi first'}
                                            </option>
                                            {getBleOptionsForType('POUCH').map((device, index) => (
                                                <option
                                                    key={`${device.address || 'pouch'}-${index}`}
                                                    value={device.address || ''}
                                                >
                                                    {device.address || 'No address'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
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
