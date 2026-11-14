"""Contracts for ephemeris and lunar terrain integrations.

Angles are degrees; timestamps passed to providers are aware UTC datetimes.
Unknown values remain None rather than implying a physical measurement.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

HORIZON_PROFILE_AZIMUTHS = tuple(range(0, 360, 10))


@dataclass(frozen=True)
class LandingSite:
    latitude: float
    longitude: float
    altitude_m: float = 0.0


@dataclass(frozen=True)
class SkyGeometry:
    sun_elevation_deg: float | None = None
    sun_azimuth_deg: float | None = None
    earth_elevation_deg: float | None = None
    earth_azimuth_deg: float | None = None
    sun_distance_au: float = 1.0


class EphemerisProvider(Protocol):
    """Observer geometry for Sun and Earth in a lunar local horizontal frame."""

    def geometries(self, site: LandingSite, timestamps: list[datetime]) -> list[SkyGeometry]: ...


class TerrainProvider(Protocol):
    def elevation_m(self, latitude: float, longitude: float) -> float: ...

    def horizon_deg(self, site: LandingSite, azimuth_deg: float, mast_height_m: float) -> float: ...
