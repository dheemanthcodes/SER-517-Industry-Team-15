from datetime import datetime
from typing import Any, Callable, Dict, Optional


def ensure_alert_bucket(alert_state_map: Dict[str, Dict[str, Dict[str, Any]]], asset_id: str) -> Dict[str, Dict[str, Any]]:
    return alert_state_map.setdefault(asset_id, {})


def set_alert(
    alert_state_map: Dict[str, Dict[str, Dict[str, Any]]],
    asset_id: str,
    alert_type: str,
    severity: str,
    message: str,
    now_fn: Callable[[], datetime],
) -> None:
    alert_bucket = ensure_alert_bucket(alert_state_map, asset_id)
    existing_alert = alert_bucket.get(alert_type)
    now = now_fn()

    if (
        existing_alert
        and existing_alert.get("is_active")
        and existing_alert.get("severity") == severity
        and existing_alert.get("message") == message
    ):
        return

    alert_bucket[alert_type] = {
        "alert_type": alert_type,
        "severity": severity,
        "message": message,
        "is_active": True,
        "opened_at": existing_alert.get("opened_at", now.isoformat()) if existing_alert else now.isoformat(),
        "last_updated_at": now.isoformat(),
    }


def clear_alert(
    alert_state_map: Dict[str, Dict[str, Dict[str, Any]]],
    asset_id: str,
    alert_type: str,
    now_fn: Callable[[], datetime],
) -> None:
    alert_bucket = alert_state_map.get(asset_id)
    if not alert_bucket:
        return

    existing_alert = alert_bucket.get(alert_type)
    if not existing_alert or not existing_alert.get("is_active"):
        return

    existing_alert["is_active"] = False
    existing_alert["resolved_at"] = now_fn().isoformat()


def clear_state_alerts(
    alert_state_map: Dict[str, Dict[str, Dict[str, Any]]],
    asset_id: str,
    missing_alert_type: str,
    overdue_alert_type: str,
    now_fn: Callable[[], datetime],
) -> None:
    clear_alert(alert_state_map, asset_id, missing_alert_type, now_fn)
    clear_alert(alert_state_map, asset_id, overdue_alert_type, now_fn)


def update_low_battery_alert(
    alert_state_map: Dict[str, Dict[str, Dict[str, Any]]],
    asset_id: str,
    battery_level: Optional[float],
    low_battery_alert_type: str,
    now_fn: Callable[[], datetime],
) -> None:
    if not isinstance(battery_level, (int, float)):
        clear_alert(alert_state_map, asset_id, low_battery_alert_type, now_fn)
        return

    battery_value = float(battery_level)
    if battery_value < 10:
        set_alert(
            alert_state_map,
            asset_id,
            low_battery_alert_type,
            "critical",
            f"Battery critically low at {battery_value:.1f}%",
            now_fn,
        )
        return

    if battery_value < 20:
        set_alert(
            alert_state_map,
            asset_id,
            low_battery_alert_type,
            "warning",
            f"Battery low at {battery_value:.1f}%",
            now_fn,
        )
        return

    clear_alert(alert_state_map, asset_id, low_battery_alert_type, now_fn)
