"""Geometry helpers for OSM fuel-station import."""
from __future__ import annotations

from typing import Iterable


def build_way_geometry(
    node_refs: Iterable[int],
    node_locations: dict[int, tuple[float, float]],
) -> tuple[str, str] | None:
    """
    Build WKT geometry for a way from resolved node coordinates.

    Returns (geom_wkt, geom_type) where geom_type is POINT, LINESTRING, or POLYGON.
    Representative-point SQL is applied separately in PostGIS on insert.
    """
    coords: list[tuple[float, float]] = []
    for ref in node_refs:
        loc = node_locations.get(ref)
        if loc is None:
            return None
        coords.append(loc)

    if len(coords) == 0:
        return None
    if len(coords) == 1:
        lon, lat = coords[0]
        return (f'POINT({lon} {lat})', 'POINT')

    closed = coords[0] == coords[-1]
    if closed and len(coords) >= 4:
        ring = ', '.join(f'{lon} {lat}' for lon, lat in coords)
        return (f'POLYGON(({ring}))', 'POLYGON')

    line = ', '.join(f'{lon} {lat}' for lon, lat in coords)
    return (f'LINESTRING({line})', 'LINESTRING')


def node_point_wkt(lon: float, lat: float) -> str:
    return f'POINT({lon} {lat})'
