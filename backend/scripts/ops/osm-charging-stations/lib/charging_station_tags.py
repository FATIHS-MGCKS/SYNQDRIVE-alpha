"""OSM tag extraction for amenity=charging_station objects."""
from __future__ import annotations

from typing import Any


def _tag(tags: Any, key: str) -> str | None:
    value = tags.get(key)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def is_motor_vehicle_excluded(tags: Any) -> bool:
    """V1: exclude explicit motor-vehicle / motorcar prohibitions."""
    motorcar = (_tag(tags, 'motorcar') or '').lower()
    motor_vehicle = (_tag(tags, 'motor_vehicle') or '').lower()
    if motorcar in ('no', 'private'):
        return True
    if motor_vehicle == 'no':
        return True
    return False


def is_charging_station_amenity(tags: Any) -> bool:
    amenity = (_tag(tags, 'amenity') or '').lower()
    if amenity == 'fuel':
        return False
    if amenity == 'device_charging_station':
        return False
    return amenity == 'charging_station'


def extract_station_fields(tags: Any) -> dict[str, Any]:
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
        'network': _tag(tags, 'network'),
        'ref': _tag(tags, 'ref'),
        'street': _tag(tags, 'addr:street'),
        'housenumber': _tag(tags, 'addr:housenumber'),
        'postcode': _tag(tags, 'addr:postcode'),
        'city': city,
        'country_code': country_code,
        'access': _tag(tags, 'access'),
        'fee': _tag(tags, 'fee'),
        'capacity': _tag(tags, 'capacity'),
        'opening_hours': _tag(tags, 'opening_hours'),
        'tags': tag_dict,
    }
