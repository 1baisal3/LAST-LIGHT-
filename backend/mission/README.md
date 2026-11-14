# Mission simulation API

`POST /api/mission/` requires `Authorization: Bearer <access>`.

```json
{
  "latitude": -89.5,
  "longitude": 32.0,
  "date": "2026-11-14",
  "duration_hours": 168,
  "battery_capacity_wh": 1000,
  "initial_charge_percent": 100,
  "mast_height_m": 2,
  "panel_area_m2": 2,
  "panel_efficiency": 0.22,
  "power_load_w": 50,
  "initial_temperature_c": 20,
  "initial_dust_g_m2": 0,
  "dust_deposition_g_m2_day": 0.05,
  "dust_extinction_m2_g": 0.5
}
```

Only latitude, longitude and date are required. Latitude is -90..90 degrees,
longitude -180..180 degrees, positive east, in the lunar mean Earth/polar frame.
Dates are `YYYY-MM-DD`, years 1900..2100. Set `duration_hours: 168` for a seven-day
mission; values from 1 to 168 are supported. Omitting it retains the 24-hour
default for existing clients. Each response contains exactly `duration_hours`
consecutive `hourly_data` samples starting at 00:00 UTC. Battery, thermal and dust
state continue across midnight. The full window must end before 2101. Each sample includes
`sun_azimuth_deg` and `earth_azimuth_deg` in degrees clockwise from north,
normalized to `[0, 360)`. Scenarios are
saved separately through `/api/scenarios/`.

The top-level `horizon_profile` contains exactly 36 ordered points:

```json
{"azimuth_deg": 0, "elevation_deg": 2.5}
```

This is an example of one point; the full array covers bearings 0, 10, ..., 350
degrees. Elevation is the horizon angle above the local horizontal, in degrees;
negative angles are valid for an elevated observer. The profile uses the same
site and mast height as the hourly visibility calculation. Hourly Sun/Earth
visibility is evaluated at their exact azimuths rather than by interpolating
the 10-degree display grid. In external mode, the DEM must cover the entire
360-degree profile; missing coverage or NoData returns 422.

`MissionResponseSerializer` validates the complete runtime response, including
all required fields, the requested sample count, consecutive UTC timestamps, both azimuths, finite numbers and the ordered
horizon grid. Invalid internal output returns 500 instead of a malformed 200.
The same serializers describe the Swagger response contract.

## Setup

```sh
venv/bin/python -m pip install -r requirements.txt
export LOLA_DEM_PATH=/absolute/path/to/normalized_lola_elevations.tif
venv/bin/python manage.py register_dataset "$LOLA_DEM_PATH"
venv/bin/python manage.py verify_datasets
venv/bin/python manage.py runserver
```

For an offline demo, use `MISSION_DATA_MODE=synthetic-v1` instead of configuring a
DEM. The default is `MISSION_DATA_MODE=auto`:

- With no `LOLA_DEM_PATH`, use `synthetic-v1`: deterministic circular demo
  Sun/Earth geometry and a featureless lunar sphere, with no network requests.
- With a configured DEM path, use `external`: the real rasterio/pyproj LOLA
  pipeline and JPL Horizons. Missing files, failed SHA-256 or unavailable JPL
  produce errors; they never trigger synthetic substitution.
- `MISSION_DATA_MODE=external` requires a registered DEM even if its path is
  empty. `MISSION_DATA_MODE=synthetic-v1` explicitly selects the offline demo.

`model.data_mode` identifies the actual providers as `synthetic-v1`, `external`
or `injected` (custom/testing providers). `is_placeholder` is true for the
synthetic demo and false for external data. `model.version=engineering-v1`
identifies the thermal/energy model independently of its data source.
Source selection is a server setting; API callers cannot choose dataset paths
or change source mode. Synthetic outputs are not ephemeris/terrain measurements.

A LOLA dataset is not bundled. Supply a local **single-band elevation GeoTIFF**,
with a lunar CRS on the **1737400 m sphere**, heights in **metres above that
sphere**, positive-east longitudes and sufficient coverage around the landing
site. Projected and geographic rasters are supported, including 0..360 longitude
rasters. Native TIFF band scale and offset are applied. Data without explicit
band units are assumed already normalized to metres. Radius rasters, kilometre
rasters, half-metre integer products without their scale/offset, Earth CRS, and
unreferenced visualization textures must be normalized before use; do not pass
them as elevation data. Verify the lunar body-fixed frame against Horizons.

