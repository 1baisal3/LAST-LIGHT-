import math

from rest_framework import serializers

from .models import SavedScenario


class SavedScenarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedScenario
        fields = [
            'id', 'user', 'name', 'battery_capacity_wh',
            'initial_charge_percent', 'mast_height_m', 'worst_case_mode',
            'results', 'created_at',
        ]
        read_only_fields = ['id', 'user', 'created_at']

    def validate(self, attrs):
        for field in ('battery_capacity_wh', 'initial_charge_percent', 'mast_height_m'):
            if field in attrs and not math.isfinite(attrs[field]):
                raise serializers.ValidationError({field: 'Enter a finite number.'})
        return attrs


class SavedScenarioRenameSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedScenario
        fields = SavedScenarioSerializer.Meta.fields
        read_only_fields = [field for field in SavedScenarioSerializer.Meta.fields if field != 'name']
