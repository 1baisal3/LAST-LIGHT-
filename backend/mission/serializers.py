import math
from datetime import timedelta

from rest_framework import serializers


class MissionSimulationSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    date = serializers.DateField(input_formats=['%Y-%m-%d'], help_text='UTC calendar date in YYYY-MM-DD format, years 1900 through 2100.')
    duration_hours = serializers.IntegerField(min_value=1, max_value=168, default=24, help_text='Continuous hourly simulation; use 168 for a seven-day mission. Defaults to 24 for existing API clients.')
    battery_capacity_wh = serializers.FloatField(min_value=0.01, max_value=1e9, default=1000)
    initial_charge_percent = serializers.FloatField(min_value=0, max_value=100, default=100)
    mast_height_m = serializers.FloatField(min_value=0, max_value=100, default=2)
    panel_area_m2 = serializers.FloatField(min_value=0, max_value=10000, default=2)
    panel_efficiency = serializers.FloatField(min_value=0, max_value=1, default=0.22)
    power_load_w = serializers.FloatField(min_value=0, max_value=1e6, default=50)
    initial_temperature_c = serializers.FloatField(min_value=-130, max_value=120, default=20)
    thermal_capacity_j_k = serializers.FloatField(min_value=1, max_value=1e9, default=20000)
    thermal_area_m2 = serializers.FloatField(min_value=0.01, max_value=10000, default=1)
    solar_absorptivity = serializers.FloatField(min_value=0, max_value=1, default=0.85)
    emissivity = serializers.FloatField(min_value=0.01, max_value=1, default=0.9)
    internal_heat_w = serializers.FloatField(min_value=0, max_value=1e6, default=10)
    initial_dust_g_m2 = serializers.FloatField(min_value=0, max_value=10000, default=0)
    dust_deposition_g_m2_day = serializers.FloatField(min_value=0, max_value=1000, default=0.05)
    dust_extinction_m2_g = serializers.FloatField(min_value=0, max_value=1000, default=0.5)
    auto_resolve = serializers.BooleanField(default=True)
    critical_charge_percent = serializers.FloatField(min_value=0, max_value=50, default=5)
    minimum_survival_percent = serializers.FloatField(min_value=0, max_value=100, default=100)
    disaster_mode = serializers.BooleanField(default=False, help_text='Inject solar-storm-v1: blackout, permanent electrical panel damage and critical-load operation. Forces Fix Plan with stricter reserves; not an observed event.')
    worst_case_override = serializers.BooleanField(required=False, write_only=True, help_text='Alias for disaster_mode. Conflicting explicit values are rejected.')

    def validate_date(self, value):
        if not 1900 <= value.year <= 2100:
            raise serializers.ValidationError('Supported simulation dates are 1900 through 2100.')
        return value

    def validate(self, attrs):
        if (attrs['date'] + timedelta(hours=attrs['duration_hours'] - 1)).year > 2100:
            raise serializers.ValidationError({'duration_hours': 'The mission must end before 2101.'})
        if 'worst_case_override' in attrs:
            override = attrs.pop('worst_case_override')
            if 'disaster_mode' in self.initial_data and attrs['disaster_mode'] != override:
                raise serializers.ValidationError({'worst_case_override': 'Must agree with disaster_mode when both are supplied.'})
            attrs['disaster_mode'] = override
        for field, value in attrs.items():
            if isinstance(value, float) and not math.isfinite(value):
                raise serializers.ValidationError({field: 'Enter a finite number.'})
        return attrs