Server settings:

- `LOLA_DEM_PATH`: environment variable specifying the local file. API clients
  cannot choose files or URLs.
- `LOLA_PROFILE_DISTANCE_M`: 10000 m, maximum 100000 m.
- `LOLA_PROFILE_STEP_M`: 100 m. Set according to raster resolution and acceptable
  horizon error; the sampling method uses nearest raster pixels.
- `HORIZONS_TIMEOUT_S`: 15 seconds per request. Calls are sequential. Successful
  tables are cached through Django's default cache for one hour. Cached references
  point to SHA-256-verified content-addressed archives, not unverified parsed data.

## Fix Plan and private history

`POST /api/mission/` now adds `risk` and `fix_plan` to the simulation response.
`POST /api/mission/fix-plan/` accepts the same input and returns just those two
objects. Both endpoints require JWT authentication. The dedicated endpoint forces
automatic search; the main endpoint accepts `auto_resolve: false` to disable it.

The default critical battery reserve is 5% (`critical_charge_percent`, configurable
from 0 to 50%). Reserve is checked at launch and after each simulated hour.
Any unserved load or temperature excursion also makes the scenario unsafe.
`survival_percent` is the fraction of hours with adequate reserve, supplied load,
valid temperature and no injected communications blackout, **not a survival probability**. Its additional reporting
threshold is `minimum_survival_percent` (default 100%). Hard energy and thermal
failures remain unsafe even when that threshold is lowered.

The resolver tests a discrete grid: four cardinal bearings at 500 m and 1000 m
using lunar great-circle distances, then the same point at +1, +3 and +7 days.
Each candidate uses the same hardware and initial state as the original request
and is fully resimulated for the same requested duration. The first candidate satisfying all safety
checks is returned as `safe_haven` or `alternative_window`, with coordinates,
date, distance and risk metrics. Requested dates never exceed the supported range.

Search stops after at most `FIX_PLAN_MAX_CANDIDATES=11` candidates. A soft
`FIX_PLAN_TIME_BUDGET_S=20` deadline prevents starting another candidate after the
budget; in-flight requests have their own capped timeout. Initial simulation
latency is outside that search budget. The search uses the already opened and
verified DEM. Missing terrain coverage and failed ephemerides are recorded as
unavailable attempts; integrity failures abort the whole request.

`fix_plan.status` is one of:

- `not_needed`: the original scenario passed the checks.
- `disabled`: the caller disabled search on an unsafe scenario.
- `found`: a candidate passed the simulation; `recommendation` includes its risk.
- `not_found`: all configured candidates failed; this does not rule out untested
  points or dates.
- `incomplete`: candidates could not be checked because source data were missing.
- `budget_exhausted`: time or candidate limit stopped the search.

No safe recommendation is fabricated when the search fails. This is **prelaunch
replanning**, with fresh initial battery/temperature at the candidate location or
date. Traversability, relocation energy and survival while waiting are not
calculated, so a recommendation does not authorize an in-flight evacuation.

`/api/runs/` is the canonical history route (GET/POST); `/api/runs/{id}/` supports
GET/DELETE. `/api/scenarios/` remains a compatible alias of the same records.
Only owned records are visible, owner assignment is server-side and pagination
is capped at 50 records. Calculating a mission does not save it automatically.

## Disaster & Threat Simulation / Worst-Case Mode

Enable the versioned `solar-storm-v1` stress scenario on either mission endpoint:

```json
{
  "latitude": -89.5,
  "longitude": 32,
  "date": "2026-11-14",
  "disaster_mode": true,
  "auto_resolve": false
}
```

`disaster_mode` defaults to false. `worst_case_override` is a Boolean alias;
explicitly conflicting values return 400. The example deliberately disables
normal auto-resolution: an enabled disaster still **forces** bounded Fix Plan.
It remains subject to the same account throttling and search budgets.

