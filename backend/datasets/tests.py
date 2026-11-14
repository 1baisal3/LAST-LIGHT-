import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, override_settings

from .integrity import DatasetIntegrityError, EphemerisStore, register_dataset, sha256_file, verify_dataset


class IntegrityTests(SimpleTestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'topography.bin'
        self.path.write_bytes(b'lunar elevation fixture')
        self.manifest = Path(self.directory.name) / 'manifest.json'
        override = override_settings(EPHEMERIS_STORE_PATH=Path(self.directory.name) / 'ephemerides')
        override.enable()
        self.addCleanup(override.disable)

    def test_registration_generates_known_sha256_and_verification_is_repeatable(self):
        expected = hashlib.sha256(self.path.read_bytes()).hexdigest()
        self.assertEqual(register_dataset(self.path, self.manifest), expected)
        self.assertEqual(verify_dataset(self.path, self.manifest), expected)
        self.assertEqual(register_dataset(self.path, self.manifest), expected)

    def test_changed_dataset_is_rejected_without_updating_baseline(self):
        original = register_dataset(self.path, self.manifest)
        self.path.write_bytes(b'corrupted elevation fixture')
        with self.assertRaises(DatasetIntegrityError):
            verify_dataset(self.path, self.manifest)
        with self.assertRaises(DatasetIntegrityError):
            register_dataset(self.path, self.manifest)
        entry = json.loads(self.manifest.read_text())['files'][str(self.path.resolve())]
        self.assertEqual(entry['sha256'], original)

    def test_checksum_from_publisher_and_dataset_kind_are_enforced(self):
        with self.assertRaises(DatasetIntegrityError):
            register_dataset(self.path, self.manifest, expected_sha256='0' * 64)
        self.assertFalse(self.manifest.exists())
        register_dataset(self.path, self.manifest)
        with self.assertRaises(DatasetIntegrityError):
            verify_dataset(self.path, self.manifest, kind='ephemeris')

    def test_missing_files_missing_baselines_and_corrupt_manifest_fail_closed(self):
        with self.assertRaises(DatasetIntegrityError):
            verify_dataset(self.path, self.manifest)
        with self.assertRaises(DatasetIntegrityError):
            sha256_file(self.path.with_name('missing'))
        for invalid in ('not-json', '{}', '[]', '{"version": 99, "files": {}}'):
            self.manifest.write_text(invalid)
            with self.subTest(manifest=invalid), self.assertRaises(DatasetIntegrityError):
                verify_dataset(self.path, self.manifest)

    def test_parallel_registration_keeps_manifest_consistent(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            hashes = list(pool.map(lambda _: register_dataset(self.path, self.manifest), range(8)))
        self.assertEqual(len(set(hashes)), 1)
        self.assertEqual(verify_dataset(self.path, self.manifest), hashes[0])

    def test_management_commands_generate_and_verify_then_reject_corruption(self):
        with override_settings(DATASET_MANIFEST_PATH=self.manifest):
            output = io.StringIO()
            call_command('register_dataset', str(self.path), stdout=output)
            self.assertIn('SHA-256:', output.getvalue())
            call_command('verify_datasets', stdout=io.StringIO())
            self.path.write_bytes(b'changed')
            with self.assertRaises(CommandError):
                call_command('verify_datasets', stdout=io.StringIO())
            with self.assertRaises(CommandError):
                call_command('register_dataset', str(self.path), stdout=io.StringIO())

    def test_empty_manifest_is_not_reported_as_verified(self):
        with override_settings(DATASET_MANIFEST_PATH=self.manifest), self.assertRaises(CommandError):
            call_command('verify_datasets', stdout=io.StringIO())

    def test_verify_command_checks_automatically_archived_ephemerides(self):
        from django.conf import settings
        store = EphemerisStore(settings.EPHEMERIS_STORE_PATH)
        digest = store.save({'result': 'ephemeris'})
        with override_settings(DATASET_MANIFEST_PATH=self.manifest):
            call_command('verify_datasets', stdout=io.StringIO())
            (Path(settings.EPHEMERIS_STORE_PATH) / f'{digest}.json').write_text('corrupt')
            with self.assertRaises(CommandError):
                call_command('verify_datasets', stdout=io.StringIO())


class EphemerisStoreTests(SimpleTestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.store = EphemerisStore(self.directory.name)

    def test_content_addressed_roundtrip_is_deterministic(self):
        digest = self.store.save({'result': 'ephemeris', 'request': {'target': 10}})
        self.assertEqual(self.store.save({'request': {'target': 10}, 'result': 'ephemeris'}), digest)
        self.assertEqual(self.store.load(digest)['result'], 'ephemeris')
        self.assertEqual(len(list(Path(self.directory.name).glob('*.json'))), 1)

    def test_corrupt_archive_is_never_silently_replaced(self):
        payload = {'result': 'ephemeris'}
        digest = self.store.save(payload)
        path = Path(self.directory.name) / f'{digest}.json'
        path.write_text('{"result":"corrupted"}')
        with self.assertRaises(DatasetIntegrityError):
            self.store.load(digest)
        with self.assertRaises(DatasetIntegrityError):
            self.store.save(payload)
        self.assertIn('corrupted', path.read_text())

    def test_missing_archive_and_path_traversal_identifiers_are_rejected(self):
        for digest in ('0' * 64, '../topography', '', None):
            with self.subTest(digest=digest), self.assertRaises(DatasetIntegrityError):
                self.store.load(digest)
