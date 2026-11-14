from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class SavedScenario(models.Model):
    """Mission simulation inputs and their resulting risk assessment."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='saved_scenarios',
    )
    name = models.CharField(max_length=255, blank=True)
    battery_capacity_wh = models.FloatField(
        help_text='Battery capacity in watt-hours.',
        validators=[MinValueValidator(0.01)],
    )
    initial_charge_percent = models.FloatField(
        default=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    mast_height_m = models.FloatField(
        help_text='Mast height in metres.',
        validators=[MinValueValidator(0)],
    )
    worst_case_mode = models.BooleanField(default=False)
    results = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-pk']

    def __str__(self):
        return self.name or f'Scenario #{self.pk}'