The preset is an **injected scenario**, independent of `model.data_mode`.
JPL Horizons still supplies geometry in external mode; the backend does not
infer a solar flare, impact, object trajectory collision or observed space-weather
event from those observer tables. `threat_status.source=manual_simulation` and
`is_observed_event=false` make this explicit. No meteorite detector or radiation
dose model is implemented by this preset.

The event is anchored at 06:00 UTC on the originally requested date and lasts
six hours. It has three effects:

- Communications are blacked out during intervals starting at 06:00..11:00.
  `earth_visible` continues to represent geometric terrain LOS;
  `communications_available` additionally requires no injected blackout.
- Electrical panel health drops to 50% at onset, then decays exponentially to
  20% by 12:00 UTC, remaining at 20% afterwards. The decay rate is
  `ln(0.5 / 0.2) / 6` per hour. Power uses the analytically integrated average
  health over each interval, multiplied by the existing dust transmission and
  temperature-adjusted efficiency. Regolith loading is not falsely increased
  to represent radiation damage.
- From onset onward, noncritical systems (`science_payload`, `auxiliary_lighting`,
  `noncritical_computing`) are disabled. Requested load and internal heat become
  40% of their original values. The thermal solver is rerun with this reduced
  heat input; net energy uses the reduced load. Neither battery charge nor
  temperature is artificially reset when the event starts.

