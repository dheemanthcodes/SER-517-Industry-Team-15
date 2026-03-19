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

            if (fetchError) throw fetchError

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
        setEditingVehicleData(prev => ({ ...prev, [field]: value }))
    }

    const handleAssetLabelChange = (assetId, value) => {
        setEditingVehicleData(prev => ({
            ...prev,
            assets: prev.assets.map(a =>
                a.id === assetId ? { ...a, label: value } : a
            )
        }))
    }

    const handleAssetBleChange = (assetId, value) => {
        setEditingVehicleData(prev => ({
            ...prev,
            assets: prev.assets.map(a =>
                a.id === assetId
                    ? { ...a, ble_tag: { ...a.ble_tag, identifier: value } }
                    : a
            )
        }))
    }

    const handleAssetParentChange = (assetId, parentId) => {
        setEditingVehicleData(prev => ({
            ...prev,
            assets: prev.assets.map(a =>
                a.id === assetId ? { ...a, parent_asset_id: parentId || null } : a
            )
        }))
    }

    const handleCancelVehicleEdit = () => {
        setEditingVehicleId(null)
        setEditingVehicleData(null)
        setEditingError('')
    }

    const handleSaveVehicleEdit = async () => {
        if (!editingVehicleId || !editingVehicleData) return

        const unitNumber = editingVehicleData.unit_number?.trim()
        if (!unitNumber) {
            setEditingError('Unit number is required.')
            return
        }

        setVehicles(prev =>
            prev.map(v => v.id === editingVehicleId ? editingVehicleData : v)
        )

        await supabase.from('alerts').insert({
            asset_id: editingVehicleId,
            vehicle_id: editingVehicleId,
            status: 'OPEN',
            reason: `Device updated: ${unitNumber}`,
            opened_at: new Date().toISOString()
        })

        handleCancelVehicleEdit()
    }

    const deleteData = async (vehicleId) => {
        const vehicle = vehicles.find(v => v.id === vehicleId)

        setVehicles(prev => prev.filter(v => v.id !== vehicleId))

        if (vehicle) {
            await supabase.from('alerts').insert({
                asset_id: vehicleId,
                vehicle_id: vehicleId,
                status: 'OPEN',
                reason: `Device deleted: ${vehicle.unit_number}`,
                opened_at: new Date().toISOString()
            })
        }
    }

    const handleRegisterAmbulance = async (formData) => {
        const payload = {
            p_unit_number: formData.ambulanceNumber.trim(),
            p_station_name: 'Main Station',

            p_box1_label: formData.drugBox1Label.trim(),
            p_box1_ble_id: formData.drugBox1BleId.trim(),
            p_box2_label: formData.drugBox2Label.trim(),
            p_box2_ble_id: formData.drugBox2BleId.trim(),

            p_pouch1_label: formData.narcoticsPouch1Label.trim(),
            p_pouch1_ble_id: formData.narcoticsPouch1BleId.trim(),
            p_pouch2_label: formData.narcoticsPouch2Label.trim(),
            p_pouch2_ble_id: formData.narcoticsPouch2BleId.trim()
        }

        const { data, error } = await supabase.rpc('register_ambulance', payload)
        if (error) throw error

        await supabase.from('alerts').insert({
            asset_id: data,
            vehicle_id: data,
            status: 'OPEN',
            reason: `Device added: ${payload.p_unit_number}`,
            opened_at: new Date().toISOString()
        })

        await fetchVehicles()
        if (data) setExpandedVehicle(data)
    }

    return (
        <div className="devices-page">
            <div className="page-container">

                <button onClick={() => setShowAddDeviceModal(true)}>
                    Register Ambulance
                </button>

                {vehicles.map(vehicle => (
                    <div key={vehicle.id}>
                        <h3 onClick={() => toggleVehicle(vehicle.id)}>
                            {vehicle.unit_number}
                        </h3>

                        {expandedVehicle === vehicle.id && (
                            <div>
                                <button onClick={() => startVehicleEdit(vehicle)}>Edit</button>
                                <button onClick={() => deleteData(vehicle.id)}>Delete</button>
                            </div>
                        )}
                    </div>
                ))}

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