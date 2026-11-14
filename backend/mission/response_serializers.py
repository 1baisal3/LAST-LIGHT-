import math
from datetime import datetime, time, timedelta, timezone

from rest_framework import serializers
from .providers import HORIZON_PROFILE_AZIMUTHS


class ResponseContractSerializer(serializers.Serializer):
    def validate(self, attrs):
        def check(value):
            if isinstance(value, float) and not math.isfinite(value):
                raise serializers.ValidationError('Response contains a non-finite number.')
            if isinstance(value, dict):
                for item in value.values():
                    check(item)
            elif isinstance(value, (list, tuple)):
                for item in value:
                    check(item)
        check(attrs)
        return attrs


class RiskSerializer(ResponseContractSerializer):
    is_safe = serializers.BooleanField()
    reasons = serializers.ListField(child=serializers.CharField())
    minimum_charge_percent = serializers.FloatField(min_value=0, max_value=100)
    survival_percent = serializers.FloatField(min_value=0, max_value=100)
    survival_definition = serializers.CharField()
    unserved_energy_wh = serializers.FloatField(min_value=0)
    thermal_violation_hours = serializers.IntegerField(min_value=0, max_value=168)
    critical_charge_percent = serializers.FloatField()
    minimum_survival_percent = serializers.FloatField()
    communications_blackout_hours = serializers.IntegerField(min_value=0, max_value=168)
    risk_multiplier = serializers.FloatField(min_value=1)


class RecoveryCandidateSerializer(ResponseContractSerializer):
    type = serializers.ChoiceField(choices=['safe_haven', 'alternative_window'])
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    date = serializers.DateField()
    distance_m = serializers.FloatField(min_value=0, max_value=1000)
    delay_days = serializers.IntegerField(min_value=0, max_value=7)
    risk = RiskSerializer(required=False)
    status = serializers.ChoiceField(choices=['safe', 'unsafe', 'unavailable'], required=False)
    reason = serializers.CharField(required=False)


class FixPlanSerializer(ResponseContractSerializer):
    status = serializers.ChoiceField(choices=[
        'not_needed', 'disabled', 'found', 'not_found', 'budget_exhausted', 'incomplete',
    ])
    recommendation = RecoveryCandidateSerializer(allow_null=True)
    attempts = RecoveryCandidateSerializer(many=True)
    evaluated_candidates = serializers.IntegerField(min_value=0)
    search_complete = serializers.BooleanField()
    scope = serializers.CharField()
    forced = serializers.BooleanField()
    trigger = serializers.ChoiceField(choices=['none', 'unsafe_scenario', 'disaster_mode'])


class ThreatStatusSerializer(ResponseContractSerializer):
    enabled = serializers.BooleanField()
    scenario = serializers.CharField(allow_null=True)
    source = serializers.ChoiceField(choices=['none', 'manual_simulation'])
    status = serializers.ChoiceField(choices=['disabled', 'event_in_window', 'residual_damage', 'scheduled'])
    event_start = serializers.DateTimeField(allow_null=True)
    event_end = serializers.DateTimeField(allow_null=True)
    risk_multiplier = serializers.FloatField(min_value=1)
    final_panel_health_factor = serializers.FloatField(min_value=0, max_value=1)
    panel_shock_factor = serializers.FloatField(min_value=0, max_value=1)
    residual_panel_factor = serializers.FloatField(min_value=0, max_value=1)
    panel_damage_rate_per_hour = serializers.FloatField(min_value=0)
    critical_load_fraction = serializers.FloatField(min_value=0, max_value=1)
    disabled_systems = serializers.ListField(child=serializers.CharField())
    communications_blackout_hours = serializers.IntegerField(min_value=0, max_value=168)
    fix_plan_forced = serializers.BooleanField()
    is_observed_event = serializers.BooleanField()
    assumptions = serializers.ListField(child=serializers.CharField())


class FixPlanResponseSerializer(ResponseContractSerializer):
    risk = RiskSerializer()
    fix_plan = FixPlanSerializer()
    threat_status = ThreatStatusSerializer()


