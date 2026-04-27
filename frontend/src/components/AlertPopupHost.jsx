import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../supabaseClient"
import AlertPopup from "./AlertPopup"
import {
  ALERTS_REFRESH_EVENT,
  fetchOpenAlerts,
  isPopupEligibleAlert,
} from "../utils/alertStore"

const PREVIEW_ALERT_ID = "preview-alert-popup"
const ALERT_REFRESH_INTERVAL_MS = 5000
const ALERT_POPUP_ACKNOWLEDGED_EVENT = "alert-popup-acknowledged"

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
  const openAlertIdsRef = useRef("")

  const loadOpenAlerts = useCallback(async () => {
    try {
      const alerts = await fetchOpenAlerts()
      const popupAlerts = alerts.filter(isPopupEligibleAlert)
      const openAlertIds = popupAlerts.map((alert) => alert.id).sort().join("|")

      setOpenAlerts(popupAlerts)
      if (openAlertIdsRef.current !== openAlertIds) {
        openAlertIdsRef.current = openAlertIds
        window.dispatchEvent(new CustomEvent(ALERTS_REFRESH_EVENT))
      }
    } catch (error) {
      console.error("Error loading popup alerts:", error)
    }
  }, [])

  useEffect(() => {
    loadOpenAlerts()

    let refreshTimeout = null
    const scheduleRefresh = () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout)
      }

      refreshTimeout = window.setTimeout(() => {
        loadOpenAlerts()
      }, 150)
    }

    const channel = supabase
      .channel("global-alert-popup-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        scheduleRefresh
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          loadOpenAlerts()
        }
      })

    const intervalId = window.setInterval(() => {
      loadOpenAlerts()
    }, ALERT_REFRESH_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadOpenAlerts()
      }
    }

    window.addEventListener("focus", loadOpenAlerts)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout)
      }
      window.clearInterval(intervalId)
      window.removeEventListener("focus", loadOpenAlerts)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
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

        window.dispatchEvent(
          new CustomEvent(ALERT_POPUP_ACKNOWLEDGED_EVENT, {
            detail: { alertId: prev.id },
          })
        )
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
