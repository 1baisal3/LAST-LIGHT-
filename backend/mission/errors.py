class MissionDataError(Exception):
    """A simulation cannot be calculated from the available source data."""


class HorizonsError(MissionDataError):
    pass


class HorizonsTimeout(HorizonsError):
    pass


class TerrainConfigurationError(MissionDataError):
    pass


class TerrainCoverageError(MissionDataError):
    pass
