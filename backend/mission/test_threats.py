from datetime import date, datetime, timedelta, timezone
from unittest.mock import Mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from .data_sources import SyntheticTerrainProvider
from .orchestration import run_mission
from .providers import SkyGeometry
from .response_serializers import MissionResponseSerializer
from .services import simulate_mission
from .threats import DisasterScenario


class DisasterScenarioTests(SimpleTestCase):
    def setUp(self):
        self.threat = DisasterScenario.for_mission(True, date(2026, 11, 14))
        self.start = self.threat.event_start

    def test_disabled_scenario_leaves_nominal_operation_unchanged(self):
        scenario = DisasterScenario.for_mission(False, date(2026, 11, 14))
        effects = scenario.effects(self.start)
        self.assertFalse(effects['communications_blackout'])
        self.assertEqual(effects['panel_health_factor'], 1)
        self.assertEqual(effects['load_fraction'], 1)
        self.assertEqual(effects['systems_mode'], 'nominal')

    def test_damage_is_monotone_and_persists_after_event(self):
        self.assertEqual(self.threat.health_at(self.start - timedelta(seconds=1)), 1)
        self.assertEqual(self.threat.health_at(self.start), 0.5)
        self.assertAlmostEqual(self.threat.health_at(self.start + timedelta(hours=6)), 0.2)
        self.assertAlmostEqual(self.threat.health_at(self.start + timedelta(days=7)), 0.2)
        factors = [self.threat.health_at(self.start + timedelta(hours=hour)) for hour in range(7)]
        self.assertEqual(factors, sorted(factors, reverse=True))

    def test_blackout_has_exact_utc_boundaries_and_keeps_load_shedding_afterwards(self):
        self.assertFalse(self.threat.effects(self.start - timedelta(hours=1))['communications_blackout'])
        for hour in range(6):
            self.assertTrue(self.threat.effects(self.start + timedelta(hours=hour))['communications_blackout'])
        residual = self.threat.effects(self.start + timedelta(hours=6))
        self.assertFalse(residual['communications_blackout'])
        self.assertEqual(residual['phase'], 'residual')
        self.assertEqual(residual['load_fraction'], 0.4)

    def test_interval_average_preserves_integral_across_event_boundaries(self):
        start, end = self.start - timedelta(hours=1), self.start + timedelta(hours=7)
        mean = self.threat.average_health(start, end)
        hourly = [self.threat.average_health(start + timedelta(hours=h), start + timedelta(hours=h + 1)) for h in range(8)]
        self.assertAlmostEqual(mean, sum(hourly) / 8)
        self.assertEqual(hourly[0], 1)
        self.assertAlmostEqual(hourly[-1], 0.2)
        self.assertTrue(0.2 < hourly[1] < 0.5)

    def test_summary_never_claims_to_be_a_real_or_jpl_observed_event(self):
        timestamps = [self.start.replace(hour=0) + timedelta(hours=h) for h in range(24)]
        summary = self.threat.summary(timestamps)
        self.assertEqual(summary['source'], 'manual_simulation')
        self.assertFalse(summary['is_observed_event'])
        self.assertEqual(summary['communications_blackout_hours'], 6)
        self.assertEqual(summary['event_start'], '2026-11-14T06:00:00Z')
        self.assertEqual(summary['event_end'], '2026-11-14T12:00:00Z')
        self.assertEqual(summary['risk_multiplier'], 2)

    def test_invalid_scenario_parameters_are_rejected(self):
        for kwargs in (
            {'enabled': True}, {'enabled': True, 'event_start': datetime(2026, 1, 1)},
            {'duration_hours': 0}, {'critical_load_fraction': 0},
            {'residual_panel_factor': 0.9},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                DisasterScenario(**kwargs)


@override_settings(MISSION_DATA_MODE='synthetic-v1', FIX_PLAN_MAX_CANDIDATES=11, FIX_PLAN_TIME_BUDGET_S=20)
class ThreatPhysicsTests(SimpleTestCase):
    def setUp(self):
        self.ephemeris = Mock()
        self.ephemeris.geometries.return_value = [SkyGeometry(
            sun_elevation_deg=30, sun_azimuth_deg=120,
            earth_elevation_deg=20, earth_azimuth_deg=45,
        )] * 24
        self.terrain = SyntheticTerrainProvider()
        self.arguments = dict(latitude=0, longitude=0, date=date(2026, 11, 14),
                              ephemeris=self.ephemeris, terrain=self.terrain)

    def test_panel_damage_load_shedding_and_thermal_balance_are_integrated(self):
        nominal = simulate_mission(**self.arguments)
        emergency = simulate_mission(**self.arguments, disaster_mode=True)
        for hour in range(6):
            self.assertAlmostEqual(emergency['hourly_data'][hour]['panel_power_w'], nominal['hourly_data'][hour]['panel_power_w'])
            self.assertEqual(emergency['hourly_data'][hour]['effective_power_load_w'], 50)
        for hour in range(6, 24):
            row, baseline = emergency['hourly_data'][hour], nominal['hourly_data'][hour]
            self.assertLess(row['panel_power_w'], baseline['panel_power_w'])
            self.assertEqual(row['effective_power_load_w'], 20)
            self.assertEqual(row['effective_internal_heat_w'], 4)
            self.assertLess(row['temperature_c'], baseline['temperature_c'])
            self.assertEqual(row['systems_mode'], 'critical_only')
            self.assertEqual(row['panel_dust_transmission'], baseline['panel_dust_transmission'])
        previous_charge = 1000
        for row in emergency['hourly_data']:
            self.assertAlmostEqual(previous_charge + row['energy_balance_wh'] + row['unserved_energy_wh'],
                                   row['battery_charge_wh'] + row['spilled_energy_wh'])
            self.assertAlmostEqual(row['energy_balance_wh'], row['panel_power_w'] - row['effective_power_load_w'])
            previous_charge = row['battery_charge_wh']

    def test_earth_los_and_communications_are_distinct_during_blackout(self):
        rows = simulate_mission(**self.arguments, disaster_mode=True)['hourly_data']
        for hour, row in enumerate(rows):
            self.assertTrue(row['earth_visible'])
            self.assertEqual(row['communications_blackout'], 6 <= hour < 12)
            self.assertEqual(row['communications_available'], not (6 <= hour < 12))

    def test_forced_fix_plan_keeps_damage_and_event_anchor_for_later_windows(self):
        result = run_mission(**self.arguments, disaster_mode=True, auto_resolve=False)
        self.assertFalse(result['risk']['is_safe'])
        self.assertIn('communications_blackout', result['risk']['reasons'])
        self.assertEqual(result['risk']['communications_blackout_hours'], 6)
        self.assertEqual(result['risk']['critical_charge_percent'], 10)
        self.assertEqual(result['risk']['risk_multiplier'], 2)
        plan = result['fix_plan']
        self.assertTrue(plan['forced'])
        self.assertEqual(plan['trigger'], 'disaster_mode')
        self.assertEqual(plan['status'], 'found')
        self.assertEqual(plan['recommendation']['type'], 'alternative_window')
        self.assertEqual(plan['recommendation']['date'], '2026-11-15')
        self.assertEqual(plan['recommendation']['risk']['communications_blackout_hours'], 0)
        self.assertEqual(plan['evaluated_candidates'], 9)
        self.assertTrue(all(attempt['status'] == 'unsafe' for attempt in plan['attempts'][:8]))
        anchored = DisasterScenario.for_mission(True, self.arguments['date'])
        later = simulate_mission(**{**self.arguments, 'date': date(2026, 11, 15)}, threat=anchored)
        self.assertEqual(later['threat_status']['status'], 'residual_damage')
        self.assertEqual(later['threat_status']['event_start'], '2026-11-14T06:00:00Z')
        for row in later['hourly_data']:
            self.assertAlmostEqual(row['panel_health_factor'], 0.2)
            self.assertEqual(row['effective_power_load_w'], 20)

    @override_settings(FIX_PLAN_MAX_CANDIDATES=2)
    def test_disaster_does_not_bypass_recovery_search_limits(self):
        result = run_mission(**self.arguments, disaster_mode=True, auto_resolve=False)
        self.assertEqual(result['fix_plan']['status'], 'budget_exhausted')
        self.assertEqual(result['fix_plan']['evaluated_candidates'], 2)
        self.assertIsNone(result['fix_plan']['recommendation'])

    def test_risk_policy_increases_requested_reserve_and_cannot_be_relaxed(self):
        result = run_mission(**self.arguments, disaster_mode=True,
                             critical_charge_percent=25, minimum_survival_percent=0)
        self.assertEqual(result['risk']['critical_charge_percent'], 50)
        self.assertEqual(result['risk']['minimum_survival_percent'], 100)

    def test_disabled_mode_keeps_default_risk_and_no_forced_search(self):
        result = run_mission(**self.arguments, disaster_mode=False, auto_resolve=False)
        self.assertEqual(result['risk']['risk_multiplier'], 1)
        self.assertEqual(result['risk']['critical_charge_percent'], 5)
        self.assertEqual(result['fix_plan']['status'], 'not_needed')
        self.assertFalse(result['fix_plan']['forced'])
        self.assertFalse(result['threat_status']['enabled'])


@override_settings(MISSION_DATA_MODE='synthetic-v1', MISSION_THROTTLE_ENABLED=False, FIX_PLAN_MAX_CANDIDATES=2)
class ThreatAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username='threat-test', email='threat@example.com')

    def setUp(self):
        self.client.force_authenticate(self.user)
        self.payload = {'latitude': 0, 'longitude': 0, 'date': '2026-11-14', 'auto_resolve': False}

    def post(self, patch=None, name='mission-simulation'):
        return self.client.post(reverse(name), {**self.payload, **(patch or {})}, format='json')

    def test_disaster_mode_returns_a_validated_detailed_threat_status(self):
        response = self.post({'disaster_mode': True})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body['threat_status']['enabled'])
        self.assertEqual(body['threat_status']['scenario'], 'solar-storm-v1')
        self.assertFalse(body['threat_status']['is_observed_event'])
        self.assertTrue(body['fix_plan']['forced'])
        self.assertNotEqual(body['fix_plan']['status'], 'disabled')
        contract = MissionResponseSerializer(data=body)
        self.assertTrue(contract.is_valid(), contract.errors)

    def test_worst_case_override_is_a_valid_alias(self):
        self.assertEqual(self.post({'worst_case_override': True}).json(), self.post({'disaster_mode': True}).json())
        self.assertEqual(self.post({'worst_case_override': False}).json(), self.post({'disaster_mode': False}).json())

    def test_conflicting_aliases_and_invalid_booleans_are_rejected(self):
        for patch in (
            {'disaster_mode': True, 'worst_case_override': False},
            {'disaster_mode': False, 'worst_case_override': True},
            {'disaster_mode': 'solar-storm'}, {'worst_case_override': None},
        ):
            with self.subTest(patch=patch):
                self.assertEqual(self.post(patch).status_code, 400)

    def test_fix_plan_endpoint_exposes_the_same_threat_policy(self):
        response = self.post({'disaster_mode': True}, name='mission-fix-plan')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['threat_status']['enabled'])
        self.assertEqual(response.data['fix_plan']['trigger'], 'disaster_mode')
        self.assertEqual(response.data['risk']['risk_multiplier'], 2)

    def test_nominal_response_still_has_an_explicit_disabled_threat_status(self):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['threat_status']['status'], 'disabled')
        self.assertIsNone(response.data['threat_status']['event_start'])
        self.assertEqual(response.data['threat_status']['disabled_systems'], [])

    @override_settings(MISSION_THROTTLE_ENABLED=True, MISSION_THROTTLE_RATE='1/min')
    def test_emergency_search_does_not_bypass_account_throttle(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.assertEqual(self.post({'disaster_mode': True}).status_code, 200)
        response = self.post({'disaster_mode': True})
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response)
