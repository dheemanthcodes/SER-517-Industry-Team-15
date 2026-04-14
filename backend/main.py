from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from .config import FRONTEND_ORIGINS
    from .routers.bluetooth import router as bluetooth_router
    from .routers.dashboard import router as dashboard_router
    from .routers.device_ws import router as device_ws_router
    from .routers.general import router as general_router
    from .routers.pi_data import router as pi_data_router
except ImportError:
    from config import FRONTEND_ORIGINS
    from routers.bluetooth import router as bluetooth_router
    from routers.dashboard import router as dashboard_router
    from routers.device_ws import router as device_ws_router
    from routers.general import router as general_router
    from routers.pi_data import router as pi_data_router


app = FastAPI(
    title="Pi Bluetooth API",
    description=(
        "API for Raspberry Pi integrations. "
        "Use these endpoints to receive JSON payloads from a Pi, connect over WebSocket, and manage Bluetooth devices."
    ),
    version="1.0.0",
    swagger_ui_parameters={"defaultModelsExpandDepth": -1},
    openapi_tags=[
        {"name": "General", "description": "Basic health and welcome routes."},
        {"name": "Pi Data", "description": "Receive JSON data sent from a Raspberry Pi."},
        {"name": "Bluetooth", "description": "Manage Bluetooth scanning, pairing, and removal through the Pi."},
        {"name": "Dashboard", "description": "Dashboard and device management data endpoints."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(general_router)
app.include_router(pi_data_router)
app.include_router(device_ws_router)
app.include_router(bluetooth_router)
app.include_router(dashboard_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
