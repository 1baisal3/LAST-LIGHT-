"""First-order engineering models; coefficients require mission calibration."""

import math
from dataclasses import dataclass

STEFAN_BOLTZMANN = 5.670374419e-8  # W m^-2 K^-4
SOLAR_CONSTANT_W_M2 = 1361.0
MIN_TEMPERATURE_C = -130.0
MAX_TEMPERATURE_C = 120.0


@dataclass(frozen=True)
class SimulationParameters:
    battery_capacity_wh: float = 1000
    initial_charge_percent: float = 100
    mast_height_m: float = 2
    panel_area_m2: float = 2
    panel_efficiency: float = 0.22
    power_load_w: float = 50
    initial_temperature_c: float = 20
    thermal_capacity_j_k: float = 20000
    thermal_area_m2: float = 1
    solar_absorptivity: float = 0.85
    emissivity: float = 0.9
    internal_heat_w: float = 10
    initial_dust_g_m2: float = 0
    dust_deposition_g_m2_day: float = 0.05
    dust_extinction_m2_g: float = 0.5


def solar_irradiance(elevation_deg, distance_au, illuminated=True):
    """Direct beam on horizontal panels, with point-center solar occultation."""
    if distance_au <= 0:
        raise ValueError('Sun distance must be positive.')
    if not illuminated:
        return 0.0
    return SOLAR_CONSTANT_W_M2 / distance_au**2 * max(0.0, math.sin(math.radians(elevation_deg)))


def dust_transmission(dust_g_m2, extinction_m2_g):
    """Beer-Lambert attenuation with a configurable extinction coefficient."""
    if dust_g_m2 < 0 or extinction_m2_g < 0:
        raise ValueError('Dust loading and extinction must be non-negative.')
    return math.exp(-extinction_m2_g * dust_g_m2)


def panel_power_w(irradiance_w_m2, area_m2, efficiency, temperature_c, transmission):
    temperature_factor = max(0.0, 1 - 0.004 * (temperature_c - 25))
    effective_efficiency = min(1.0, max(0.0, efficiency * temperature_factor))
    return irradiance_w_m2 * area_m2 * effective_efficiency * transmission


def thermal_step(temperature_c, irradiance_w_m2, parameters, duration_s=3600):
    """C dT/dt = alpha A F + Q - epsilon sigma A(T^4-Tenv^4).

    Lumped body, effective nightside environment -130 C; no atmosphere,
    conduction or active control. Implicit Euler with <=60 s steps.
    """
    if temperature_c <= -273.15 or duration_s < 0 or irradiance_w_m2 < 0:
        raise ValueError('Invalid temperature, duration or irradiance.')
    if parameters.thermal_capacity_j_k <= 0 or parameters.thermal_area_m2 <= 0 or not 0 < parameters.emissivity <= 1:
        raise ValueError('Invalid thermal parameters.')
    temperature_k = temperature_c + 273.15
    background_k = MIN_TEMPERATURE_C + 273.15
    radiation = parameters.emissivity * STEFAN_BOLTZMANN * parameters.thermal_area_m2
    heat_w = parameters.solar_absorptivity * parameters.thermal_area_m2 * irradiance_w_m2 + parameters.internal_heat_w
    remaining = duration_s
    while remaining > 0:
        dt = min(60, remaining)
        gain = dt / parameters.thermal_capacity_j_k
        target = temperature_k + gain * (heat_w + radiation * background_k**4)
        lower, upper = 0.0, target
        for _ in range(60):
            midpoint = (lower + upper) / 2
            if midpoint + gain * radiation * midpoint**4 > target:
                upper = midpoint
            else:
                lower = midpoint
        temperature_k = (lower + upper) / 2
        remaining -= dt
    return temperature_k - 273.15
