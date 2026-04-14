import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import {
    fetchAlertHistory,
    isDeviceAuditAlert,
    updateAlertStatus,
} from '../utils/alertStore'

function EventHistory() {
    const [selectedStatus, setSelectedStatus] = useState('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [events, setEvents] = useState([])
    const [loading, setLoading] = useState(true)
    const [savingId, setSavingId] = useState(null)
    const [error, setError] = useState('')

    const mapStatusToUI = (dbStatus) => {
        switch (dbStatus) {
            case 'OPEN':
                return 'open'
            case 'ACK':
                return 'resolved'
            case 'CLOSED':
                return 'closed'
            default:
                return 'open'
        }
    }

    const mapUIToStatus = (uiStatus) => {
        switch (uiStatus) {
            case 'open':
                return 'OPEN'
            case 'resolved':
                return 'ACK'
            case 'closed':
                return 'CLOSED'
            default:
                return 'OPEN'
        }
    }

    const fetchAlerts = useCallback(async () => {
        try {
            setError('')
            setLoading(true)

            const alerts = await fetchAlertHistory()
            const mappedEvents = alerts.map((alert) => {
                const isDeviceEvent = isDeviceAuditAlert(alert)

                return {
                    id: alert.id,
                    asset_id: alert.asset_id,
                    vehicle: alert.vehicleLabel || alert.asset_id || 'Unknown',
                    details: alert.reason || alert.description || 'Alert',
                    status: isDeviceEvent ? '' : mapStatusToUI(alert.status),
                    observed_at: new Date(alert.opened_at).toLocaleString(),
                    isDeviceEvent,
                }
            })

            setEvents(mappedEvents)
        } catch (err) {
            console.error('Error fetching alerts:', err)
            setError('Failed to load event history.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchAlerts()

        const subscription = supabase
            .channel('alerts_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'alerts' },
                () => {
                    fetchAlerts()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(subscription)
        }
    }, [fetchAlerts])

    const handleStatusChange = async (id, newStatus) => {
        const event = events.find((e) => e.id === id)
        if (!event || event.isDeviceEvent) return

        const dbStatus = mapUIToStatus(newStatus)

        try {
            setSavingId(id)
            await updateAlertStatus(id, dbStatus)

            await fetchAlerts()
        } catch (err) {
            console.error('Error updating status:', err)
            setError('Failed to update event status.')
        } finally {
            setSavingId(null)
        }
    }

    const filteredEvents = useMemo(() => {
        return events.filter((event) => {
            const eventStatus = (event.status || '').toLowerCase()
            const searchValue = searchTerm.toLowerCase()

            const matchesStatus =
                selectedStatus === 'all' ||
                (eventStatus && eventStatus === selectedStatus)

            const matchesSearch =
                String(event.asset_id ?? '').toLowerCase().includes(searchValue) ||
                String(event.vehicle ?? '').toLowerCase().includes(searchValue) ||
                String(event.details ?? '').toLowerCase().includes(searchValue) ||
                eventStatus.includes(searchValue) ||
                String(event.observed_at ?? '').toLowerCase().includes(searchValue)

            return matchesStatus && matchesSearch
        })
    }, [events, searchTerm, selectedStatus])

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

            {error ? <div className="event-history-error">{error}</div> : null}

            <div className="event-history-table">
                <div className="event-history-table-head">
                    <span>Asset ID</span>
                    <span>Vehicle</span>
                    <span>Alert Details</span>
                    <span>Observed At</span>
                    <span>Status</span>
                </div>

                {loading ? (
                    <div className="event-history-empty">Loading events...</div>
                ) : filteredEvents.length > 0 ? (
                    filteredEvents.map((event) => (
                        <div key={event.id} className="event-history-row">
                            <span>{event.asset_id || ''}</span>
                            <span>{event.vehicle}</span>
                            <span className="event-history-details">{event.details}</span>
                            <span>{event.observed_at}</span>

                            {event.status && event.status !== '' ? (
                                <select
                                    className={`event-status event-status-${event.status.toLowerCase()}`}
                                    value={event.status}
                                    disabled={savingId === event.id}
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
                    <div className="event-history-empty">No events found</div>
                )}
            </div>
        </div>
    )
}

export default EventHistory
