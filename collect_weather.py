#!/usr/bin/env python3
"""Collect hourly weather and air-quality forecasts from Open-Meteo."""

from __future__ import annotations

import csv
import json
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


TIMEZONE = "Asia/Seoul"
FORECAST_DAYS = 7
OUTPUT_ROOT = Path("data")
WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_API_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
HTTP_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class Location:
    slug: str
    name: str
    latitude: float
    longitude: float


LOCATIONS = (
    Location("jinju", "진주", 35.19278, 128.08472),
    Location("daegu", "대구", 35.87028, 128.59111),
)

CSV_FIELDS = (
    "collected_at",
    "location",
    "latitude",
    "longitude",
    "forecast_time",
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "wind_speed_10m",
    "pm10",
    "pm2_5",
)


class CollectionError(RuntimeError):
    """Raised when an API response cannot safely be written as forecast data."""


def fetch_json(base_url: str, params: dict[str, str | int | float]) -> dict[str, Any]:
    """Fetch and decode one JSON object from an Open-Meteo endpoint."""
    url = f"{base_url}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "weather-csv-collector/1.0"})

    try:
        with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except HTTPError as exc:
        raise CollectionError(f"API returned HTTP {exc.code}: {base_url}") from exc
    except URLError as exc:
        raise CollectionError(f"Could not reach API: {exc.reason}") from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise CollectionError(f"API returned invalid JSON: {base_url}") from exc

    if not isinstance(payload, dict):
        raise CollectionError(f"API response was not a JSON object: {base_url}")
    if payload.get("error"):
        raise CollectionError(f"API error: {payload.get('reason', 'unknown error')}")
    if not isinstance(payload.get("hourly"), dict):
        raise CollectionError(f"API response has no hourly data: {base_url}")
    return payload


def hourly_rows(payload: dict[str, Any], fields: tuple[str, ...]) -> dict[str, dict[str, Any]]:
    """Index selected hourly arrays by their ISO 8601 forecast timestamp."""
    hourly = payload["hourly"]
    times = hourly.get("time")
    if not isinstance(times, list) or not times:
        raise CollectionError("Hourly response has no timestamps")

    for field in fields:
        values = hourly.get(field)
        if not isinstance(values, list) or len(values) != len(times):
            raise CollectionError(f"Hourly field has an unexpected length: {field}")

    return {
        forecast_time: {field: hourly[field][index] for field in fields}
        for index, forecast_time in enumerate(times)
    }


def collect_location(location: Location, collected_at: datetime) -> list[dict[str, Any]]:
    """Collect and merge seven days of weather and particulate forecasts."""
    common_params: dict[str, str | int | float] = {
        "latitude": location.latitude,
        "longitude": location.longitude,
        "timezone": TIMEZONE,
        "forecast_days": FORECAST_DAYS,
    }
    weather_fields = (
        "temperature_2m",
        "relative_humidity_2m",
        "precipitation",
        "wind_speed_10m",
    )
    air_fields = ("pm10", "pm2_5")

    weather_payload = fetch_json(
        WEATHER_API_URL,
        {**common_params, "hourly": ",".join(weather_fields)},
    )
    air_payload = fetch_json(
        AIR_QUALITY_API_URL,
        {**common_params, "hourly": ",".join(air_fields)},
    )
    weather_by_time = hourly_rows(weather_payload, weather_fields)
    air_by_time = hourly_rows(air_payload, air_fields)

    rows: list[dict[str, Any]] = []
    for forecast_time, weather in weather_by_time.items():
        air = air_by_time.get(forecast_time, {})
        rows.append(
            {
                "collected_at": collected_at.isoformat(timespec="seconds"),
                "location": location.name,
                "latitude": location.latitude,
                "longitude": location.longitude,
                "forecast_time": forecast_time,
                **weather,
                "pm10": air.get("pm10"),
                "pm2_5": air.get("pm2_5"),
            }
        )

    if len(rows) != FORECAST_DAYS * 24:
        raise CollectionError(
            f"Expected {FORECAST_DAYS * 24} weather rows for {location.name}, got {len(rows)}"
        )
    return rows


def write_csv_atomic(path: Path, rows: list[dict[str, Any]]) -> None:
    """Replace a daily CSV only after its complete replacement is ready."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_name: str | None = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8-sig",
            newline="",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary_file:
            temporary_name = temporary_file.name
            writer = csv.DictWriter(temporary_file, fieldnames=CSV_FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        os.replace(temporary_name, path)
    finally:
        if temporary_name and os.path.exists(temporary_name):
            os.unlink(temporary_name)


def main() -> int:
    collected_at = datetime.now(ZoneInfo(TIMEZONE)).replace(microsecond=0)

    try:
        for location in LOCATIONS:
            rows = collect_location(location, collected_at)
            output_path = (
                OUTPUT_ROOT
                / location.slug
                / f"{location.slug}_{collected_at.date().isoformat()}.csv"
            )
            write_csv_atomic(output_path, rows)
            latest_path = OUTPUT_ROOT / location.slug / "latest.csv"
            write_csv_atomic(latest_path, rows)
            print(f"Wrote {len(rows)} rows to {output_path}")
            print(f"Updated latest forecast at {latest_path}")
    except CollectionError as exc:
        print(f"Collection failed: {exc}", file=__import__("sys").stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
