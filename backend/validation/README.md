# External-source integration evidence

`external-smoke.json` records an actual 168-hour run using live Sun and Earth
observer tables from JPL Horizons and real LOLA elevation pixels. No mocked or
synthetic providers were used. The command validates the response contract,
continuous hourly UTC timestamps, battery continuity and source SHA-256 hashes.

The terrain sample was cropped from NASA GSFC PGDA's
[LDEM_80S_80MPP_ADJ.TIF](https://pgda.gsfc.nasa.gov/products/90), an 80 m/pixel
south-polar elevation COG with metre heights and a 1737400 m reference sphere.
The crop is 325 × 325 pixels, around latitude -89.5°, longitude 32°: transform
that site to the raster's polar stereographic CRS, request a window extending
13000 m in each direction, and round its offsets and lengths to integer pixels.
Read the original pixel values, retaining its CRS, transform, scale and offset.
The local cropped file and downloaded response archives are excluded from Git;
their hashes are recorded in the report. The report contains no local paths.

To repeat the check with this crop or another compatible local DEM:

```sh
export LOLA_DEM_PATH=/absolute/path/to/lola-window.tif
venv/bin/python manage.py register_dataset "$LOLA_DEM_PATH"
venv/bin/python manage.py verify_mission_sources \
  --latitude -89.5 --longitude 32 --date 2026-11-15 --duration-hours 168 \
  --terrain-source https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF \
  --report /tmp/external-smoke.json
```

This verifies that the real data pipeline runs and produces a consistent
response. It does **not** establish calibrated physical accuracy, validate
terrain reference-frame agreement with Horizons, or certify landing safety.
Those require independent reference observations and mission-specific models.
