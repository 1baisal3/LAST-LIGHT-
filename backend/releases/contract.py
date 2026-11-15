import math
import re
from datetime import datetime, timedelta, timezone

ISO_UTC = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$')
MODES = ('demo', 'final')
STATUSES = ('pending', 'passed', 'failed')


class ReleaseContractError(ValueError):
    def __init__(self, issues):
        self.issues = issues
        first = issues[0] if issues else 'unknown error'
        super().__init__(first if len(issues) <= 1 else f'{first} (+{len(issues) - 1} more)')


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _parse_utc(value):
    if not isinstance(value, str) or not ISO_UTC.match(value):
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)
    except ValueError:
        return None


def _exact_keys(obj, required, optional, path, issues):
    if not isinstance(obj, dict):
        issues.append(f'{path}: must be an object')
        return False
    for key in required:
        if key not in obj:
            issues.append(f'{path}.{key}: is required')
    for key in obj:
        if key not in required and key not in optional:
            issues.append(f'{path}.{key}: unknown field')
    return all(key in obj for key in required)


def _profile(value, path, issues):
    if not isinstance(value, list) or not value or not all(_is_number(item) for item in value):
        issues.append(f'{path}: must be a non-empty list of finite numbers')
        return None
    return value


def _check_site(site, index, window, start, issues):
    path = f'sites.sites[{index}]'
    if not _exact_keys(site, ('id', 'name', 'lat', 'lon', 'horizon', 'hours'), ('horizonByMast', 'horizonClones'), path, issues):
        return
    if not isinstance(site['id'], str) or not site['id']:
        issues.append(f'{path}.id: must be a non-empty string')
    if not isinstance(site['name'], str):
        issues.append(f'{path}.name: must be a string')
    for key in ('lat', 'lon'):
        if not _is_number(site[key]):
            issues.append(f'{path}.{key}: must be a finite number')
    horizon = _profile(site['horizon'], f'{path}.horizon', issues)

    masts = site.get('horizonByMast')
    if masts is not None and _exact_keys(masts, ('5', '10'), (), f'{path}.horizonByMast', issues):
        chain = [horizon]
        for mast in ('5', '10'):
            profile = _profile(masts[mast], f'{path}.horizonByMast.{mast}', issues)
            if horizon and profile and len(profile) != len(horizon):
                issues.append(f'{path}.horizonByMast.{mast}: profile length must equal horizon length ({len(horizon)})')
                profile = None
            chain.append(profile)
        for step, mast in enumerate(('5', '10')):
            higher, lower = chain[step], chain[step + 1]
            if higher and lower:
                bad = next((i for i, value in enumerate(lower) if value > higher[i] + 1e-9), None)
                if bad is not None:
                    issues.append(f'{path}.horizonByMast.{mast}[{bad}]: a taller mast must not raise the horizon')

    clones = site.get('horizonClones')
    if clones is not None:
        if not isinstance(clones, list):
            issues.append(f'{path}.horizonClones: must be a list')
        else:
            for clone_index, clone in enumerate(clones):
                profile = _profile(clone, f'{path}.horizonClones[{clone_index}]', issues)
                if horizon and profile and len(profile) != len(horizon):
                    issues.append(f'{path}.horizonClones[{clone_index}]: profile length must equal horizon length ({len(horizon)})')

    hours = site['hours']
    if not isinstance(hours, list):
        issues.append(f'{path}.hours: must be a list')
        return
    if window is not None and len(hours) != window['count']:
        issues.append(f'{path}.hours: hours.length is {len(hours)}, window.count is {window["count"]}')
        return
    for hour_index, hour in enumerate(hours):
        hour_path = f'{path}.hours[{hour_index}]'
        if not _exact_keys(hour, ('t', 'sunAz', 'sunEl', 'earthAz', 'earthEl'), (), hour_path, issues):
            continue
        moment = _parse_utc(hour['t'])
        if moment is None:
            issues.append(f'{hour_path}.t: must be an ISO 8601 UTC time ending with Z')
        elif start is not None and moment != start + timedelta(hours=hour_index):
            issues.append(f'{hour_path}.t: must equal window.start + index hours')
        for key in ('sunAz', 'earthAz'):
            if not _is_number(hour[key]) or not 0 <= hour[key] < 360:
                issues.append(f'{hour_path}.{key}: azimuth must be in [0, 360)')
        for key in ('sunEl', 'earthEl'):
            if not _is_number(hour[key]):
                issues.append(f'{hour_path}.{key}: must be a finite number')


