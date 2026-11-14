from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings

from .orchestration import run_mission


class ExternalSourceVerificationTests(SimpleTestCase):
    @override_settings(LOLA_DEM_PATH='')
    def test_requires_explicit_real_topography_configuration(self):
        with self.assertRaises(CommandError):
            call_command('verify_mission_sources', latitude=-89.5, longitude=32, date='2026-11-15')

    @override_settings(MISSION_DATA_MODE='synthetic-v1', LOLA_DEM_PATH='/configured/lola.tif')
    def test_synthetic_results_cannot_create_a_passing_external_report(self):
        synthetic = run_mission(latitude=-89.5, longitude=32, date=date(2026, 11, 15), auto_resolve=False)
        with TemporaryDirectory() as directory:
            report = Path(directory) / 'report.json'
            with patch('mission.management.commands.verify_mission_sources.run_mission', return_value=synthetic):
                with self.assertRaises(CommandError):
                    call_command('verify_mission_sources', latitude=-89.5, longitude=32,
                                 date='2026-11-15', duration_hours=24, report=report)
            self.assertFalse(report.exists())
