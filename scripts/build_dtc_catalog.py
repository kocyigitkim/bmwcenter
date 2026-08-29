#!/usr/bin/env python3
"""Build mobile/src/data/DTCCatalog.json from open OBD-II datasets.

Sources (clone once):
  git clone --depth 1 https://github.com/foerbsnavi/obdex.git /tmp/obdex
  git clone --depth 1 https://github.com/Wal33D/dtc-database.git /tmp/dtc-database

Preserves existing Turkish (`tr`) strings and BMW flags from the current catalog.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML required: pip3 install pyyaml")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from translate_dtc_catalog_tr import fill_missing_tr  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
EXISTING_PATH = ROOT / "mobile/src/data/DTCCatalog.json"
OUT = EXISTING_PATH
OBDEX = Path("/tmp/obdex/data/generic")
WAL_DB = Path("/tmp/dtc-database/data/dtc_codes.db")

CAT_MAP = {
    "powertrain": ("fuelAir", "dtc.system.fuelAir"),
    "body": ("body", "dtc.system.body"),
    "chassis": ("chassis", "dtc.system.chassis"),
    "network": ("network", "dtc.system.network"),
}


def system_for(code: str, category: str | None):
    if category and category in CAT_MAP:
        return CAT_MAP[category]
    return {
        "P": ("fuelAir", "dtc.system.fuelAir"),
        "B": ("body", "dtc.system.body"),
        "C": ("chassis", "dtc.system.chassis"),
        "U": ("network", "dtc.system.network"),
    }.get(code[:1], ("other", "dtc.system.other"))


def severity_from(flags, repair) -> str:
    flags = flags or {}
    repair = repair or {}
    if flags.get("limp_mode_possible"):
        return "high"
    diff = (repair.get("difficulty") or "").lower()
    if diff == "hard":
        return "high"
    if flags.get("mil") and flags.get("emissions_relevant"):
        return "medium"
    if diff == "easy":
        return "low"
    return "medium"


def main() -> None:
    if not OBDEX.is_dir():
        sys.exit(f"Missing {OBDEX} — clone foerbsnavi/obdex first")
    if not WAL_DB.is_file():
        sys.exit(f"Missing {WAL_DB} — clone Wal33D/dtc-database first")

    existing = json.loads(EXISTING_PATH.read_text()) if EXISTING_PATH.exists() else {}
    catalog: dict[str, dict] = {}

    for path in sorted(OBDEX.glob("*_enriched.yaml")):
        for item in yaml.safe_load(path.read_text()) or []:
            code = item.get("code")
            if not code:
                continue
            title = ((item.get("title") or {}).get("en") or "").strip()
            sys_name, sys_key = system_for(code, item.get("category"))
            catalog[code] = {
                "bmw": False,
                "en": title or code,
                "severity": severity_from(item.get("flags"), item.get("repair")),
                "system": sys_name,
                "systemKey": sys_key,
                "titleKey": f"dtc.{code}.title",
            }

    con = sqlite3.connect(WAL_DB)
    cur = con.cursor()
    for code, desc in cur.execute(
        "SELECT code, description FROM dtc_definitions "
        "WHERE (manufacturer='GENERIC' OR is_generic=1) AND locale='en'"
    ):
        if code in catalog or not desc:
            continue
        sys_name, sys_key = system_for(code, None)
        catalog[code] = {
            "bmw": False,
            "en": desc.strip(),
            "severity": "medium",
            "system": sys_name,
            "systemKey": sys_key,
            "titleKey": f"dtc.{code}.title",
        }

    for code, desc in cur.execute(
        "SELECT code, description FROM dtc_definitions "
        "WHERE manufacturer='BMW' AND locale='en'"
    ):
        if not desc:
            continue
        sys_name, sys_key = system_for(code, None)
        if code in catalog:
            catalog[code]["bmw"] = True
        else:
            catalog[code] = {
                "bmw": True,
                "en": desc.strip(),
                "severity": "medium",
                "system": sys_name,
                "systemKey": sys_key,
                "titleKey": f"dtc.{code}.title",
            }

    for code, old in existing.items():
        if code not in catalog:
            catalog[code] = {
                "bmw": bool(old.get("bmw")),
                "en": old.get("en") or code,
                "severity": old.get("severity") or "medium",
                "system": old.get("system") or system_for(code, None)[0],
                "systemKey": old.get("systemKey") or system_for(code, None)[1],
                "titleKey": old.get("titleKey") or f"dtc.{code}.title",
            }
        if old.get("bmw"):
            catalog[code]["bmw"] = True
        if old.get("tr"):
            catalog[code]["tr"] = old["tr"]
        if old.get("severity") in ("critical", "high") and catalog[code].get("severity") == "medium":
            catalog[code]["severity"] = old["severity"]

    filled = fill_missing_tr(catalog)
    if filled:
        print(f"Auto-translated tr for {filled} codes missing it")

    ordered = {k: catalog[k] for k in sorted(catalog.keys())}
    OUT.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(ordered)} codes → {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
