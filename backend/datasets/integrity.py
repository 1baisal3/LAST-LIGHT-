"""Immutable dataset registration and content-addressed ephemeris storage."""

import hashlib
import hmac
import json
import os
import re
import tempfile
from contextlib import contextmanager
from pathlib import Path

try:
    import fcntl
except ImportError:
    fcntl = None
    import msvcrt


def _lock(stream):
    if fcntl is not None:
        fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        return
    stream.seek(0)
    msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)


def _unlock(stream):
    if fcntl is not None:
        fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
        return
    stream.seek(0)
    msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)


class DatasetIntegrityError(Exception):
    pass


def _signature(stat):
    if os.name == 'nt':
        return (stat.st_size, stat.st_mtime_ns)
    return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)


def sha256_file(path):
    try:
        with Path(path).open('rb') as stream:
            before = os.fstat(stream.fileno())
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            after = os.fstat(stream.fileno())
            current = Path(path).stat()
            signature = _signature
            if signature(before) != signature(after) or signature(after) != signature(current):
                raise DatasetIntegrityError('Dataset changed while its SHA-256 was being calculated.')
            return digest
    except OSError as exc:
        raise DatasetIntegrityError('Dataset cannot be read.') from exc


def _read_manifest(path):
    if not path.exists():
        return {'version': 1, 'files': {}}
    try:
        manifest = json.loads(path.read_text())
        if manifest['version'] != 1 or not isinstance(manifest['files'], dict):
            raise ValueError('Unsupported manifest')
        return manifest
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise DatasetIntegrityError('Dataset manifest is invalid.') from exc


@contextmanager
def _manifest_lock(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix(path.suffix + '.lock').open('a+') as lock:
        _lock(lock)
        try:
            yield
        finally:
            _unlock(lock)


def _atomic_json(path, payload):
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.manifest-')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(payload, stream, indent=2, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def register_dataset(path, manifest_path, *, kind='topography', expected_sha256=None):
    """Trust on initial import only; existing baselines are never refreshed."""
    path, manifest_path = Path(path).resolve(), Path(manifest_path).resolve()
    if kind not in ('topography', 'ephemeris'):
        raise DatasetIntegrityError('Unsupported dataset kind.')
    digest = sha256_file(path)
    if expected_sha256 is not None and not hmac.compare_digest(digest, expected_sha256.lower()):
        raise DatasetIntegrityError('Dataset does not match the supplied SHA-256.')
    try:
        with _manifest_lock(manifest_path):
            manifest = _read_manifest(manifest_path)
            entry = {'sha256': digest, 'size_bytes': path.stat().st_size, 'kind': kind}
            previous = manifest['files'].get(str(path))
            if previous is not None and previous != entry:
                raise DatasetIntegrityError('Registered immutable dataset has changed; baseline was not replaced.')
            manifest['files'][str(path)] = entry
            _atomic_json(manifest_path, manifest)
    except OSError as exc:
        raise DatasetIntegrityError('Dataset manifest cannot be written.') from exc
    return digest


def verify_dataset(path, manifest_path, *, kind='topography'):
    path, manifest_path = Path(path).resolve(), Path(manifest_path).resolve()
    entry = _read_manifest(manifest_path)['files'].get(str(path))
    try:
        if not isinstance(entry, dict) or entry['kind'] != kind:
            raise DatasetIntegrityError('Dataset is not registered; import it with register_dataset first.')
        expected = entry['sha256']
        if not isinstance(expected, str) or not re.fullmatch('[0-9a-f]{64}', expected):
            raise DatasetIntegrityError('Dataset manifest contains an invalid SHA-256.')
        actual = sha256_file(path)
        if not hmac.compare_digest(actual, expected) or path.stat().st_size != entry['size_bytes']:
            raise DatasetIntegrityError('Dataset SHA-256 verification failed.')
        return actual
    except (KeyError, TypeError, OSError) as exc:
        raise DatasetIntegrityError('Dataset manifest entry or file is invalid.') from exc


class EphemerisStore:
    """SHA-256 filenames pin cached Horizons responses; corrupted files are rejected."""

    def __init__(self, directory):
        self.directory = Path(directory)

    def save(self, payload):
        content = json.dumps(payload, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
        digest = hashlib.sha256(content).hexdigest()
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            fd, temporary = tempfile.mkstemp(dir=self.directory, prefix='.ephemeris-')
            try:
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(content)
                    stream.flush()
                    os.fsync(stream.fileno())
                try:
                    # Atomic, exclusive publication; never overwrite an existing hash.
                    os.link(temporary, self.directory / f'{digest}.json')
                except FileExistsError:
                    pass
            finally:
                os.unlink(temporary)
            self.load(digest)
            return digest
        except OSError as exc:
            raise DatasetIntegrityError('Ephemeris archive cannot be written.') from exc

    def load(self, digest):
        if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
            raise DatasetIntegrityError('Invalid ephemeris SHA-256 identifier.')
        path = self.directory / f'{digest}.json'
        try:
            content = path.read_bytes()
            if not hmac.compare_digest(hashlib.sha256(content).hexdigest(), digest):
                raise DatasetIntegrityError('Archived ephemeris SHA-256 verification failed.')
            return json.loads(content)
        except (OSError, ValueError) as exc:
            raise DatasetIntegrityError('Archived ephemeris is missing or invalid.') from exc
