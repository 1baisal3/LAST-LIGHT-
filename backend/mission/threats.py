"""Deterministic stress-test scenarios; these are not detected space-weather events."""

import math
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone

DISABLED_SYSTEMS = ('science_payload', 'auxiliary_lighting', 'noncritical_computing')


@dataclass(frozen=True)
class DisasterScenario:
    enabled: bool = False
    event_start: datetime | None = None
    duration_hours: int = 6
    risk_multiplier: float = 2.0
    panel_shock_factor: float = 0.5
    residual_panel_factor: float = 0.2
    critical_load_fraction: float = 0.4

    def __post_init__(self):
        if self.enabled and (self.event_start is None or self.event_start.utcoffset() is None):
            raise ValueError('Enabled disaster scenarios require an aware event timestamp.')
        coefficients = (self.duration_hours, self.risk_multiplier, self.panel_shock_factor,
                        self.residual_panel_factor, self.critical_load_fraction)
        if not all(math.isfinite(value) for value in coefficients) or not (self.duration_hours > 0 and self.risk_multiplier >= 1
                and 0 < self.residual_panel_factor < self.panel_shock_factor <= 1
                and 0 < self.critical_load_fraction <= 1):
            raise ValueError('Invalid disaster scenario coefficients.')

    @classmethod
    def for_mission(cls, enabled, date):
        start = datetime.combine(date, time(6), tzinfo=timezone.utc) if enabled else None
        return cls(enabled=enabled, event_start=start)

    @property
    def event_end(self):
        return self.event_start + timedelta(hours=self.duration_hours) if self.enabled else None

    @property
    def damage_rate(self):
        return math.log(self.panel_shock_factor / self.residual_panel_factor) / self.duration_hours

    def health_at(self, timestamp):
        if not self.enabled or timestamp < self.event_start:
            return 1.0
        exposure = min(self.duration_hours, (timestamp - self.event_start).total_seconds() / 3600)
        return self.panel_shock_factor * math.exp(-self.damage_rate * exposure)

    def average_health(self, start, end):
        """Integrate the shock/exponential/residual health curve over an interval."""
        if end <= start:
            raise ValueError('Threat interval must have positive duration.')
        if not self.enabled:
            return 1.0
        total_s = (end - start).total_seconds()
        healthy_s = max(0.0, (min(end, self.event_start) - start).total_seconds())
        affected_start, affected_end = max(start, self.event_start), min(end, self.event_end)
        integral = healthy_s
        if affected_end > affected_start:
            t0 = (affected_start - self.event_start).total_seconds() / 3600
            t1 = (affected_end - self.event_start).total_seconds() / 3600
            integral += self.panel_shock_factor * 3600 / self.damage_rate * (
                math.exp(-self.damage_rate * t0) - math.exp(-self.damage_rate * t1)
            )
        residual_s = max(0.0, (end - max(start, self.event_end)).total_seconds())
        integral += self.residual_panel_factor * residual_s
        return integral / total_s

    def effects(self, timestamp):
        end = timestamp + timedelta(hours=1)
        blackout = self.enabled and timestamp < self.event_end and end > self.event_start
        shedding = self.enabled and timestamp >= self.event_start
        return {
            'phase': ('disabled' if not self.enabled else 'active' if blackout
                      else 'residual' if timestamp >= self.event_end else 'scheduled'),
            'communications_blackout': blackout,
            'panel_health_factor': self.average_health(timestamp, end),
            'load_fraction': self.critical_load_fraction if shedding else 1.0,
            'systems_mode': 'critical_only' if shedding else 'nominal',
        }

    def summary(self, timestamps):
        start, end = timestamps[0], timestamps[-1] + timedelta(hours=1)
        blackout_hours = sum(self.effects(timestamp)['communications_blackout'] for timestamp in timestamps)
        status = ('disabled' if not self.enabled else 'event_in_window' if blackout_hours
                  else 'residual_damage' if start >= self.event_end else 'scheduled')
        iso = lambda value: value.isoformat().replace('+00:00', 'Z') if value else None
        return {
            'enabled': self.enabled, 'scenario': 'solar-storm-v1' if self.enabled else None,
            'source': 'manual_simulation' if self.enabled else 'none', 'status': status,
            'event_start': iso(self.event_start), 'event_end': iso(self.event_end),
            'risk_multiplier': self.risk_multiplier if self.enabled else 1.0,
            'final_panel_health_factor': self.health_at(end),
            'panel_shock_factor': self.panel_shock_factor if self.enabled else 1.0,
            'residual_panel_factor': self.residual_panel_factor if self.enabled else 1.0,
            'panel_damage_rate_per_hour': self.damage_rate if self.enabled else 0.0,
            'critical_load_fraction': self.critical_load_fraction if self.enabled else 1.0,
            'disabled_systems': list(DISABLED_SYSTEMS) if self.enabled and end > self.event_start else [],
            'communications_blackout_hours': blackout_hours,
            'fix_plan_forced': self.enabled,
            'is_observed_event': False,
            'assumptions': (
                ['Injected storm at 06:00 UTC for six hours; no forecast or observed impact is claimed.',
                 'Electrical panel health drops to 50% at onset and decays to 20%; damage persists.',
                 'Noncritical loads and their internal heat are shed to 40% after onset.',
                 'Communication blackout is independent of geometric Earth line of sight.']
                if self.enabled else []
            ),
        }
