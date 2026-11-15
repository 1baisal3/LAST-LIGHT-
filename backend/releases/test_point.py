import json
from datetime import datetime, timedelta

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from mission.errors import HorizonsError
from mission.providers import SkyGeometry

from .contract import validate_release
from .management.commands.load_release import DEMO_DIR
from .models import DataRelease
from .point_site import build_point_site


def demo_release():
    files = {name: json.loads((DEMO_DIR / f'{name}.json').read_text(encoding='utf-8')) for name in ('sites', 'provenance', 'validation')}
    return DataRelease.objects.create(
        dataset_id=files['provenance']['datasetId'], mode='demo', sites=files['sites'],
        provenance=files['provenance'], validation=files['validation'],
    )


class FlatTerrain:
    def __init__(self, raise_with_mast=False):
        self.raise_with_mast = raise_with_mast

    def elevation_m(self, latitude, longitude):
        return 100.0

    def horizon_deg(self, site, azimuth_deg, mast_height_m):
        base = 3.0 if 170 <= azimuth_deg <= 190 else 0.5
        return base + (0.5 if self.raise_with_mast and mast_height_m > 2 else -0.1 * mast_height_m)


class FixedSky:
    def __init__(self, missing_at=None):
        self.missing_at = missing_at

    def geometries(self, site, timestamps):
        out = []
        for index, _ in enumerate(timestamps):
            if index == self.missing_at:
                out.append(SkyGeometry())
            else:
                out.append(SkyGeometry(sun_elevation_deg=4.0, sun_azimuth_deg=(15 * index) % 360, earth_elevation_deg=6.0, earth_azimuth_deg=359.9999999))
        return out


class BuildPointSiteTests(TestCase):
    def setUp(self):
        self.release = demo_release()

    def test_site_follows_the_release_window_and_contract(self):
        answer = build_point_site(self.release, -89.5, 45.0, terrain=FlatTerrain(), ephemeris=FixedSky())
        site = answer['site']
        window = self.release.sites['window']
        self.assertEqual(len(site['hours']), window['count'])
        start = datetime.fromisoformat(window['start'].replace('Z', '+00:00'))
        self.assertEqual(site['hours'][5]['t'], (start + timedelta(hours=5)).strftime('%Y-%m-%dT%H:%M:%SZ'))
        self.assertEqual(len(site['horizon']), 36)
        self.assertEqual(site['horizon'][18], 2.8)
        self.assertEqual(site['id'], 'point')
        self.assertEqual(site['hours'][0]['earthAz'], 0.0)
        sites = dict(self.release.sites, sites=[site])
        validate_release(sites, self.release.provenance, self.release.validation)

    def test_taller_masts_never_raise_the_horizon(self):
        site = build_point_site(self.release, -89.5, 45.0, terrain=FlatTerrain(), ephemeris=FixedSky())['site']
        two, five, ten = site['horizon'], site['horizonByMast']['5'], site['horizonByMast']['10']
        self.assertTrue(all(b <= a for a, b in zip(two, five)))
        self.assertTrue(all(c <= b for b, c in zip(five, ten)))

    def test_mast_profiles_that_raise_the_horizon_are_dropped(self):
        site = build_point_site(self.release, -89.5, 45.0, terrain=FlatTerrain(raise_with_mast=True), ephemeris=FixedSky())['site']
        self.assertNotIn('horizonByMast', site)

    def test_missing_geometry_is_an_error_not_a_guess(self):
        with self.assertRaises(HorizonsError):
            build_point_site(self.release, -89.5, 45.0, terrain=FlatTerrain(), ephemeris=FixedSky(missing_at=7))

    def test_synthetic_mode_without_configured_data(self):
        answer = build_point_site(self.release, -89.5, 45.0)
        self.assertEqual(answer['dataMode'], 'synthetic-v1')
        self.assertEqual(len(answer['site']['hours']), self.release.sites['window']['count'])


class PointSiteAPITests(APITestCase):
    def setUp(self):
        self.release = demo_release()

    def url(self, dataset_id='fixture-mini-2x200'):
        return reverse('dataset-point', args=[dataset_id])

    def test_returns_a_site_without_login(self):
        response = self.client.get(self.url(), {'lat': '-89.5', 'lon': '45'}, HTTP_AUTHORIZATION='Bearer expired')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(set(body), {'site', 'dataMode'})
        self.assertEqual(body['site']['lat'], -89.5)

    def test_rejects_bad_coordinates(self):
        response = self.client.get(self.url(), {'lat': '-95', 'lon': 'east'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json()), {'lat', 'lon'})
        self.assertEqual(self.client.get(self.url(), {'lat': 'nan', 'lon': '0'}).status_code, 400)

    def test_unknown_release_is_404(self):
        self.assertEqual(self.client.get(self.url('nope'), {'lat': '0', 'lon': '0'}).status_code, 404)
