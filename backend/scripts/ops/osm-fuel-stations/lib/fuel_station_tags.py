"""OSM tag extraction for amenity=fuel stations."""
from __future__ import annotations

from typing import Any


def _tag(tags: Any, key: str) -> str | None:
    value = tags.get(key)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def extract_station_fields(tags: Any) -> dict[str, Any]:
    """Map OSM tags to normalized fuel_stations columns."""
    city = _tag(tags, 'addr:city') or _tag(tags, 'addr:place') or _tag(tags, 'addr:suburb')
    country = _tag(tags, 'addr:country')
    country_code = 'DE'
    if country:
        upper = country.upper()
        if len(upper) == 2:
            country_code = upper
        elif upper in ('DEUTSCHLAND', 'GERMANY'):
            country_code = 'DE'

    tag_dict: dict[str, str] = {}
    for key, value in tags:
        tag_dict[str(key)] = str(value)

    return {
        'name': _tag(tags, 'name'),
        'brand': _tag(tags, 'brand'),
        'operator': _tag(tags, 'operator'),
        'ref': _tag(tags, 'ref'),
        'street': _tag(tags, 'addr:street'),
        'housenumber': _tag(tags, 'addr:housenumber'),
        'postcode': _tag(tags, 'addr:postcode'),
        'city': city,
        'country_code': country_code,
        'opening_hours': _tag(tags, 'opening_hours'),
        'tags': tag_dict,
    }
