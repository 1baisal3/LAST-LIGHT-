from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from datasets.integrity import DatasetIntegrityError, register_dataset


class Command(BaseCommand):
    help = 'Register an immutable local dataset and generate its SHA-256 baseline.'

    def add_arguments(self, parser):
        parser.add_argument('path')
        parser.add_argument('--kind', choices=['topography', 'ephemeris'], default='topography')
        parser.add_argument('--sha256', help='Optional trusted checksum from the dataset publisher.')

    def handle(self, *args, **options):
        try:
            digest = register_dataset(
                options['path'], settings.DATASET_MANIFEST_PATH,
                kind=options['kind'], expected_sha256=options['sha256'],
            )
        except DatasetIntegrityError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f'SHA-256: {digest}'))
