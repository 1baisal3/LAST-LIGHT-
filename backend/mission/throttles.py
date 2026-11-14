from django.conf import settings
from rest_framework.throttling import UserRateThrottle


class MissionUserThrottle(UserRateThrottle):
    """Shared account limit for mission and Fix Plan; plan-aware policies can subclass it."""

    scope = 'mission'

    def get_rate(self):
        return settings.MISSION_THROTTLE_RATE if settings.MISSION_THROTTLE_ENABLED else None