The fixed coefficients are illustrative engineering stress-test assumptions,
not calibrated space-weather predictions. The scenario does not add an
unjustified bolometric solar heating spike or change terrain/ephemeris data.
Radiation damage to spacecraft panels is a real concern
([NASA overview](https://science.nasa.gov/sun/solar-storms-and-flares/)); that
source does **not** establish the preset's damage magnitude, duration or blackout
behavior for a lunar communication system.

Detailed `threat_status` is returned even when disabled, and includes event start
and end, window status, numerical panel-damage coefficients, final health,
critical-load fraction, disabled systems, blackout-hour count, risk multiplier,
forced-recovery flag and assumptions. Each hourly sample adds:

- `threat_phase`: `disabled`, `scheduled`, `active` or `residual`.
- `systems_mode`: `nominal` or `critical_only`.
- `communications_blackout` and `communications_available`.
- `panel_health_factor`: interval-average electrical health, separate from dust.
- `effective_power_load_w` and `effective_internal_heat_w`.

The disaster risk multiplier is 2.0. Effective critical battery reserve is
`max(10, min(90, requested_reserve * 2))` percent, and the required safe-hour
fraction becomes 100%. Any injected blackout marks the window unsafe, even with
geometric Earth LOS. `risk` reports the effective reserve, risk multiplier and
blackout hours. `fix_plan.forced=true` and `trigger=disaster_mode` report why
search was started.

Every recovery candidate uses the **same absolute event anchor**. Spatial moves
do not eliminate a global injected blackout. A later window can avoid the acute
blackout, but retains panel damage and critical-only operation; changing the date
does not reset the storm or repair equipment. Prelaunch battery/temperature
initialization follows the existing replanning assumptions. A recovery is only
recommended if the full candidate simulation passes the stricter criteria;
failure or exhausted budgets produce no fabricated safe haven.

## Immutable datasets and SHA-256

Register a trusted topography import once before its first simulation:

```sh
venv/bin/python manage.py register_dataset /absolute/path/to/lola.tif
# Prefer supplying the publisher's trusted digest when available:
venv/bin/python manage.py register_dataset /absolute/path/to/lola.tif --sha256 EXPECTED_HEX_DIGEST
venv/bin/python manage.py verify_datasets
```

Registration generates SHA-256 and records the canonical path, kind and byte size
in a manifest. Initial registration establishes trust in the imported bytes; a
locally calculated hash alone does not authenticate their publisher. Subsequent
verification never rewrites the baseline. Changed content at a registered path
is rejected; publish a new dataset version at a new path and register that version.
There is no HTTP endpoint for changing baselines. Protect the manifest alongside
the trusted data and optionally supply a trusted `--sha256` at import.

Every real `LOLATerrainProvider` opening streams the full file through SHA-256
before use. Horizon rays reuse that provider, so a recovery search does not hash
the raster for every candidate. Registration uses an exclusive lock and atomic
manifest replacement. Files changing during hashing are rejected.

Validated Horizons responses and their request parameters are automatically
archived as `<sha256>.json`. Cached entries hold only the archive hash. Reads
verify the content hash and original query; corrupt, missing or substituted
archives cause an explicit `503 dataset_integrity`, without silently replacing
the snapshot. `verify_datasets` checks registered files and all archived responses.
SHA-256 provides integrity against the trusted baseline, not a signed provenance
guarantee against an attacker able to replace both data and baselines.

Environment variables `DATASET_MANIFEST_PATH` and `EPHEMERIS_STORE_PATH` override
the default `data/datasets_manifest.json` and `data/ephemerides/` paths. Keep these
on persistent storage. `.gitignore` excludes large/private local data, SQLite,
the virtualenv and generated static files.

## OpenAPI, Swagger UI and ReDoc

- `/api/schema/`: public OpenAPI JSON.
- `/swagger/`: Swagger UI with JWT Bearer authentication.
- `/redoc/`: ReDoc.

The schema covers registration, token issue/refresh, simulation, Fix Plan and
both history routes, including nested hourly/risk/recovery structures, limits,
the full `horizon_profile`, hourly Sun/Earth azimuths, ownership and source errors.
Numerical bounds in request schemas are derived
from the actual serializers. Endpoints remain authenticated independently of
public documentation access.

The standard generator is `drf-spectacular[sidecar]`, declared in requirements.
When installed it uses the configured AutoSchema, annotations and local sidecar
UI assets. Validate its generated schema with:

```sh
venv/bin/python manage.py spectacular --file /tmp/last-light-schema.yaml --validate --fail-on-warn
```

The main URL configuration imports the three views directly from
`drf_spectacular.views`; `drf-spectacular` must be installed. The schema route is
named `schema`, and both documentation views use `url_name='schema'`. Without
the optional sidecar assets, Swagger/ReDoc use their CDN distributions and need
browser internet access. A serializer-based fallback schema builder remains for
contract checks; the public routes use drf-spectacular.

## Optional request limits

Enable the account-level DRF `MissionUserThrottle` with:

```sh
export MISSION_THROTTLE_ENABLED=true
export MISSION_THROTTLE_RATE=10/min
```

Throttling is disabled by default. When enabled, `/api/mission/` and
`/api/mission/fix-plan/` share one user-ID-based budget, preventing bypass through
the second endpoint. Excess requests return 429 with `Retry-After` before any
simulation or external data processing starts. Other users have independent
budgets, and documentation/history access is unaffected. A subclass can provide
future plan-specific policies without changing the simulation code.

This is a basic usage policy, not billing-grade accounting: Django's default
local cache is process-local and standard DRF throttling is not atomic. Use a
shared cache and an atomic quota ledger before enforcing paid entitlements across
multiple workers. See the [DRF throttling documentation](https://www.django-rest-framework.org/api-guide/throttling/).

## Calculation and output

`horizons.JPLHorizonsProvider` queries Sun target `10` and Earth-center target
`399`, observer `coord@301`, GEODETIC coordinates (altitude includes terrain and
mast, in km). Observer quantities `4,20` supply airless apparent azimuth/elevation
and range. Twenty-four Julian UTC epochs are sent in **two requests**, rather
than one request per hour. The CSV reader checks columns, epochs, ranges and
finite values; HTTP, JSON and Horizons application errors are handled explicitly.
Azimuth is clockwise from north. This is Horizons observer geometry, not a
constant-rate synthetic lunar day.

`terrain.LOLATerrainProvider` uses rasterio masks and pyproj lunar transformations
and great-circle rays. `profile(site, azimuth, mast_height_m)` returns distance,
elevation and angular height for every sample. The horizon is the maximum angular
height along the ray, including spherical curvature and a smooth local sphere
limb. `earth_visible` means the Earth's **center** is above this horizon; it does
not mean any specific terrestrial ground station has a radio link. The same
criterion supplies terrain shadowing for the Sun's center. Missing coverage or
NoData abort the calculation, rather than being interpreted as zero elevation.
The response includes `sun_horizon_deg` and `earth_horizon_deg` each hour.

`physics.py` implements a first-order engineering model:

- Horizontal-panel incident flux: `1361 / distance_au² * max(sin(elevation), 0)`
  W/m², set to zero when terrain hides the Sun's center.
- Dust transmission: `exp(-extinction_m2_g * loading_g_m2)`. Loading accumulates
  from the requested start date. Default deposition/extinction are **illustrative
  configurable coefficients**, not measurements or a universal regolith law.
- Electrical power: incident flux × panel area × temperature-adjusted efficiency
  × dust transmission. The assumed silicon temperature coefficient is -0.004/K
  relative to 25 C, with efficiency bounded to [0, 1]. Equipment temperature is
  used as a panel-temperature proxy.
- Thermal dynamics: `C dT/dt = alpha A F + Qinternal - epsilon sigma A(T⁴-Tenv⁴)`.
  This lumped body uses a prescribed effective radiative environment of -130 C,
  a 60-second implicit integration step and no conduction or active control.
  `temperature_c` is the end-of-hour equipment temperature. **-130..120 C is a
  reporting threshold**, not a clamp: `temperature_within_limits` flags excursions.
- Net hourly energy: generated power minus the requested load. Battery charging
  and discharging assume 100% efficiency, limited by [0, capacity]. Unserved load
  and curtailed generation are reported as `unserved_energy_wh` and
  `spilled_energy_wh`, preserving the energy accounting.

Hourly geometry is held constant across the following one-hour interval. Dust is
sampled at the interval midpoint and panel power uses the mean of initial/final
body temperatures. `energy_balance_wh`, `battery_charge_wh`, `temperature_c` and
other integrated values describe that interval or its end, while the angles are
at `timestamp`. The final interval ends at 00:00 UTC of the following day.

Additional thermal inputs and defaults are in `SimulationParameters` and echoed
in response `model.parameters`: heat capacity 20000 J/K, thermal area 1 m²,
absorptivity 0.85, emissivity 0.9 and internal heat 10 W. All API numeric inputs
are bounded and must be finite.

These are calculated engineering estimates, **not a validated mission safety
model**. Finite distance and sample spacing can miss distant peaks and subpixel
terrain. No eclipse or Earthshine model, extended solar/Earth disk, active thermal
control, panel orientation, RF budget, hardware calibration or certified thermal
limits are inferred. Horizons ephemeris accuracy alone does not establish the
accuracy of the terrain/thermal/energy model. Response `model.assumptions` carries
the key assumptions.

## Errors and testing

- `400`: invalid inputs; `401`: missing/invalid JWT.
- `429`: optional request quota exceeded; `Retry-After` specifies the wait.
- `422 terrain_coverage`: incomplete raster profile or NoData.
- `502 ephemeris_unavailable`: JPL HTTP/service/format error.
- `503 terrain_unavailable`: missing or incompatible DEM/configuration.
- `503 dataset_integrity`: unregistered/modified topography or invalid ephemeris archive.
- `504 ephemeris_timeout`: JPL timed out.

```sh
venv/bin/python manage.py test
```

Tests mock JPL HTTP responses and create real temporary GeoTIFFs; they do not
require internet or a production LOLA raster. They cover observer parsing and
request construction, lunar curvature, ridge occlusion, scale/offset, NoData,
thermal equilibrium, dust attenuation, flux geometry, battery bounds and API
validation/authentication, bounded recovery search, dataset corruption, history
isolation, disaster timing/damage/load/thermal behavior and the active documentation contract. Live Horizons/production DEM agreement needs separate
validation with the actual dataset and network access.

## Sources

- [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) and
  [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html): observer
  coordinates, positive-east lunar longitude, quantities and UTC epochs.
- [USGS lunar data standards](https://psdi.astrogeology.usgs.gov/moon/standards/data_standards/):
  lunar reference radius, height conventions and body-fixed frames.
- [rasterio sampling](https://rasterio.readthedocs.io/en/stable/api/rasterio.sample.html)
  and [pyproj Geod](https://pyproj4.github.io/pyproj/stable/api/geod.html).
- [NASA thermal engineering reference](https://ntrs.nasa.gov/api/citations/20200007746/downloads/20200007746.pdf):
  radiative heat balance. The simplified boundary conditions and dust coefficients
  in this project are modeling assumptions, not parameters validated by this source.
