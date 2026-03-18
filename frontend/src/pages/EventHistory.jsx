function EventHistory() {
    const events = [
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
            type: 'Sync',
            vehicle: 'Ambulance 102',
            description: 'Inventory sync completed',
            timestamp: '2026-03-16 08:54 AM',
            status: 'Completed',
        },
        {
            id: 3,
            type: 'Assignment',
            vehicle: 'Ambulance 314',
            description: 'Drug box linked successfully',
            timestamp: '2026-03-16 08:31 AM',
            status: 'Completed',
        },
        {
            id: 4,
            type: 'Alert',
            vehicle: 'Ambulance 118',
            description: 'Base station connection lost',
            timestamp: '2026-03-16 08:05 AM',
            status: 'Resolved',
        },
        {
            id: 5,
            type: 'Battery',
            vehicle: 'Beacon Tag 17',
            description: 'Battery reported low level',
            timestamp: '2026-03-16 07:48 AM',
            status: 'Open',
        },
    ]

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
                />

                <select className="event-history-filter" defaultValue="all">
                    <option value="all">All Events</option>
                    <option value="alert">Alerts</option>
                    <option value="sync">Sync</option>
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

                {events.map((event) => (
                    <div key={event.id} className="event-history-row">
                        <span>{event.type}</span>
                        <span>{event.vehicle}</span>
                        <span>{event.description}</span>
                        <span>{event.timestamp}</span>
                        <span className={`event-status event-status-${event.status.toLowerCase()}`}>
                            {event.status}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default EventHistory