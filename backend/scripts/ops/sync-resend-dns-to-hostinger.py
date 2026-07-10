#!/usr/bin/env python3
"""Merge Resend outbound DNS into Hostinger zone (preserves existing MX @ for mailboxes)."""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

HOSTINGER_BASE = "https://developers.hostinger.com"
RESEND_BASE = "https://api.resend.com"


def env_token() -> str:
    token = os.environ.get("HOSTINGER_API_TOKEN") or os.environ.get("API_TOKEN") or ""
    if not token.strip():
        print("ERROR: HOSTINGER_API_TOKEN not set", file=sys.stderr)
        sys.exit(1)
    return token.strip()


def resend_key() -> str:
    key = os.environ.get("RESEND_API_KEY", "").strip()
    if not key:
        print("ERROR: RESEND_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    return key


def http_json(method: str, url: str, token: str, body: dict | None = None) -> dict:
    data = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "synqdrive-dns-sync/1.0",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        print(f"HTTP {e.code} {method} {url}\n{detail}", file=sys.stderr)
        sys.exit(1)


def find_resend_domain(domain: str) -> dict:
    listing = http_json("GET", f"{RESEND_BASE}/domains", resend_key())
    for item in listing.get("data", []):
        if item.get("name") == domain:
            domain_id = item["id"]
            return http_json("GET", f"{RESEND_BASE}/domains/{domain_id}", resend_key())
    print(f"ERROR: Domain {domain} not found in Resend", file=sys.stderr)
    sys.exit(1)


def hostinger_zone(domain: str, token: str) -> list[dict]:
    data = http_json("GET", f"{HOSTINGER_BASE}/api/dns/v1/zones/{domain}", token)
    return data if isinstance(data, list) else data.get("zone", data.get("records", []))


def resend_records_to_zone_entries(records: list[dict]) -> list[dict]:
    """Convert Resend domain records to Hostinger zone update entries."""
    grouped: dict[tuple[str, str], list[str]] = {}
    mx_priority: dict[tuple[str, str], int] = {}

    for rec in records:
        name = (rec.get("name") or "").strip()
        rtype = (rec.get("type") or "TXT").upper()
        value = (rec.get("value") or "").strip()
        if not name or not value:
            continue
        key = (name, rtype)
        if rtype == "MX":
            prio = int(rec.get("priority") or 10)
            mx_priority[key] = prio
            grouped.setdefault(key, []).append(value.rstrip("."))
        else:
            grouped.setdefault(key, []).append(value)

    zone: list[dict] = []
    for (name, rtype), contents in grouped.items():
        records: list[dict] = []
        for content in contents:
            if rtype == "MX":
                prio = mx_priority.get((name, rtype), 10)
                host = content if content.endswith(".") else f"{content}."
                records.append({"content": f"{prio} {host}"})
            else:
                records.append({"content": content})
        entry: dict = {
            "name": name,
            "type": rtype,
            "ttl": 14400,
            "records": records,
        }
        zone.append(entry)
    return zone


def merge_zone(existing: list[dict], additions: list[dict]) -> list[dict]:
    """Return only new/changed Resend records (merge mode — do not touch @ MX)."""
    existing_keys = {(r.get("name"), r.get("type")) for r in existing}
    merged: list[dict] = []
    for add in additions:
        key = (add["name"], add["type"])
        if key in existing_keys:
            # Update TTL/records for Resend subdomains only
            merged.append(add)
        else:
            merged.append(add)
    return merged


def main() -> None:
    domain = sys.argv[1] if len(sys.argv) > 1 else "synqdrive.eu"
    verify = (sys.argv[2] if len(sys.argv) > 2 else "1") == "1"
    token = env_token()

    resend_domain = find_resend_domain(domain)
    resend_records = resend_domain.get("records") or []
    if not resend_records:
        print(f"ERROR: No DNS records returned for {domain} from Resend", file=sys.stderr)
        sys.exit(1)

    additions = resend_records_to_zone_entries(resend_records)
    print(f"Resend records to apply for {domain}:")
    for z in additions:
        print(f"  {z['type']} {z['name']} -> {z['records']}")

    existing = hostinger_zone(domain, token)
    print(f"Hostinger zone currently has {len(existing)} record groups")

    payload = {"overwrite": False, "zone": additions}
    http_json(
        "POST",
        f"{HOSTINGER_BASE}/api/dns/v1/zones/{domain}/validate",
        token,
        payload,
    )
    print("Hostinger DNS validation OK")

    http_json(
        "PUT",
        f"{HOSTINGER_BASE}/api/dns/v1/zones/{domain}",
        token,
        payload,
    )
    print(f"Merged Resend DNS into Hostinger zone for {domain}")

    if not verify:
        return

    domain_id = resend_domain["id"]
    print("Waiting 15s for DNS propagation before Resend verify…")
    time.sleep(15)
    result = http_json(
        "POST",
        f"{RESEND_BASE}/domains/{domain_id}/verify",
        resend_key(),
        {},
    )
    status = result.get("status") or resend_domain.get("status")
    print(f"Resend verify status: {status}")
    if status not in ("verified", "VERIFIED"):
        refreshed = http_json("GET", f"{RESEND_BASE}/domains/{domain_id}", resend_key())
        print(json.dumps(refreshed.get("records", []), indent=2))


if __name__ == "__main__":
    main()