class HourlySampleSerializer(ResponseContractSerializer):
    timestamp = serializers.DateTimeField()
    sun_elevation_deg = serializers.FloatField()
    sun_azimuth_deg = serializers.FloatField(min_value=0, max_value=360, help_text='Degrees clockwise from north, in [0, 360).')
    earth_elevation_deg = serializers.FloatField()
    earth_azimuth_deg = serializers.FloatField(min_value=0, max_value=360, help_text='Degrees clockwise from north, in [0, 360).')
    sun_horizon_deg = serializers.FloatField()
    earth_horizon_deg = serializers.FloatField()
    sun_visible = serializers.BooleanField()
    earth_visible = serializers.BooleanField()
    communications_available = serializers.BooleanField()
    communications_blackout = serializers.BooleanField()
    threat_phase = serializers.ChoiceField(choices=['disabled', 'scheduled', 'active', 'residual'])
    systems_mode = serializers.ChoiceField(choices=['nominal', 'critical_only'])
    panel_health_factor = serializers.FloatField(min_value=0, max_value=1)
    effective_power_load_w = serializers.FloatField(min_value=0)
    effective_internal_heat_w = serializers.FloatField(min_value=0)
    solar_irradiance_w_m2 = serializers.FloatField()
    panel_power_w = serializers.FloatField()
    panel_dust_transmission = serializers.FloatField()
    energy_balance_wh = serializers.FloatField()
    battery_charge_wh = serializers.FloatField()
    unserved_energy_wh = serializers.FloatField()
    spilled_energy_wh = serializers.FloatField()
    temperature_c = serializers.FloatField()
    temperature_within_limits = serializers.BooleanField()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        for field in ('sun_azimuth_deg', 'earth_azimuth_deg'):
            if attrs[field] >= 360:
                raise serializers.ValidationError({field: 'Azimuth must be less than 360 degrees.'})
        return attrs


class HorizonPointSerializer(ResponseContractSerializer):
    azimuth_deg = serializers.FloatField(min_value=0, max_value=350, help_text='Bearing clockwise from north; 0, 10, ..., 350 degrees.')
    elevation_deg = serializers.FloatField(min_value=-90, max_value=90, help_text='LOLA horizon elevation above the local horizontal, including mast height and lunar curvature.')


class ModelMetadataSerializer(ResponseContractSerializer):
    version = serializers.CharField()
    data_mode = serializers.ChoiceField(choices=['synthetic-v1', 'external', 'injected'])
    parameters = serializers.DictField(child=serializers.FloatField())
    temperature_limits_c = serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2)
    ephemeris_source = serializers.CharField()
    terrain_source = serializers.CharField()
    terrain_sha256 = serializers.CharField(allow_null=True)
    ephemeris_sha256 = serializers.ListField(child=serializers.CharField())
    terrain_profile_distance_m = serializers.FloatField()
    terrain_profile_step_m = serializers.FloatField()
    assumptions = serializers.ListField(child=serializers.CharField())


class MissionResponseSerializer(FixPlanResponseSerializer):
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    date = serializers.DateField()
    duration_hours = serializers.IntegerField(min_value=1, max_value=168)
    timezone = serializers.ChoiceField(choices=['UTC'])
    is_placeholder = serializers.BooleanField()
    model = ModelMetadataSerializer()
    hourly_data = serializers.ListField(child=HourlySampleSerializer(), min_length=1, max_length=168)
    horizon_profile = serializers.ListField(
        child=HorizonPointSerializer(), min_length=36, max_length=36,
        help_text='Static 360-degree horizon at the landing site, sampled every 10 degrees. Individual hourly visibility uses exact target bearings.',
    )

    def validate_horizon_profile(self, value):
        if [point['azimuth_deg'] for point in value] != list(HORIZON_PROFILE_AZIMUTHS):
            raise serializers.ValidationError('Expected the ordered azimuth grid 0, 10, ..., 350 degrees.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        rows = attrs['hourly_data']
        if len(rows) != attrs['duration_hours']:
            raise serializers.ValidationError({'hourly_data': 'Expected exactly duration_hours samples.'})
        start = datetime.combine(attrs['date'], time.min, tzinfo=timezone.utc)
        if any(row['timestamp'] != start + timedelta(hours=index) for index, row in enumerate(rows)):
            raise serializers.ValidationError({'hourly_data': 'Expected consecutive hourly UTC timestamps.'})
        return attrs


class SourceErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField()


class ThrottleErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()
