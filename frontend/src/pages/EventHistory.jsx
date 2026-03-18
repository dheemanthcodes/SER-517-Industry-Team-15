import { useState, useEffect } from 'react'
import { getAlerts } from '../utils/alertStore'

function EventHistory() {
    const [selectedType, setSelectedType] = useState('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [events, setEvents] = useState([
        {
            id: 1,
            type: 'Alert',
            vehicle: 'Ambulance 201',
            description: 'Drug box moved out of range',
            timestamp: '2026-03-16 09:12 AM',
            status: 'Open',
        },
        {
            id: 2,
            type: 'Assignment',
            vehicle: 'Ambulance 314',
            description: 'Drug box linked successfully',
            timestamp: '2026-03-16 08:31 AM',
            status: 'Completed',
        },
        {
            id: 3,
            type: 'Alert',
            vehicle: 'Ambulance 118',
            description: 'Base station connection lost',
            timestamp: '2026-03-16 08:05 AM',
            status: 'Resolved',
        },
    ])

    useEffect(() => {
        const newAlerts = getAlerts()

        if (newAlerts.length > 0) {
            setEvents((prev) => {
                const existingIds = new Set(prev.map(e => e.id))

                const filteredNewAlerts = newAlerts.filter(
                    (alert) => !existingIds.has(alert.id)
                )

                return [...filteredNewAlerts, ...prev]
            })
        }
    }, [])

    const handleStatusChange = (id, newStatus) => {
        const updatedEvents = events.map((event) =>
            event.id === id ? { ...event, status: newStatus } : event
        )

        setEvents(updatedEvents)
    }

    const filteredEvents = events.filter((event) => {
        const matchesType =
            selectedType === 'all' ||
            event.type.toLowerCase() === selectedType

        const searchValue = searchTerm.toLowerCase()

        const matchesSearch =
            event.type.toLowerCase().includes(searchValue) ||
            event.vehicle.toLowerCase().includes(searchValue) ||
            event.description.toLowerCase().includes(searchValue) ||
            event.timestamp.toLowerCase().includes(searchValue) ||
            event.status.toLowerCase().includes(searchValue)

        return matchesType && matchesSearch
    })

    return (
    <div className="event-history-container">
        <div className="event-history-header">
            <h1>Event History</h1>
            <p>Review recent alerts, assignments, and system activity.</p>
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
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
            >
                <option value="all">All Events</option>
                <option value="alert">Alerts</option>
                <option value="assignment">Assignments</option>
                <option value="battery">Battery</option>
            </select>
        </div>

        <div className="event-history-table">
            <div className="event-history-table-head">
                <span>Type</span>
                <span>Vehicle / Device</span>
                <span>Description</span>
                <span>Timestamp</span>
                <span>Status</span>
            </div>

            {filteredEvents.length > 0 ? (
                filteredEvents.map((event) => (
                    <div key={event.id} className="event-history-row">
                        <span>{event.type}</span>
                        <span>{event.vehicle}</span>
                        <span>{event.description}</span>
                        <span>{event.timestamp}</span>
                        <select
                            className={`event-status event-status-${event.status.toLowerCase()}`}
                            value={event.status}
                            onChange={(e) => handleStatusChange(event.id, e.target.value)}
                        >
                            <option value="Open">Open</option>
                            <option value="Completed">Completed</option>
                            <option value="Resolved">Resolved</option>
                        </select>
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