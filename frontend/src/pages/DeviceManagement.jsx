import { useState, useEffect } from 'react'
import { Button, Input } from '@supabase/ui'
import { supabase } from '../supabaseClient'
import AddDeviceModal from '../components/AddDeviceModal'
import apiBase from '../apiBase'
import { getUnassignedPis, normalizePiSnapshot } from '../utils/piSnapshot'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
        if (row?.asset_id) {
            vehicle.assets.push({
                id: row.asset_id,
                type: row?.asset_type || '',
                label: row?.label || '',
                ble_tag: {
                    identifier: row?.ble_identifier || '',
                    tag_model: row?.tag_model || ''
                }
            })
        }
    }

    return Array.from(vehiclesById.values())
}

const buildVehiclesFromSupabase = ({ vehicles = [], devices = [], assets = [], bleTags = [] }) => {
    const deviceByVehicleId = new Map()
    const bleTagByIdentifier = new Map()
    const assetsByVehicleId = new Map()

    for (const device of Array.isArray(devices) ? devices : []) {
        if (device?.is_active !== false && device?.vehicle_id) {
            deviceByVehicleId.set(device.vehicle_id, device)
        }
    }

    for (const bleTag of Array.isArray(bleTags) ? bleTags : []) {
        if (bleTag?.identifier) {
            bleTagByIdentifier.set(bleTag.identifier, bleTag)
        }
    }

    for (const asset of Array.isArray(assets) ? assets : []) {
        if (!asset?.vehicle_id) continue

        const vehicleAssets = assetsByVehicleId.get(asset.vehicle_id) || []
        vehicleAssets.push(asset)
        assetsByVehicleId.set(asset.vehicle_id, vehicleAssets)
    }

    return (Array.isArray(vehicles) ? vehicles : []).map((vehicle) => {
        const vehicleId = vehicle?.id
        const assignedDevice = deviceByVehicleId.get(vehicleId)
        const vehicleAssets = assetsByVehicleId.get(vehicleId) || []

        return {
            id: vehicleId,
            unit_number: vehicle?.unit_number || '',
            station_name: vehicle?.station_name || '',
            raspberry_pi: {
                name: assignedDevice?.device_name || '',
                ip_address: assignedDevice?.ip_address || ''
            },
            assets: vehicleAssets.map((asset) => {
                const bleTag = bleTagByIdentifier.get(asset?.ble_identifier || '')
                return {
                    id: asset?.id,
                    type: asset?.type || '',
                    label: asset?.label || '',
                    ble_tag: {
                        identifier: asset?.ble_identifier || '',
                        tag_model: bleTag?.tag_model || ''
                    }
                }
            })
        }
    })
}

