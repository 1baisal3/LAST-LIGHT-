import copy
import io
import json
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from .contract import ReleaseContractError, validate_release
from .management.commands.load_release import DEMO_DIR
from .models import DataRelease


def demo_files():
    return {name: json.loads((DEMO_DIR / f'{name}.json').read_text(encoding='utf-8')) for name in ('sites', 'provenance', 'validation')}


class ContractTests(TestCase):
    def setUp(self):
        self.files = demo_files()

    def broken(self, mutate):
        files = copy.deepcopy(self.files)
        mutate(files)
        with self.assertRaises(ReleaseContractError) as context:
            validate_release(files['sites'], files['provenance'], files['validation'])
        return context.exception.issues

    def test_bundled_demo_release_is_valid(self):
        dataset = validate_release(self.files['sites'], self.files['provenance'], self.files['validation'])
        self.assertEqual(dataset['datasetId'], 'fixture-mini-2x200')
        self.assertEqual(dataset['mode'], 'demo')
        self.assertEqual(len(dataset['sites']['sites']), 2)

    def test_hour_count_must_match_the_window(self):
        issues = self.broken(lambda f: f['sites']['sites'][0]['hours'].pop())
        self.assertIn('sites.sites[0].hours: hours.length is 199, window.count is 200', issues)

    def test_hours_must_follow_the_window_start(self):
        def shift(f):
            f['sites']['sites'][1]['hours'][3]['t'] = f['sites']['sites'][1]['hours'][4]['t']
        self.assertIn('sites.sites[1].hours[3].t: must equal window.start + index hours', self.broken(shift))

    def test_azimuth_range_and_unknown_fields(self):
        def bad(f):
            f['sites']['sites'][0]['hours'][0]['sunAz'] = 360
            f['sites']['sites'][0]['extra'] = 1
        issues = self.broken(bad)
        self.assertIn('sites.sites[0].hours[0].sunAz: azimuth must be in [0, 360)', issues)
        self.assertIn('sites.sites[0].extra: unknown field', issues)

    def test_taller_mast_must_not_raise_the_horizon(self):
        def masts(f):
            site = f['sites']['sites'][1]
            site['horizonByMast'] = {'5': list(site['horizon']), '10': [v + (1 if i == 7 else 0) for i, v in enumerate(site['horizon'])]}
        self.assertIn('sites.sites[1].horizonByMast.10[7]: a taller mast must not raise the horizon', self.broken(masts))

    def test_ids_must_be_unique_and_match(self):
        def dup(f):
            f['sites']['sites'][1]['id'] = f['sites']['sites'][0]['id']
        self.assertTrue(any('is not unique' in issue for issue in self.broken(dup)))
        self.assertIn(
            'validation.datasetId: must equal provenance.datasetId',
            self.broken(lambda f: f['validation'].update(datasetId='other')),
        )

    def test_passed_check_needs_ran_at(self):
        def passed(f):
            f['validation']['checks'][0]['status'] = 'passed'
        self.assertIn('validation.checks[0].ranAt: a passed check must have ranAt', self.broken(passed))


class LoadReleaseTests(TestCase):
    def test_loads_the_demo_and_refuses_a_duplicate_without_replace(self):
        call_command('load_release', '--demo', stdout=io.StringIO())
        self.assertEqual(DataRelease.objects.get().dataset_id, 'fixture-mini-2x200')
        with self.assertRaisesMessage(CommandError, 'already exists'):
            call_command('load_release', '--demo')
        call_command('load_release', '--demo', '--replace', stdout=io.StringIO())
        self.assertEqual(DataRelease.objects.count(), 1)

    def test_rejects_an_invalid_directory_with_the_issues(self):
        files = demo_files()
        files['provenance']['mode'] = 'draft'
        with tempfile.TemporaryDirectory() as folder:
            for name, payload in files.items():
                Path(folder, f'{name}.json').write_text(json.dumps(payload), encoding='utf-8')
            with self.assertRaisesMessage(CommandError, 'provenance.mode: must be "demo" or "final"'):
                call_command('load_release', folder)
        self.assertFalse(DataRelease.objects.exists())

    def test_requires_exactly_one_source(self):
        with self.assertRaisesMessage(CommandError, 'either a directory or --demo'):
            call_command('load_release')


class ReleaseAPITests(APITestCase):
    def test_latest_is_404_before_any_release(self):
        self.assertEqual(self.client.get(reverse('dataset-latest')).status_code, 404)

    def test_latest_and_detail_return_the_frontend_contract_without_login(self):
        files = demo_files()
        DataRelease.objects.create(
            dataset_id='fixture-mini-2x200', mode='demo', sites=files['sites'],
            provenance=files['provenance'], validation=files['validation'],
        )
        response = self.client.get(reverse('dataset-latest'), HTTP_AUTHORIZATION='Bearer expired-token')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()), {'datasetId', 'mode', 'sites', 'provenance', 'validation'})
        self.assertEqual(response.json()['sites'], files['sites'])
        detail = self.client.get(reverse('dataset-detail', args=['fixture-mini-2x200']))
        self.assertEqual(detail.json()['datasetId'], 'fixture-mini-2x200')
        self.assertEqual(self.client.get(reverse('dataset-detail', args=['nope'])).status_code, 404)
