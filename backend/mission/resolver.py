"""Bounded replanning of a failed simulation, without inventing a safe result."""

import time
from datetime import date, timedelta

from django.conf import settings
from pyproj import Geod

from .errors import HorizonsError, TerrainCoverageError
from .terrain import MOON_RADIUS_M


def assess_risk(result, critical_charge_percent=5, minimum_survival_percent=100):
    """Survival score is a fraction of safe simulated hours, not a probability."""
    parameters = result['model']['parameters']
    capacity = parameters['battery_capacity_wh']
    charge_levels = [parameters['initial_charge_percent']]
    safe_hours, unserved, thermal_violations, blackout_hours = 0, 0.0, 0, 0
    for row in result['hourly_data']:
        charge = 100 * row['battery_charge_wh'] / capacity
        charge_levels.append(charge)
        unserved += row['unserved_energy_wh']
        thermal_violations += not row['temperature_within_limits']
        blackout_hours += row.get('communications_blackout', False)
        safe_hours += (
            row['temperature_within_limits'] and row['unserved_energy_wh'] <= 1e-9
            and charge > critical_charge_percent
            and not row.get('communications_blackout', False)
        )
    survival_percent = 100 * safe_hours / len(result['hourly_data'])
    minimum_charge = min(charge_levels)
    reasons = []
    if minimum_charge <= critical_charge_percent:
        reasons.append('critical_battery')
    if unserved > 1e-9:
        reasons.append('unserved_energy')
    if thermal_violations:
        reasons.append('thermal_limit')
    if blackout_hours:
        reasons.append('communications_blackout')
    if survival_percent < minimum_survival_percent:
        reasons.append('insufficient_safe_hours')
    return {
        'is_safe': not reasons, 'reasons': reasons,
        'minimum_charge_percent': minimum_charge,
        'survival_percent': survival_percent,
        'survival_definition': 'Percentage of simulated hours with adequate energy, temperature and no injected blackout; not a probability.',
        'unserved_energy_wh': unserved, 'thermal_violation_hours': thermal_violations,
        'critical_charge_percent': critical_charge_percent,
        'minimum_survival_percent': minimum_survival_percent,
        'communications_blackout_hours': blackout_hours,
        'risk_multiplier': result.get('threat_status', {}).get('risk_multiplier', 1.0),
    }


def recovery_candidates(latitude, longitude, start_date, duration_hours=24):
    geod = Geod(a=MOON_RADIUS_M, b=MOON_RADIUS_M)
    for distance in (500, 1000):
        for azimuth in (0, 90, 180, 270):
            lon, lat, _ = geod.fwd(longitude, latitude, azimuth, distance)
            yield {
                'type': 'safe_haven', 'latitude': lat, 'longitude': lon,
                'date': start_date.isoformat(), 'distance_m': float(distance),
                'delay_days': 0,
            }
    for delay in (1, 3, 7):
        candidate_date = start_date + timedelta(days=delay)
        if (candidate_date + timedelta(hours=duration_hours - 1)).year <= 2100:
            yield {
                'type': 'alternative_window', 'latitude': latitude, 'longitude': longitude,
                'date': candidate_date.isoformat(), 'distance_m': 0.0, 'delay_days': delay,
            }


def find_fix_plan(*, result, evaluate, critical_charge_percent=5,
                  minimum_survival_percent=100, enabled=True, force_search=False, clock=time.monotonic):
    enabled = enabled or force_search
    risk = assess_risk(result, critical_charge_percent, minimum_survival_percent)
    plan = {
        'status': 'not_needed' if risk['is_safe'] else 'disabled',
        'recommendation': None, 'attempts': [], 'evaluated_candidates': 0,
        'search_complete': risk['is_safe'],
        'scope': f"Prelaunch replanning of a {len(result['hourly_data'])}-hour simulation; transit and waiting survival are not calculated.",
        'forced': force_search,
        'trigger': 'disaster_mode' if force_search else 'none' if risk['is_safe'] else 'unsafe_scenario',
    }
    if (risk['is_safe'] and not force_search) or not enabled:
        return risk, plan
    deadline = clock() + settings.FIX_PLAN_TIME_BUDGET_S
    plan['status'] = 'not_found'
    plan['search_complete'] = False
    candidates = list(recovery_candidates(
        result['latitude'], result['longitude'], date.fromisoformat(result['date']),
        duration_hours=len(result['hourly_data']),
    ))
    for index, candidate in enumerate(candidates):
        if index >= settings.FIX_PLAN_MAX_CANDIDATES or clock() >= deadline:
            plan['status'] = 'budget_exhausted'
            break
        try:
            alternative = evaluate(candidate, max(0.1, deadline - clock()))
            candidate_risk = assess_risk(alternative, critical_charge_percent, minimum_survival_percent)
        except (TerrainCoverageError, HorizonsError) as exc:
            plan['attempts'].append({**candidate, 'status': 'unavailable', 'reason': type(exc).__name__})
            continue
        plan['evaluated_candidates'] += 1
        plan['attempts'].append({**candidate, 'status': 'safe' if candidate_risk['is_safe'] else 'unsafe', 'risk': candidate_risk})
        if candidate_risk['is_safe']:
            plan['status'] = 'found'
            plan['search_complete'] = True
            plan['recommendation'] = {**candidate, 'risk': candidate_risk}
            break
    else:
        plan['search_complete'] = True
        if any(attempt['status'] == 'unavailable' for attempt in plan['attempts']):
            plan['status'] = 'incomplete'
            plan['search_complete'] = False
    return risk, plan
