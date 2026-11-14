"""Optional drf-spectacular integration; never emulate an installed package."""

try:
    from drf_spectacular.utils import extend_schema, extend_schema_view
except ImportError:
    def extend_schema(**kwargs):
        return lambda target: target

    def extend_schema_view(**kwargs):
        return lambda target: target
