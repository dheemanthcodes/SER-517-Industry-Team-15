import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

function EventHistory() {
    const [selectedStatus, setSelectedStatus] = useState('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [events, setEvents] = useState([])

    const mapStatusToUI = (dbStatus) => {
        switch (dbStatus) {
            case 'OPEN': return 'open'
            case 'ACK': return 'resolved'
            case 'CLOSED': return 'closed'
            default: return 'open'
        }
    }

    const mapUIToStatus = (uiStatus) => {
        switch (uiStatus) {
            case 'open': return 'OPEN'
            case 'resolved': return 'ACK'
            case 'closed': return 'CLOSED'
            default: return 'OPEN'
        }
    }

    useEffect(() => {
        const fetchAlerts = async () => {
            const { data, error } = await supabase
                .from('alerts')
                .select('id, asset_id, vehicle_id, status, opened_at, reason, vehicles(unit_number)')
                .order('opened_at', { ascending: false })

            if (error) {
                console.error('Error fetching alerts:', error)
                return
            }

            const mappedEvents = data.map(alert => ({
                id: alert.id,
                asset_id: alert.asset_id,
                vehicle: alert.vehicles?.unit_number || alert.asset_id || 'Unknown',
                status: alert.reason.startsWith('Device') ? '' : mapStatusToUI(alert.status),
                observed_at: new Date(alert.opened_at).toLocaleString(),
                isDeviceEvent: alert.reason.startsWith('Device')
            }))

            setEvents(mappedEvents)
        }

        fetchAlerts()

        // Subscribe to realtime changes
        const subscription = supabase
            .channel('alerts_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
                console.log('Alert change:', payload)
                fetchAlerts() // Refetch on any change
            })
            .subscribe()

        return () => {
            supabase.removeChannel(subscription)
        }
    }, [])

    const handleStatusChange = async (id, newStatus) => {
        const event = events.find(e => e.id === id)
        if (event.isDeviceEvent) return // Don't update status for device events

        const dbStatus = mapUIToStatus(newStatus)
        const { error } = await supabase
            .from('alerts')
            .update({ status: dbStatus })
            .eq('id', id)

        if (error) {
            console.error('Error updating status:', error)
            return
        }

        // Update local state
        setEvents(events.map(event =>
            event.id === id ? { ...event, status: newStatus } : event
        ))
    }

    const filteredEvents = events.filter((event) => {
        const matchesStatus =
            selectedStatus === 'all' ||
            (event.status && event.status.toLowerCase() === selectedStatus)

        const searchValue = searchTerm.toLowerCase()

        const matchesSearch =
            event.asset_id?.toString().toLowerCase().includes(searchValue) ||
            event.vehicle.toLowerCase().includes(searchValue) ||
            event.status.toLowerCase().includes(searchValue) ||
            event.observed_at.toLowerCase().includes(searchValue)

        return matchesStatus && matchesSearch
    })

    return (
    <div className="event-history-container">
        <div className="event-history-header">
            <h1>Event History</h1>
            <p>Review recent alerts.</p>
        </div>

        <div className="event-history-toolbar">
            <input
                type="text"
                placeholder="Search events"
                className="event-history-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            <select
                className="event-history-filter"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
            >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
            </select>
        </div>

        <div className="event-history-table">
            <div className="event-history-table-head">
                <span>Asset ID</span>
                <span>Vehicle</span>
                <span>Observed At</span>
                <span>Status</span>
            </div>

            {filteredEvents.length > 0 ? (
                filteredEvents.map((event) => (
                    <div key={event.id} className="event-history-row">
                        <span>{event.asset_id || ''}</span>
                        <span>{event.vehicle}</span>
                        <span>{event.observed_at}</span>
                        {event.status && event.status !== '' ? (
                            <select
                                className={`event-status event-status-${event.status.toLowerCase()}`}
                                value={event.status}
                                onChange={(e) => handleStatusChange(event.id, e.target.value)}
                            >
                                <option value="open">open</option>
                                <option value="resolved">resolved</option>
                                <option value="closed">closed</option>
                            </select>
                        ) : (
                            <span></span>
                        )}
                    </div>
                ))
            ) : (
                <div className="event-history-empty">
                    No events found
                </div>
            )}
        </div>
    </div>
);
}

export default EventHistory;