function DeviceManagement({ isActive = true }) {
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
    const [piStatusMessage, setPiStatusMessage] = useState('')

    const fetchJsonWithRetry = async (url, options = {}, retries = 1) => {
        let lastError

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
                const res = await fetch(url, {
                    cache: 'no-store',
                    ...options
                })

                const json = await res.json()
                if (!res.ok) {
                    throw new Error(json.detail || json.message || 'Request failed')
                }

                return json
            } catch (error) {
                lastError = error
                if (attempt < retries) {
                    await delay(300)
                    continue
                }
            }
        }

        throw lastError
    }

    const fetchVehiclesFromSupabase = async () => {
        const [
            { data: vehiclesData, error: vehiclesError },
            { data: devicesData, error: devicesError },
            { data: assetsData, error: assetsError },
            { data: bleTagsData, error: bleTagsError }
        ] = await Promise.all([
            supabase.from('vehicles').select('*'),
            supabase.from('devices').select('*').neq('is_active', false),
            supabase.from('assets').select('*'),
            supabase.from('ble_tags').select('*')
        ])

        if (vehiclesError) throw vehiclesError
        if (devicesError) throw devicesError
        if (assetsError) throw assetsError
        if (bleTagsError) throw bleTagsError

        return buildVehiclesFromSupabase({
            vehicles: vehiclesData,
            devices: devicesData,
            assets: assetsData,
            bleTags: bleTagsData
        })
    }

    useEffect(() => {
        if (!isActive) return
        const pendingPiStatusMessage = window.sessionStorage.getItem('deviceManagementPiStatusMessage')
        if (pendingPiStatusMessage) {
            setPiStatusMessage(pendingPiStatusMessage)
            window.sessionStorage.removeItem('deviceManagementPiStatusMessage')
        }
        fetchVehicles()
        fetchPiDetails()
    }, [isActive])

    useEffect(() => {
        if (!piStatusMessage) return undefined

        const timeoutId = window.setTimeout(() => {
            setPiStatusMessage('')
        }, 5000)

        return () => window.clearTimeout(timeoutId)
    }, [piStatusMessage])

    useEffect(() => {
        if (!isActive) return undefined

        const refreshDeviceManagementData = () => {
            fetchVehicles()
            fetchPiDetails()
        }

        const subscription = supabase
            .channel('device-management-live')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'devices' },
                refreshDeviceManagementData
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'vehicles' },
                refreshDeviceManagementData
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'assets' },
                refreshDeviceManagementData
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'ble_tags' },
                refreshDeviceManagementData
            )
            .subscribe()

        return () => {
            supabase.removeChannel(subscription)
        }
    }, [isActive])

    useEffect(() => {
        if (!editingVehicleData?.raspberry_pi?.name) return
        if (piLoading) return

        const assignedPiStillExists = allPis.some(
            (pi) => pi.piKey === editingVehicleData.raspberry_pi.name
        )

        if (assignedPiStillExists) return

        const removedPiName = editingVehicleData.raspberry_pi.name
        setEditingVehicleData((prev) => {
            if (!prev) return prev

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
        })
        setPiStatusMessage(`Raspberry Pi ${removedPiName} was deleted and has been unassigned from this ambulance.`)
    }, [allPis, editingVehicleData, piLoading])

    const fetchVehicles = async () => {
        try {
            setFetchLoading(true)
            setError(null)

            const json = await fetchJsonWithRetry(`${apiBase}/api/fetchalldetails`)

            const backendRows = Array.isArray(json?.data) ? json.data : []
            const normalizedVehicles = normalizeAllDetailsRows(backendRows)
            if (normalizedVehicles.length > 0) {
                setVehicles(normalizedVehicles)
                return
            }

            const fallbackVehicles = await fetchVehiclesFromSupabase()
            setVehicles(fallbackVehicles)
        } catch (err) {
            console.error('Error fetching vehicles from backend:', err)

            try {
                const fallbackVehicles = await fetchVehiclesFromSupabase()
                setVehicles(fallbackVehicles)
                setError(null)
            } catch (fallbackError) {
                console.error('Error fetching vehicles from Supabase:', fallbackError)
                setError('Failed to load vehicles. Please try again.')
            }
        } finally {
            setFetchLoading(false)
        }
    }

    const fetchPiDetails = async () => {
        try {
            setPiLoading(true)
            setPiLoadError('')

            const json = await fetchJsonWithRetry(`${apiBase}/api/fetchpidetails`)
            const piList = normalizePiSnapshot(json)
            setAllPis(piList)
            setAvailablePis(getUnassignedPis(piList))
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

    const getFirstAvailableBleAddress = (vehicleData, assetId, assetType) => {
        const selectedPiName = vehicleData?.raspberry_pi?.name
        if (!selectedPiName) return ''

        const selectedPi = allPis.find((pi) => pi.piKey === selectedPiName)
        const devices = Array.isArray(selectedPi?.devices) ? selectedPi.devices : []
        const bleOptions = [
            ...devices.filter((device) =>
                (device.name || '').toLowerCase().includes(
                    assetType === 'BOX' ? 'box' : 'pouch'
                )
            ),
            ...devices.filter(
                (device) =>
                    !(device.name || '').toLowerCase().includes(
                        assetType === 'BOX' ? 'box' : 'pouch'
                    )
            )
        ]

        const usedIdentifiers = new Set(
            (vehicleData?.assets || [])
                .filter((asset) => asset.id !== assetId)
                .map((asset) => asset?.ble_tag?.identifier || '')
                .filter(Boolean)
        )

        const availableDevice = bleOptions.find(
            (device) => device.address && !usedIdentifiers.has(device.address)
        )

        return availableDevice?.address || ''
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
                raspberry_pi_name: vehicleDataToSave.raspberry_pi?.name || '',
                assets: (vehicleDataToSave.assets || []).map((asset) => ({
                    id: asset.id,
                    type: asset.type,
                    label: asset.label,
                    ble_identifier:
                        asset.ble_tag && typeof asset.ble_tag.identifier === 'string'
                            ? asset.ble_tag.identifier.trim()
                            : ''
                }))
            }

            const res = await fetch(`${apiBase}/api/updateambulance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const json = await res.json()
            if (!res.ok) throw new Error(json.detail || json.message || 'Update failed')

            setVehicles((prev) =>
                prev.map((vehicle) =>
                    vehicle.id === vehicleIdToSave
                        ? JSON.parse(JSON.stringify(vehicleDataToSave))
                        : vehicle
                )
            )
            await fetchPiDetails()
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
            const res = await fetch(`${apiBase}/api/deleteambulance/${vehicleId}`, {
                method: 'DELETE'
            })
            const json = await res.json()

            if (!res.ok) {
                throw new Error(json.detail || json.message || 'Delete failed')
            }

            setVehicles((prev) => prev.filter((v) => v.id !== vehicleId))
            if (vehicle) {
                await supabase.from('alerts').insert({
                    asset_id: vehicleId,
                    vehicle_id: vehicleId,
                    status: 'OPEN',
                    reason: `Device deleted: ${vehicle.unit_number}`,
                    opened_at: new Date().toISOString()
                })
            }

            await fetchVehicles()
            await fetchPiDetails()

            if (editingVehicleId === vehicleId) {
                handleCancelVehicleEdit()
            }

            if (expandedVehicle === vehicleId) {
                setExpandedVehicle(null)
            }
        } catch (error) {
            console.error('Error deleting device:', error)
            setError(error?.message || 'Failed to delete device. Please try again.')
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
                    ble_tag: { identifier: formData.narcoticsPouch1BleId }
                },
                {
                    id: `pouch-2-${newVehicleId}`,
                    type: 'POUCH',
                    label: formData.narcoticsPouch2Label,
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
        const selectedPiKey = (formData.raspberryPiKey || '').trim()
        const box1Label = (formData.drugBox1Label || '').trim()
        const box2Label = (formData.drugBox2Label || '').trim()
        const pouch1Label = (formData.narcoticsPouch1Label || '').trim()
        const pouch2Label = (formData.narcoticsPouch2Label || '').trim()
        if (!unitNumber) throw new Error('Unit number is required.')
        if (!selectedPiKey) throw new Error('Please select a Raspberry Pi.')
        if (!box1Label || !box2Label || !pouch1Label || !pouch2Label) {
            throw new Error('All asset labels are required.')
        }

        try {
            const payload = {
                unit_number: unitNumber,
                station_name: 'Main Station',
                raspberry_pi_name: selectedPiKey,
                assets: [
                    {
                        type: 'BOX',
                        label: box1Label,
                        ble_identifier: (formData.drugBox1BleId || '').trim()
                    },
                    {
                        type: 'BOX',
                        label: box2Label,
                        ble_identifier: (formData.drugBox2BleId || '').trim()
                    },
                    {
                        type: 'POUCH',
                        label: pouch1Label,
                        ble_identifier: (formData.narcoticsPouch1BleId || '').trim()
                    },
                    {
                        type: 'POUCH',
                        label: pouch2Label,
                        ble_identifier: (formData.narcoticsPouch2BleId || '').trim()
                    }
                ]
            }

            const res = await fetch(`${apiBase}/api/registerambulance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.detail || json.message || 'Registration failed')

            const createdVehicleId =
                typeof json?.data === 'object' && json?.data?.id ? json.data.id : json?.data

            await fetchVehicles()
            await fetchPiDetails()
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
                    {piStatusMessage ? (
                        <div className="vehicles-state vehicles-state--error" style={{ marginBottom: '16px' }}>
                            <div className="vehicles-state-message">{piStatusMessage}</div>
                        </div>
                    ) : null}

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

                            const originalAssignedPi = vehicle.raspberry_pi?.name
                                ? {
                                    piKey: vehicle.raspberry_pi.name,
                                    ipAddress: vehicle.raspberry_pi.ip_address || ''
                                }
                                : null
                            const currentSelectedPi = currentVehicle.raspberry_pi?.name
                                ? {
                                    piKey: currentVehicle.raspberry_pi.name,
                                    ipAddress: currentVehicle.raspberry_pi.ip_address || ''
                                }
                                : null
                            const raspberryPiOptions = Array.from(
                                [originalAssignedPi, currentSelectedPi, ...availablePis]
                                    .filter((pi) => pi?.piKey)
                                    .reduce((optionsByKey, pi) => {
                                        if (!optionsByKey.has(pi.piKey)) {
                                            optionsByKey.set(pi.piKey, pi)
                                        }
                                        return optionsByKey
                                    }, new Map())
                                    .values()
                            )
                            const selectedEditPi = allPis.find(
                                (pi) => pi.piKey === currentVehicle.raspberry_pi?.name
                            )
                            const disableAssetEditing =
                                isEditing &&
                                !piLoading &&
                                !currentVehicle.raspberry_pi?.name &&
                                raspberryPiOptions.length === 0
                            const selectedEditPiDevices = Array.isArray(selectedEditPi?.devices)
                                ? selectedEditPi.devices
                                : []
                            const getBleOptionsForType = (assetType) => {
                                const matchingDevices = selectedEditPiDevices.filter((device) =>
                                    (device.name || '').toLowerCase().includes(
                                        assetType === 'BOX' ? 'box' : 'pouch'
                                    )
                                )

                                return matchingDevices.length > 0
                                    ? matchingDevices
                                    : selectedEditPiDevices
                            }

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
                                                                currentVehicle.raspberry_pi?.name || 'No Raspberry Pi assigned'
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="vehicle-field">
                                                        <div className="vehicle-field-label">Pi IP Address</div>
                                                        <div className="vehicle-field-value">
                                                            {isEditing ? (
                                                                <div className="vehicle-asset-value">
                                                                    {currentVehicle.raspberry_pi?.ip_address || 'No Pi assigned'}
                                                                </div>
                                                            ) : (
                                                                currentVehicle.raspberry_pi?.ip_address || 'No Pi assigned'
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {!isEditing && !currentVehicle.raspberry_pi?.name && (
                                                <div
                                                    style={{
                                                        color: '#92400e',
                                                        fontSize: '13px',
                                                        marginTop: '8px'
                                                    }}
                                                >
                                                    This fire ambulance does not currently have a Raspberry Pi assigned.
                                                </div>
                                            )}

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

                                            {disableAssetEditing && (
                                                <div
                                                    style={{
                                                        color: '#92400e',
                                                        fontSize: '13px',
                                                        marginTop: '8px'
                                                    }}
                                                >
                                                    No unassigned Raspberry Pis are available. Asset fields are
                                                    disabled until a Raspberry Pi can be selected.
                                                </div>
                                            )}

                                            <div className="vehicle-section">
                                                <div className="vehicle-section-label">BOXES</div>
                                                {drugBoxes.length === 0 ? (
                                                    <div className="vehicle-empty-row">
                                                        No boxes configured for this fire ambulance.
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
                                                                                disabled={disableAssetEditing}
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
                                                                                disabled={disableAssetEditing}
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
                                                        No pouches configured for this fire ambulance.
                                                    </div>
                                                ) : (
                                                    <div className="vehicle-assets-grid">
                                                        {pouches.map((pouch, index) => {
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
                                                                                    disabled={disableAssetEditing}
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
                                                                                    disabled={disableAssetEditing}
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
