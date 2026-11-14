from contextlib import ExitStack
from datetime import date as calendar_date

from django.conf import settings

from .horizons import JPLHorizonsProvider
from .resolver import find_fix_plan
from .services import simulate_mission
from .terrain import LOLATerrainProvider
from .data_sources import SyntheticEphemerisProvider, SyntheticTerrainProvider, resolve_data_mode
from .threats import DisasterScenario


def run_mission(*, latitude, longitude, date, auto_resolve=True,
                critical_charge_percent=5, minimum_survival_percent=100,
                terrain=None, ephemeris=None, disaster_mode=False, **parameters):
    threat = DisasterScenario.for_mission(disaster_mode, date)
    if disaster_mode:
        auto_resolve = True
        critical_charge_percent = max(10, min(90, critical_charge_percent * threat.risk_multiplier))
        minimum_survival_percent = 100
    with ExitStack() as stack:
        mode = resolve_data_mode()
        if terrain is None:
            if mode == 'synthetic-v1':
                terrain = SyntheticTerrainProvider()
            else:
                terrain = stack.enter_context(LOLATerrainProvider(
                    settings.LOLA_DEM_PATH, settings.LOLA_PROFILE_DISTANCE_M, settings.LOLA_PROFILE_STEP_M,
                ))
        if ephemeris is None and mode == 'synthetic-v1':
            ephemeris = SyntheticEphemerisProvider()
        base_ephemeris = ephemeris if ephemeris is not None else JPLHorizonsProvider(timeout_s=settings.HORIZONS_TIMEOUT_S)
        result = simulate_mission(
            latitude=latitude, longitude=longitude, date=date,
            terrain=terrain, ephemeris=base_ephemeris, threat=threat, **parameters,
        )

        def evaluate(candidate, remaining_s):
            search_ephemeris = ephemeris
            if search_ephemeris is None:
                # Two sequential target requests per candidate, bounded by the remaining budget.
                search_ephemeris = JPLHorizonsProvider(timeout_s=min(3, remaining_s / 2))
            return simulate_mission(
                latitude=candidate['latitude'], longitude=candidate['longitude'],
                date=calendar_date.fromisoformat(candidate['date']),
                terrain=terrain, ephemeris=search_ephemeris, threat=threat, **parameters,
            )

        result['risk'], result['fix_plan'] = find_fix_plan(
            result=result, evaluate=evaluate, critical_charge_percent=critical_charge_percent,
            minimum_survival_percent=minimum_survival_percent, enabled=auto_resolve,
            force_search=disaster_mode,
        )
        return result
