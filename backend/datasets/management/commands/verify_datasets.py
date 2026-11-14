from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from pathlib import Path

from datasets.integrity import DatasetIntegrityError, EphemerisStore, _read_manifest, verify_dataset


class Command(BaseCommand):
    help = 'Verify every file against the registered immutable SHA-256 baselines.'

    def handle(self, *args, **options):
        try:
            entries = _read_manifest(Path(settings.DATASET_MANIFEST_PATH))['files']
            archives = list(Path(settings.EPHEMERIS_STORE_PATH).glob('*.json'))
            if not entries and not archives:
                raise DatasetIntegrityError('No immutable datasets have been registered.')
            for path, entry in entries.items():
                verify_dataset(path, settings.DATASET_MANIFEST_PATH, kind=entry['kind'])
            store = EphemerisStore(settings.EPHEMERIS_STORE_PATH)
            for archive in archives:
                store.load(archive.stem)
        except (DatasetIntegrityError, KeyError, TypeError) as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f'Verified {len(entries)} dataset(s) and {len(archives)} ephemeris archive(s).'))
