import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../supabaseClient"
import AlertPopup from "./AlertPopup"
import { fetchOpenAlerts, isPopupEligibleAlert } from "../utils/alertStore"

const PREVIEW_ALERT_ID = "preview-alert-popup"

const getPreviewAlertFromQuery = () => {
  if (typeof window === "undefined") return null

  const params = new URLSearchParams(window.location.search)
  if (params.get("previewAlert") !== "1") {
    return null
  }

  return {
    id: PREVIEW_ALERT_ID,
    asset_id: "Preview Asset",
    vehicle_id: null,
    vehicleLabel: "AMB-101",
    ambulanceNumber: "AMB-101",
    ambulanceName: "Station 7",
    assetName: "Narcotics Pouch 1",
    bleName: "Minew E8",
    bleMacAddress: "AA:BB:CC:DD:EE:FF",
    status: "OPEN",
    reason: "Preview alert popup",
    title: "Preview alert popup",
    description: "This is a sample alert for UI preview.",
    opened_at: new Date().toISOString(),
  }
}

function AlertPopupHost() {
  const [openAlerts, setOpenAlerts] = useState([])
  const [currentAlert, setCurrentAlert] = useState(null)
  const [dismissedAlertIds, setDismissedAlertIds] = useState([])
  const [previewAlert, setPreviewAlert] = useState(() => getPreviewAlertFromQuery())

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
    () =>
      [...(previewAlert ? [previewAlert] : []), ...openAlerts].filter(
        (alert) => !dismissedAlertIds.includes(alert.id)
      ),
    [dismissedAlertIds, openAlerts, previewAlert]
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
        setDismissedAlertIds((currentIds) => {
          return currentIds.includes(prev.id) ? currentIds : [...currentIds, prev.id]
        })
      }

      if (prev?.id === PREVIEW_ALERT_ID) {
        setPreviewAlert(null)
      }

      return null
    })
  }, [])

  return (
    <AlertPopup
      alert={currentAlert}
      onClose={handleClose}
    />
  )
}

export default AlertPopupHost
