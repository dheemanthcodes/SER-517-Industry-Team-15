import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"
import AlertPopup from "./AlertPopup"
import { fetchOpenAlerts, isPopupEligibleAlert } from "../utils/alertStore"

function AlertPopupHost() {
  const [openAlerts, setOpenAlerts] = useState([])
  const [currentAlert, setCurrentAlert] = useState(null)
  const [dismissedAlertIds, setDismissedAlertIds] = useState([])

  const loadOpenAlerts = useCallback(async () => {
    try {
      const alerts = await fetchOpenAlerts()
      setOpenAlerts(alerts.filter(isPopupEligibleAlert))
    } catch (error) {
      console.error("Error loading popup alerts:", error)
    }
  }, [])

  useEffect(() => {
    loadOpenAlerts()

    const channel = supabase
      .channel("global-alert-popup-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => {
          loadOpenAlerts()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadOpenAlerts])

  const actionableAlerts = useMemo(
    () => openAlerts.filter((alert) => !dismissedAlertIds.includes(alert.id)),
    [dismissedAlertIds, openAlerts]
  )

  useEffect(() => {
    if (actionableAlerts.length === 0) {
      setCurrentAlert(null)
      return
    }

    setCurrentAlert((prev) => {
      if (prev && actionableAlerts.some((alert) => alert.id === prev.id)) {
        return prev
      }

      return actionableAlerts[0]
    })
  }, [actionableAlerts])

  const handleClose = useCallback(() => {
    setCurrentAlert((prev) => {
      if (prev?.id) {
        setDismissedAlertIds((currentIds) =>
          currentIds.includes(prev.id) ? currentIds : [...currentIds, prev.id]
        )
      }

      return null
    })
  }, [])

  const handleUpdated = useCallback(async () => {
    await loadOpenAlerts()
  }, [loadOpenAlerts])

  return (
    <AlertPopup
      alert={currentAlert}
      onClose={handleClose}
      onUpdated={handleUpdated}
    />
  )
}

export default AlertPopupHost
