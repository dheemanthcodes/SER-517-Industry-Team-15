import os

from dotenv import load_dotenv
from supabase import create_client


load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.getenv("supabase_url")
SUPABASE_KEY = os.getenv("supabase_service_role_key") or os.getenv("supabase_anonkey")
FRONTEND_URL = os.getenv(
    "frontend_url",
    "https://drug-box-base-station-smart-tracking.vercel.app",
)
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "frontend_origins",
        ",".join(
            [
                FRONTEND_URL,
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ]
        ),
    ).split(",")
    if origin.strip()
]

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing Supabase credentials: set supabase_url and supabase_service_role_key")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

ALLOWED_DEVICES = {
    "pi-001": "6gOIpiSJ_zlS_hskU8zkIDL0kvQta5zKzsERk98uKj0",
}
