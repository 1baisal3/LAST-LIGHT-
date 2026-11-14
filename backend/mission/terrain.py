"""Sample a lunar elevation GeoTIFF in metres relative to a 1737.4 km sphere."""

import math
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Geod, Transformer
from pyproj.exceptions import ProjError
from rasterio.errors import RasterioError
from django.conf import settings

from datasets.integrity import verify_dataset

from .errors import TerrainConfigurationError, TerrainCoverageError

MOON_RADIUS_M = 1737400.0


def line_of_sight(elevation_deg, horizon_deg):
    """Visibility of the target center; equality means grazing/obstructed."""
    return elevation_deg > horizon_deg


class LOLATerrainProvider:
    data_mode = 'external'

    def __init__(self, path, max_distance_m=10000, step_m=100):
        self.dataset = None
        if not path or not Path(path).is_file():
            raise TerrainConfigurationError('A local LOLA elevation GeoTIFF must be configured.')
        if not all(math.isfinite(v) for v in (step_m, max_distance_m)) or not 0 < step_m <= max_distance_m <= 100000:
            raise TerrainConfigurationError('Invalid terrain sampling distance or step.')
        if max_distance_m / step_m > 10000:
            raise TerrainConfigurationError('Terrain profile exceeds the supported sampling budget.')
        self.max_distance_m, self.step_m = max_distance_m, step_m
        self._horizons = {}
        try:
            self.dataset = rasterio.open(path)
            if self.dataset.driver != 'GTiff' or self.dataset.crs is None or self.dataset.count != 1:
                raise ValueError('Expected a single-band georeferenced GeoTIFF')
            target = CRS.from_user_input(self.dataset.crs)
            ellipsoid = target.ellipsoid
            if abs(ellipsoid.semi_major_metre - MOON_RADIUS_M) > 1 or abs(ellipsoid.semi_minor_metre - MOON_RADIUS_M) > 1:
                raise ValueError('Expected the LOLA 1737.4 km reference sphere')
            if self.dataset.units[0] not in (None, 'm', 'metre', 'meter'):
                raise ValueError('Elevation band must be measured in metres')
            source = CRS.from_proj4(f'+proj=longlat +R={MOON_RADIUS_M} +no_defs')
            self.transformer = Transformer.from_crs(source, target, always_xy=True)
            self.geod = Geod(a=MOON_RADIUS_M, b=MOON_RADIUS_M)
            self.sha256 = verify_dataset(path, settings.DATASET_MANIFEST_PATH)
        except (RasterioError, ProjError, ValueError) as exc:
            self.close()
            raise TerrainConfigurationError('LOLA dataset has an unsupported CRS, elevation unit or raster format.') from exc
        except Exception:
            self.close()
            raise

    def close(self):
        if self.dataset is not None:
            self.dataset.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def _elevations(self, latitudes, longitudes):
        try:
            xs, ys = self.transformer.transform(longitudes, latitudes, errcheck=True)
            points = list(zip(xs, ys))
            # Geographic LOLA products may use either -180..180 or 0..360.
            if self.dataset.crs.is_geographic and self.dataset.bounds.left >= 0:
                points = [(x % 360, y) for x, y in points]
            for x, y in points:
                row, col = self.dataset.index(x, y)
                if not (0 <= row < self.dataset.height and 0 <= col < self.dataset.width):
                    raise TerrainCoverageError('LOLA coverage does not include the full requested terrain profile.')
            samples = list(self.dataset.sample(points, indexes=1, masked=True))
            if any(np.ma.is_masked(sample[0]) for sample in samples):
                raise TerrainCoverageError('LOLA profile contains missing elevation data.')
            scale, offset = self.dataset.scales[0], self.dataset.offsets[0]
            elevations = np.array([float(sample[0]) * scale + offset for sample in samples])
            if not np.isfinite(elevations).all():
                raise TerrainCoverageError('LOLA profile contains invalid elevation data.')
            return elevations
        except (RasterioError, ProjError, ValueError, OverflowError) as exc:
            raise TerrainCoverageError('Could not sample the requested LOLA terrain profile.') from exc

    def elevation_m(self, latitude, longitude):
        return float(self._elevations([latitude], [longitude])[0])

    def profile(self, site, azimuth_deg, mast_height_m=0):
        if not math.isfinite(mast_height_m) or mast_height_m < 0:
            raise ValueError('Mast height must be finite and non-negative.')
        distances = np.arange(self.step_m, self.max_distance_m, self.step_m)
        distances = np.append(distances, self.max_distance_m)
        longitudes, latitudes, _ = self.geod.fwd(
            np.full(len(distances), site.longitude), np.full(len(distances), site.latitude),
            np.full(len(distances), azimuth_deg), distances,
        )
        ground = self.elevation_m(site.latitude, site.longitude)
        elevations = self._elevations(latitudes, longitudes)
        angle = distances / MOON_RADIUS_M
        # Exact spherical geometry, not a flat-Earth height/distance approximation.
        vertical = (MOON_RADIUS_M + elevations) * np.cos(angle) - (MOON_RADIUS_M + ground + mast_height_m)
        horizontal = (MOON_RADIUS_M + elevations) * np.sin(angle)
        angles = np.degrees(np.arctan2(vertical, horizontal))
        return [
            {'distance_m': float(d), 'elevation_m': float(z), 'elevation_angle_deg': float(a)}
            for d, z, a in zip(distances, elevations, angles)
        ]

    def horizon_deg(self, site, azimuth_deg, mast_height_m=0):
        if not math.isfinite(mast_height_m) or mast_height_m < 0:
            raise ValueError('Mast height must be finite and non-negative.')
        key = (site.latitude, site.longitude, azimuth_deg, mast_height_m)
        if key not in self._horizons:
            ground = self.elevation_m(site.latitude, site.longitude)
            radius = MOON_RADIUS_M + ground
            if radius <= 0:
                raise TerrainCoverageError('Invalid lunar surface radius in LOLA data.')
            # Smooth local sphere supplies the limb between/beyond sampled points.
            limb = -math.degrees(math.acos(radius / (radius + mast_height_m)))
            self._horizons[key] = max(limb, max(
                row['elevation_angle_deg'] for row in self.profile(site, azimuth_deg, mast_height_m)
            ))
        return self._horizons[key]