def _check_sites(sites, issues):
    if not _exact_keys(sites, ('version', 'window', 'sites'), (), 'sites', issues):
        return
    if sites['version'] != 1:
        issues.append('sites.version: must be 1')
    window = sites['window']
    start = None
    if _exact_keys(window, ('start', 'stepH', 'count'), (), 'sites.window', issues):
        start = _parse_utc(window['start'])
        if start is None:
            issues.append('sites.window.start: must be an ISO 8601 UTC time ending with Z')
        if window['stepH'] != 1:
            issues.append('sites.window.stepH: must be 1')
        if not isinstance(window['count'], int) or isinstance(window['count'], bool) or window['count'] <= 0:
            issues.append('sites.window.count: must be a positive integer')
            window = None
    else:
        window = None
    if not isinstance(sites['sites'], list) or not sites['sites']:
        issues.append('sites.sites: must be a non-empty list')
        return
    seen = set()
    for index, site in enumerate(sites['sites']):
        if isinstance(site, dict) and isinstance(site.get('id'), str):
            if site['id'] in seen:
                issues.append(f'sites.sites[{index}].id: site id "{site["id"]}" is not unique')
            seen.add(site['id'])
        _check_site(site, index, window, start, issues)


def _check_provenance(provenance, issues):
    if not _exact_keys(provenance, ('datasetId', 'mode', 'sources', 'capabilities', 'notes'), (), 'provenance', issues):
        return
    if not isinstance(provenance['datasetId'], str) or not provenance['datasetId']:
        issues.append('provenance.datasetId: must be a non-empty string')
    if provenance['mode'] not in MODES:
        issues.append('provenance.mode: must be "demo" or "final"')
    if not isinstance(provenance['notes'], str):
        issues.append('provenance.notes: must be a string')
    sources = provenance['sources']
    if not isinstance(sources, list):
        issues.append('provenance.sources: must be a list')
    else:
        for index, source in enumerate(sources):
            path = f'provenance.sources[{index}]'
            if _exact_keys(source, ('title', 'text'), (), path, issues):
                if not isinstance(source['title'], str):
                    issues.append(f'{path}.title: must be a string')
                if source['text'] is not None and not isinstance(source['text'], str):
                    issues.append(f'{path}.text: must be a string or null')
    capabilities = provenance['capabilities']
    if _exact_keys(capabilities, ('minCapacity', 'heater', 'uncertainty'), (), 'provenance.capabilities', issues):
        for key, value in capabilities.items():
            if not isinstance(value, bool):
                issues.append(f'provenance.capabilities.{key}: must be a boolean')


def _check_validation(validation, issues):
    if not _exact_keys(validation, ('datasetId', 'checks'), (), 'validation', issues):
        return
    if not isinstance(validation['datasetId'], str) or not validation['datasetId']:
        issues.append('validation.datasetId: must be a non-empty string')
    if not isinstance(validation['checks'], list):
        issues.append('validation.checks: must be a list')
        return
    for index, check in enumerate(validation['checks']):
        path = f'validation.checks[{index}]'
        if not _exact_keys(check, ('level', 'name', 'status', 'ranAt'), (), path, issues):
            continue
        if check['level'] not in (1, 2, 3, 4) or isinstance(check['level'], bool):
            issues.append(f'{path}.level: must be 1, 2, 3 or 4')
        if not isinstance(check['name'], str):
            issues.append(f'{path}.name: must be a string')
        if check['status'] not in STATUSES:
            issues.append(f'{path}.status: must be pending, passed or failed')
        if check['ranAt'] is not None and _parse_utc(check['ranAt']) is None:
            issues.append(f'{path}.ranAt: must be an ISO 8601 UTC time ending with Z or null')
        if check['status'] == 'passed' and check['ranAt'] is None:
            issues.append(f'{path}.ranAt: a passed check must have ranAt')


def validate_release(sites, provenance, validation):
    issues = []
    _check_sites(sites, issues)
    _check_provenance(provenance, issues)
    _check_validation(validation, issues)
    if not issues:
        if validation['datasetId'] != provenance['datasetId']:
            issues.append('validation.datasetId: must equal provenance.datasetId')
    if issues:
        raise ReleaseContractError(issues)
    return {
        'datasetId': provenance['datasetId'],
        'mode': provenance['mode'],
        'sites': sites,
        'provenance': provenance,
        'validation': validation,
    }
