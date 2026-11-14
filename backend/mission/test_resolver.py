from copy import deepcopy
from datetime import date
from unittest.mock import Mock

from django.test import SimpleTestCase, override_settings
from pyproj import Geod

from datasets.integrity import DatasetIntegrityError
from .errors import TerrainCoverageError
from .resolver import assess_risk, find_fix_plan, recovery_candidates
from .terrain import MOON_RADIUS_M


def simulation_result(*, charge=800, unserved=0, thermal_ok=True):
    return {
        'latitude': -89.5, 'longitude': 179.9, 'date': '2026-11-14',
        'model': {'parameters': {'battery_capacity_wh': 1000, 'initial_charge_percent': 100}},
        'hourly_data': [{
            'battery_charge_wh': charge, 'unserved_energy_wh': unserved,
            'temperature_within_limits': thermal_ok,
        } for _ in range(24)],
    }


class RiskTests(SimpleTestCase):
    def test_safe_and_critical_energy_threshold_including_initial_state(self):
        result = simulation_result()
        self.assertTrue(assess_risk(result)['is_safe'])
        result['model']['parameters']['initial_charge_percent'] = 5
        risk = assess_risk(result)
        self.assertFalse(risk['is_safe'])
        self.assertIn('critical_battery', risk['reasons'])

    def test_survival_score_counts_safe_hours_without_claiming_probability(self):
        result = simulation_result()
        result['hourly_data'][0]['temperature_within_limits'] = False
        result['hourly_data'][1]['unserved_energy_wh'] = 1
        risk = assess_risk(result)
        self.assertAlmostEqual(risk['survival_percent'], 100 * 22 / 24)
        self.assertEqual(risk['thermal_violation_hours'], 1)
        self.assertEqual(risk['unserved_energy_wh'], 1)
        self.assertIn('thermal_limit', risk['reasons'])
        self.assertIn('unserved_energy', risk['reasons'])


@override_settings(FIX_PLAN_MAX_CANDIDATES=11, FIX_PLAN_TIME_BUDGET_S=20)
class FixPlanTests(SimpleTestCase):
    def setUp(self):
        self.failed = simulation_result(charge=0, unserved=50)

    def test_safe_or_disabled_scenarios_do_not_launch_search(self):
        evaluate = Mock()
        _, plan = find_fix_plan(result=simulation_result(), evaluate=evaluate)
        self.assertEqual(plan['status'], 'not_needed')
        _, plan = find_fix_plan(result=self.failed, evaluate=evaluate, enabled=False)
        self.assertEqual(plan['status'], 'disabled')
        self.assertFalse(plan['search_complete'])
        evaluate.assert_not_called()

    def test_forced_search_overrides_disabled_even_for_safe_base_metrics(self):
        evaluate = Mock(return_value=simulation_result())
        _, plan = find_fix_plan(result=simulation_result(), evaluate=evaluate, enabled=False, force_search=True)
        self.assertTrue(plan['forced'])
        self.assertEqual(plan['status'], 'found')
        self.assertEqual(evaluate.call_count, 1)

    def test_candidates_remain_within_1km_near_poles_and_antimeridian(self):
        geod = Geod(a=MOON_RADIUS_M, b=MOON_RADIUS_M)
        for latitude in (-90, -89.5, 0, 90):
            candidates = list(recovery_candidates(latitude, 179.9, date(2026, 11, 14)))
            self.assertEqual(len(candidates), 11)
            for candidate in candidates:
                _, _, distance = geod.inv(179.9, latitude, candidate['longitude'], candidate['latitude'])
                self.assertLessEqual(distance, 1000 + 1e-6)
                self.assertGreaterEqual(candidate['latitude'], -90)
                self.assertLessEqual(candidate['latitude'], 90)
            self.assertEqual([item['delay_days'] for item in candidates[-3:]], [1, 3, 7])

    def test_finds_safe_haven_and_stops_after_success(self):
        evaluate = Mock(side_effect=[deepcopy(self.failed), simulation_result()])
        _, plan = find_fix_plan(result=self.failed, evaluate=evaluate)
        self.assertEqual(plan['status'], 'found')
        self.assertEqual(plan['evaluated_candidates'], 2)
        self.assertEqual(plan['recommendation']['type'], 'safe_haven')
        self.assertTrue(plan['recommendation']['risk']['is_safe'])
        self.assertEqual(evaluate.call_count, 2)

    def test_finds_alternative_window_when_nearby_points_fail(self):
        evaluate = Mock(side_effect=[deepcopy(self.failed) for _ in range(8)] + [simulation_result()])
        _, plan = find_fix_plan(result=self.failed, evaluate=evaluate)
        self.assertEqual(plan['status'], 'found')
        self.assertEqual(plan['recommendation']['type'], 'alternative_window')
        self.assertEqual(plan['recommendation']['date'], '2026-11-15')

    def test_no_safe_solution_is_reported_as_not_found(self):
        evaluate = Mock(return_value=self.failed)
        _, plan = find_fix_plan(result=self.failed, evaluate=evaluate)
        self.assertEqual(plan['status'], 'not_found')
        self.assertTrue(plan['search_complete'])
        self.assertIsNone(plan['recommendation'])
        self.assertEqual(evaluate.call_count, 11)

    def test_missing_coverage_means_incomplete_search(self):
        evaluate = Mock(side_effect=TerrainCoverageError('No coverage'))
        _, plan = find_fix_plan(result=self.failed, evaluate=evaluate)
        self.assertEqual(plan['status'], 'incomplete')
        self.assertFalse(plan['search_complete'])
        self.assertEqual(plan['evaluated_candidates'], 0)
        self.assertTrue(all(attempt['status'] == 'unavailable' for attempt in plan['attempts']))

    def test_integrity_failures_abort_instead_of_being_treated_as_bad_candidates(self):
        with self.assertRaises(DatasetIntegrityError):
            find_fix_plan(result=self.failed, evaluate=Mock(side_effect=DatasetIntegrityError('Changed')))

    @override_settings(FIX_PLAN_MAX_CANDIDATES=2)
    def test_candidate_budget_is_enforced(self):
        evaluate = Mock(return_value=self.failed)
        _, plan = find_fix_plan(result=self.failed, evaluate=evaluate)
        self.assertEqual(plan['status'], 'budget_exhausted')
        self.assertEqual(evaluate.call_count, 2)

    def test_time_budget_prevents_starting_more_work(self):
        evaluate = Mock()
        _, plan = find_fix_plan(result=self.failed, evaluate=evaluate, clock=Mock(side_effect=[0, 21]))
        self.assertEqual(plan['status'], 'budget_exhausted')
        evaluate.assert_not_called()

    def test_last_supported_date_never_proposes_an_invalid_window(self):
        candidates = list(recovery_candidates(0, 0, date(2100, 12, 31)))
        self.assertEqual(len(candidates), 8)

    def test_last_supported_week_never_proposes_a_window_ending_in_2101(self):
        candidates = list(recovery_candidates(0, 0, date(2100, 12, 25), duration_hours=168))
        self.assertEqual(len(candidates), 8)
        self.assertTrue(all(candidate['delay_days'] == 0 for candidate in candidates))
