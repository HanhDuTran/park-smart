"""ParkSmart FastAPI application entrypoint."""

import asyncio
import logging

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import parking, route, search, voice
from app.services import sf_parking_db

load_dotenv()

# Uvicorn only configures its own "uvicorn.*" loggers, not app loggers, so
# INFO-level logs (e.g. the estimation count in overpass.py) would otherwise
# be silently dropped by the root logger's default WARNING level.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="ParkSmart API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parking.router, prefix="/api")
app.include_router(route.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(voice.router, prefix="/api")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


async def _download_sf_parking_db() -> None:
    try:
        await sf_parking_db.download_and_build_db()
    except Exception as exc:  # noqa: BLE001 — must never crash the app
        logger.warning("SF parking DB download failed (app still works without it): %s", exc)


@app.on_event("startup")
async def on_startup() -> None:
    if sf_parking_db.is_db_populated():
        logger.info("SF parking regulations DB already populated — ready")
        return
    logger.info("SF parking regulations DB not found — downloading from DataSF in the background...")
    asyncio.create_task(_download_sf_parking_db())
