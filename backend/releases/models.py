from django.db import models


class DataRelease(models.Model):
    dataset_id = models.CharField(max_length=128, unique=True)
    mode = models.CharField(max_length=8, choices=[('demo', 'demo'), ('final', 'final')])
    sites = models.JSONField()
    provenance = models.JSONField()
    validation = models.JSONField()
    loaded_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-loaded_at', '-pk']

    def __str__(self):
        return f'{self.dataset_id} ({self.mode})'

    def as_dataset(self):
        return {
            'datasetId': self.dataset_id,
            'mode': self.mode,
            'sites': self.sites,
            'provenance': self.provenance,
            'validation': self.validation,
        }
