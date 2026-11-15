import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from releases.contract import ReleaseContractError, validate_release
from releases.models import DataRelease

DEMO_DIR = Path(__file__).resolve().parents[2] / 'fixtures' / 'demo'


class Command(BaseCommand):
    help = 'Validate sites.json, provenance.json and validation.json and store them as a data release.'

    def add_arguments(self, parser):
        parser.add_argument('directory', nargs='?', help='Folder with the three release files.')
        parser.add_argument('--demo', action='store_true', help='Load the bundled demo release.')
        parser.add_argument('--replace', action='store_true', help='Overwrite a release with the same datasetId.')

    def handle(self, *args, **options):
        if options['demo'] == bool(options['directory']):
            raise CommandError('Pass either a directory or --demo.')
        directory = DEMO_DIR if options['demo'] else Path(options['directory'])
        files = {}
        for name in ('sites', 'provenance', 'validation'):
            path = directory / f'{name}.json'
            try:
                files[name] = json.loads(path.read_text(encoding='utf-8'))
            except OSError as exc:
                raise CommandError(f'Cannot read {path}.') from exc
            except json.JSONDecodeError as exc:
                raise CommandError(f'{path} is not valid JSON: {exc}') from exc
        try:
            dataset = validate_release(files['sites'], files['provenance'], files['validation'])
        except ReleaseContractError as exc:
            raise CommandError('Release rejected:\n' + '\n'.join(exc.issues[:50])) from exc

        existing = DataRelease.objects.filter(dataset_id=dataset['datasetId']).first()
        if existing and not options['replace']:
            raise CommandError(f'Release {dataset["datasetId"]} already exists; use --replace to overwrite it.')
        release = existing or DataRelease(dataset_id=dataset['datasetId'])
        release.mode = dataset['mode']
        release.sites = dataset['sites']
        release.provenance = dataset['provenance']
        release.validation = dataset['validation']
        release.save()
        self.stdout.write(self.style.SUCCESS(f'Loaded {release.dataset_id} ({release.mode}).'))
