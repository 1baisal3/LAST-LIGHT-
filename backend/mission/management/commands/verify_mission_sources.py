"""Opt-in integration check against a registered real DEM and live JPL."""

import json
import math
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.test.utils import override_settings

from mission.orchestration import run_mission
from mission.response_serializers import MissionResponseSerializer
from mission.serializers import MissionSimulationSerializer


class Command(BaseCommand):
    help = 'Verify real LOLA/JPL integration; requires a registered LOLA_DEM_PATH and network access.'

    def add_arguments(self, parser):
        parser.add_argument('--latitude', type=float, required=True)
        parser.add_argument('--longitude', type=float, required=True)
        parser.add_argument('--date', required=True)
        parser.add_argument('--duration-hours', type=int, default=168)
        parser.add_argument('--terrain-source', default='')
        parser.add_argument('--report', type=Path)

    def handle(self, *args, **options):
        if not settings.LOLA_DEM_PATH:
            raise CommandError('Configure and register LOLA_DEM_PATH before running this check.')
        request = MissionSimulationSerializer(data={
            'latitude': options['latitude'], 'longitude': options['longitude'],
            'date': options['date'], 'duration_hours': options['duration_hours'],
            'auto_resolve': False,
        })
        if not request.is_valid():
            raise CommandError(str(request.errors))
        try:
            with override_settings(MISSION_DATA_MODE='external'):
                result = run_mission(**request.validated_data)
            contract = MissionResponseSerializer(data=result)
            contract.is_valid(raise_exception=True)
            model = result['model']
            if result['is_placeholder'] or model['data_mode'] != 'external' or not model['terrain_sha256'] or len(model['ephemeris_sha256']) != 2:
                raise ValueError('Expected verified real topography and both JPL response hashes.')
            parameters = model['parameters']
            charge = parameters['battery_capacity_wh'] * parameters['initial_charge_percent'] / 100
            for row in result['hourly_data']:
                expected = min(parameters['battery_capacity_wh'], max(0, charge + row['energy_balance_wh']))
                if not math.isclose(row['battery_charge_wh'], expected, rel_tol=1e-9, abs_tol=1e-6):
                    raise ValueError('Battery state is discontinuous.')
                charge = row['battery_charge_wh']
        except Exception as error:
            raise CommandError(f'External integration check failed: {error}') from error
        report = {
            'status': 'passed', 'checked_at_utc': datetime.now(timezone.utc).isoformat(),
            'scope': 'Live external-source integration and response consistency, not calibrated scientific accuracy.',
            'request': {**request.data, 'date': result['date']},
            'terrain_source': options['terrain_source'],
            'terrain_sha256': model['terrain_sha256'],
            'ephemeris_source': 'https://ssd.jpl.nasa.gov/api/horizons.api',
            'ephemeris_sha256': model['ephemeris_sha256'],
            'hourly_samples': len(result['hourly_data']),
            'first_timestamp': result['hourly_data'][0]['timestamp'],
            'last_timestamp': result['hourly_data'][-1]['timestamp'],
            'horizon_points': len(result['horizon_profile']),
            'horizon_range_deg': [min(point['elevation_deg'] for point in result['horizon_profile']), max(point['elevation_deg'] for point in result['horizon_profile'])],
            'is_placeholder': result['is_placeholder'],
            'checks': ['response_contract', 'continuous_utc_hours', 'battery_continuity', 'terrain_sha256', 'sun_and_earth_archives'],
        }
        content = json.dumps(report, indent=2, allow_nan=False) + '\n'
        if options['report']:
            options['report'].parent.mkdir(parents=True, exist_ok=True)
            options['report'].write_text(content)
        self.stdout.write(content)
