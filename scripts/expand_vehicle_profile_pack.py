#!/usr/bin/env python3
"""Expand VehicleProfilePack.json with universal archetypes, BMW migration ids, and catalog fields."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "mobile" / "assets" / "vehicleProfilePack.json"

ARCH_DEFAULTS = {
    "gasolineNA": {"tankL": 50, "displacementL": 1.6, "fuel": "gasoline"},
    "gasolineTurboDI": {"tankL": 50, "displacementL": 1.3, "fuel": "gasoline"},
    "gasolineTurboEuro": {"tankL": 55, "displacementL": 1.5, "fuel": "gasoline"},
    "dieselDPF": {"tankL": 55, "displacementL": 1.6, "fuel": "diesel"},
    "dieselHeavy": {"tankL": 80, "displacementL": 2.4, "fuel": "diesel"},
    "hybridFHEV": {"tankL": 43, "displacementL": 1.8, "fuel": "gasoline"},
    "mildHybrid48V": {"tankL": 50, "displacementL": 1.5, "fuel": "gasoline"},
    "ev": {"tankL": 0, "displacementL": 0, "fuel": "gasoline"},
}

# Per-id overrides for existing + new rows.
EXTRAS = {
    "renault.clio6.tce115": {
        "engineLabel": "TCe 115",
        "yearFrom": 2019,
        "yearTo": 2026,
        "tankL": 42,
        "displacementL": 1.3,
    },
    "renault.clio5.tce90": {
        "engineLabel": "TCe 90",
        "yearFrom": 2012,
        "yearTo": 2019,
        "tankL": 45,
        "displacementL": 0.9,
    },
    "renault.megane.tce140": {
        "engineLabel": "TCe 140",
        "yearFrom": 2016,
        "yearTo": 2026,
        "tankL": 50,
        "displacementL": 1.3,
    },
    "renault.megane.dci": {
        "engineLabel": "Blue dCi",
        "yearFrom": 2016,
        "yearTo": 2026,
        "tankL": 50,
        "displacementL": 1.5,
    },
    "renault.duster.mhev": {
        "engineLabel": "Mild hybrid",
        "yearFrom": 2022,
        "yearTo": 2026,
        "tankL": 50,
        "displacementL": 1.2,
    },
    "dacia.sandero.tce": {
        "engineLabel": "TCe",
        "yearFrom": 2021,
        "yearTo": 2026,
        "tankL": 50,
        "displacementL": 1.0,
    },
    "fiat.egea.fire95": {
        "engineLabel": "Fire 95",
        "yearFrom": 2015,
        "yearTo": 2026,
        "tankL": 45,
        "displacementL": 1.4,
    },
    "fiat.egea.multijet120": {
        "engineLabel": "Multijet 120",
        "yearFrom": 2015,
        "yearTo": 2026,
        "tankL": 45,
        "displacementL": 1.6,
    },
    "fiat.egea.t4hybrid": {
        "engineLabel": "T4 Hybrid",
        "yearFrom": 2020,
        "yearTo": 2026,
        "tankL": 50,
        "displacementL": 1.5,
    },
    "toyota.corolla.2zrfxe": {
        "engineLabel": "2ZR-FXE hybrid",
        "yearFrom": 2019,
        "yearTo": 2026,
        "tankL": 43,
        "displacementL": 1.8,
    },
    "toyota.corolla.m15a": {
        "engineLabel": "M15A-FKS 1.5",
        "yearFrom": 2019,
        "yearTo": 2026,
        "tankL": 50,
        "displacementL": 1.5,
    },
    "toyota.chr.hybrid": {
        "engineLabel": "Hybrid",
        "yearFrom": 2016,
        "yearTo": 2026,
        "tankL": 43,
        "displacementL": 1.8,
    },
    "toyota.yariscross.hybrid": {
        "engineLabel": "Hybrid",
        "yearFrom": 2021,
        "yearTo": 2026,
        "tankL": 36,
        "displacementL": 1.5,
    },
    "vw.taigo.tsi": {
        "engineLabel": "1.0 TSI",
        "yearFrom": 2021,
        "yearTo": 2026,
        "tankL": 40,
        "displacementL": 1.0,
    },
    "vw.polo.tsi": {
        "engineLabel": "1.0 TSI",
        "yearFrom": 2017,
        "yearTo": 2026,
        "tankL": 40,
        "displacementL": 1.0,
    },
    "vw.golf8.etsi": {
        "engineLabel": "1.5 eTSI",
        "yearFrom": 2020,
        "yearTo": 2026,
        "tankL": 50,
        "displacementL": 1.5,
    },
    "vw.passat.tsi2.0": {
        "engineLabel": "2.0 TSI",
        "yearFrom": 2015,
        "yearTo": 2026,
        "tankL": 66,
        "displacementL": 2.0,
    },
    "skoda.octavia.tsi": {
        "engineLabel": "1.5 TSI",
        "yearFrom": 2020,
        "yearTo": 2026,
        "tankL": 45,
        "displacementL": 1.5,
    },
    "audi.a3.tdi": {
        "engineLabel": "TDI",
        "yearFrom": 2013,
        "yearTo": 2026,
        "tankL": 50,
        "displacementL": 2.0,
    },
    "bmw.320i.b48": {
        "engineLabel": "B48 2.0 turbo",
        "yearFrom": 2015,
        "yearTo": 2024,
        "tankL": 60,
        "displacementL": 2.0,
        "pidPack": "bmwFSeries",
    },
    "bmw.520d.b47": {
        "engineLabel": "B47 2.0 diesel",
        "yearFrom": 2017,
        "yearTo": 2024,
        "tankL": 66,
        "displacementL": 2.0,
        "pidPack": "bmwFSeries",
    },
    "mercedes.c200.m254": {
        "engineLabel": "M254 mild hybrid",
        "yearFrom": 2021,
        "yearTo": 2026,
        "tankL": 66,
        "displacementL": 1.5,
    },
    "mercedes.a180d.om654q": {
        "engineLabel": "OM654q diesel",
        "yearFrom": 2018,
        "yearTo": 2026,
        "tankL": 43,
        "displacementL": 2.0,
    },
    "hyundai.i20.mpi": {
        "engineLabel": "1.4 MPI",
        "yearFrom": 2014,
        "yearTo": 2026,
        "tankL": 40,
        "displacementL": 1.4,
    },
    "hyundai.tucson.hev": {
        "engineLabel": "1.6 T-GDI hybrid",
        "yearFrom": 2021,
        "yearTo": 2026,
        "tankL": 52,
        "displacementL": 1.6,
    },
    "kia.sportage.tgdi": {
        "engineLabel": "1.6 T-GDI",
        "yearFrom": 2022,
        "yearTo": 2026,
        "tankL": 54,
        "displacementL": 1.6,
    },
    "peugeot.3008.puretech": {
        "engineLabel": "PureTech",
        "yearFrom": 2016,
        "yearTo": 2026,
        "tankL": 53,
        "displacementL": 1.2,
    },
    "opel.corsa.puretech": {
        "engineLabel": "1.2 PureTech",
        "yearFrom": 2019,
        "yearTo": 2026,
        "tankL": 44,
        "displacementL": 1.2,
    },
    "ford.focus.ecoboost": {
        "engineLabel": "1.5 EcoBoost",
        "yearFrom": 2018,
        "yearTo": 2026,
        "tankL": 52,
        "displacementL": 1.5,
    },
    "togg.t10x": {
        "engineLabel": "Electric",
        "yearFrom": 2023,
        "yearTo": 2026,
        "tankL": 0,
        "displacementL": 0,
    },
    "honda.civic.vtec": {
        "engineLabel": "VTEC turbo",
        "yearFrom": 2016,
        "yearTo": 2026,
        "tankL": 47,
        "displacementL": 1.5,
    },
    "honda.civic.ehev": {
        "engineLabel": "e:HEV",
        "yearFrom": 2022,
        "yearTo": 2026,
        "tankL": 40,
        "displacementL": 2.0,
    },
    "nissan.qashqai.digt": {
        "engineLabel": "1.3 DIG-T",
        "yearFrom": 2021,
        "yearTo": 2026,
        "tankL": 55,
        "displacementL": 1.3,
    },
    "suzuki.vitara.boosterjet": {
        "engineLabel": "Boosterjet",
        "yearFrom": 2015,
        "yearTo": 2026,
        "tankL": 47,
        "displacementL": 1.4,
    },
    "ford.ecoblue": {
        "engineLabel": "2.0 EcoBlue",
        "yearFrom": 2016,
        "yearTo": 2026,
        "tankL": 80,
        "displacementL": 2.0,
    },
    "volvo.xc40.b4mhev": {
        "engineLabel": "B4 mild hybrid",
        "yearFrom": 2018,
        "yearTo": 2026,
        "tankL": 54,
        "displacementL": 2.0,
    },
    "seat.leon.tsi": {
        "engineLabel": "1.5 TSI",
        "yearFrom": 2020,
        "yearTo": 2026,
        "tankL": 45,
        "displacementL": 1.5,
    },
    "chery.tiggo8pro": {
        "engineLabel": "1.6 TGDI",
        "yearFrom": 2021,
        "yearTo": 2026,
        "tankL": 51,
        "displacementL": 1.6,
    },
    "mg.zs.vti": {
        "engineLabel": "1.5 VTi",
        "yearFrom": 2018,
        "yearTo": 2026,
        "tankL": 45,
        "displacementL": 1.5,
    },
    "mitsubishi.l200.did": {
        "engineLabel": "2.4 DI-D",
        "yearFrom": 2015,
        "yearTo": 2026,
        "tankL": 75,
        "displacementL": 2.4,
    },
}


def model(
    id: str,
    make: str,
    model_name: str,
    match_model: list[str],
    match_engine: list[str],
    archetype: str,
    tstat: float,
    map_controlled: bool,
    cap_bar: float,
    battery: str,
    smart_alt: bool,
    confidence: str,
    engine_label: str,
    *,
    year_from: int | None = None,
    year_to: int | None = None,
    tank: float | None = None,
    disp: float | None = None,
    fuel: str | None = None,
    pid_pack: str | None = None,
    flags: list[str] | None = None,
) -> dict:
    d = ARCH_DEFAULTS[archetype]
    row = {
        "id": id,
        "make": make,
        "model": model_name,
        "matchModel": match_model,
        "matchEngine": match_engine,
        "archetype": archetype,
        "tstat": tstat,
        "mapControlled": map_controlled,
        "capBar": cap_bar,
        "batteryChem": battery,
        "smartAlternator": smart_alt,
        "confidence": confidence,
        "engineLabel": engine_label,
        "tankL": tank if tank is not None else d["tankL"],
        "displacementL": disp if disp is not None else d["displacementL"],
        "fuel": fuel if fuel is not None else d["fuel"],
        "pidPack": pid_pack or "universal",
    }
    if year_from is not None:
        row["yearFrom"] = year_from
    if year_to is not None:
        row["yearTo"] = year_to
    if flags:
        row["flags"] = flags
    return row


UNIVERSAL = [
    model(
        "universal.obd2", "Universal", "Any car", ["any car", "unknown vehicle"],
        ["obd2"], "gasolineNA", 87, False, 1.1, "flooded", False, "C",
        "Standard OBD-II", tank=50, disp=1.6,
    ),
    model(
        "universal.gasolineNA", "Universal", "Gasoline", ["gasoline"],
        ["na"], "gasolineNA", 87, False, 1.1, "flooded", False, "C",
        "Naturally aspirated",
    ),
    model(
        "universal.gasolineTurboDI", "Universal", "Gasoline", ["gasoline"],
        ["turbo"], "gasolineTurboDI", 90, False, 1.4, "efb", True, "C",
        "Turbo",
    ),
    model(
        "universal.dieselDPF", "Universal", "Diesel", ["diesel"],
        ["dpf"], "dieselDPF", 82, False, 1.4, "efb", True, "C",
        "Turbo diesel (DPF)",
    ),
    model(
        "universal.hybridFHEV", "Universal", "Hybrid", ["hybrid"],
        ["hybrid"], "hybridFHEV", 82, False, 1.1, "agm", False, "C",
        "Full hybrid",
    ),
    model(
        "universal.ev", "Universal", "Electric", ["ev", "electric"],
        ["ev"], "ev", 0, False, 1.2, "lithium", False, "B",
        "Battery electric", flags=["noICE"],
    ),
]

BMW_MIGRATION = [
    model(
        "bmw.f30.n13", "BMW", "3 Series F30",
        ["f30", "316i", "3 series"], ["n13"],
        "gasolineTurboEuro", 97, True, 2.0, "agm", True, "A",
        "N13 1.6 turbo", year_from=2012, year_to=2015, tank=60, disp=1.6,
        pid_pack="bmwF30N13",
    ),
    model(
        "bmw.fseries", "BMW", "F-series",
        ["f-series", "fseries", "f20", "f21", "f22", "f31", "f32", "f10", "f11"],
        ["n20", "n55", "b48", "b58", "n47", "b47"],
        "gasolineTurboEuro", 100, True, 2.0, "agm", True, "A",
        "F-series (Mode 22)", year_from=2011, year_to=2019, tank=60, disp=2.0,
        pid_pack="bmwFSeries",
    ),
]

EXTRA_MODELS = [
    model(
        "toyota.rav4.hybrid", "Toyota", "RAV4", ["rav4"], ["hybrid"],
        "hybridFHEV", 82, False, 1.1, "agm", False, "A",
        "Hybrid", year_from=2019, year_to=2026, tank=55, disp=2.5,
    ),
    model(
        "vw.golf.tdi", "Volkswagen", "Golf", ["golf"], ["tdi", "ea288"],
        "dieselDPF", 87, True, 1.6, "agm", True, "B",
        "TDI", year_from=2013, year_to=2026, tank=50, disp=2.0,
    ),
    model(
        "honda.accord.na", "Honda", "Accord", ["accord"], ["2.0", "k20"],
        "gasolineNA", 78, False, 1.1, "flooded", False, "B",
        "2.0 NA", year_from=2013, year_to=2022, tank=56, disp=2.0,
    ),
    model(
        "ford.fiesta.ecoboost", "Ford", "Fiesta", ["fiesta"], ["ecoboost", "1.0"],
        "gasolineTurboDI", 88, False, 1.4, "efb", True, "B",
        "1.0 EcoBoost", year_from=2013, year_to=2023, tank=42, disp=1.0,
    ),
    model(
        "hyundai.i30.mpi", "Hyundai", "i30", ["i30"], ["1.6mpi", "mpi"],
        "gasolineNA", 82, False, 1.1, "flooded", False, "B",
        "1.6 MPI", year_from=2012, year_to=2026, tank=50, disp=1.6,
    ),
    model(
        "chevrolet.cruze.na", "Chevrolet", "Cruze", ["cruze"], ["1.4", "1.6"],
        "gasolineNA", 87, False, 1.1, "flooded", False, "C",
        "1.6 NA", year_from=2011, year_to=2019, tank=52, disp=1.6,
    ),
    model(
        "mazda.cx5.skyactiv", "Mazda", "CX-5", ["cx-5", "cx5"], ["skyactiv"],
        "gasolineNA", 82, False, 1.1, "flooded", False, "B",
        "Skyactiv-G", year_from=2017, year_to=2026, tank=56, disp=2.0,
    ),
    model(
        "tesla.model3", "Tesla", "Model 3", ["model 3", "model3"], ["ev"],
        "ev", 0, False, 1.2, "lithium", False, "B",
        "Electric", year_from=2017, year_to=2026, flags=["noICE"],
    ),
    model(
        "mini.cooper.b48", "Mini", "Cooper", ["cooper", "f56"], ["b48", "b38"],
        "gasolineTurboEuro", 100, True, 2.0, "agm", True, "B",
        "B38/B48 turbo", year_from=2014, year_to=2024, tank=44, disp=1.5,
    ),
    model(
        "citroen.c3.puretech", "Citroën", "C3", ["c3"], ["puretech"],
        "gasolineTurboDI", 90, False, 1.4, "efb", True, "B",
        "PureTech", year_from=2016, year_to=2026, tank=45, disp=1.2,
        flags=["wetTimingBelt"],
    ),
    model(
        "lexus.nx.hybrid", "Lexus", "NX", ["nx"], ["hybrid"],
        "hybridFHEV", 82, False, 1.1, "agm", False, "A",
        "Hybrid", year_from=2014, year_to=2026, tank=56, disp=2.5,
    ),
    model(
        "jeep.compass.na", "Jeep", "Compass", ["compass"], ["2.4", "tigershark"],
        "gasolineNA", 87, False, 1.1, "flooded", False, "C",
        "2.4 NA", year_from=2017, year_to=2026, tank=60, disp=2.4,
    ),
    model(
        "subaru.forester.na", "Subaru", "Forester", ["forester"], ["fb25", "2.5"],
        "gasolineNA", 82, False, 1.1, "flooded", False, "B",
        "2.5 NA", year_from=2013, year_to=2026, tank=63, disp=2.5,
    ),
    model(
        "alfa.giulia.2.0", "Alfa Romeo", "Giulia", ["giulia"], ["2.0", "gme"],
        "gasolineTurboDI", 90, False, 1.4, "agm", True, "B",
        "2.0 turbo", year_from=2016, year_to=2026, tank=58, disp=2.0,
    ),
    model(
        "porsche.macan.turbo", "Porsche", "Macan", ["macan"], ["3.0", "turbo"],
        "gasolineTurboEuro", 95, True, 1.6, "agm", True, "C",
        "Turbo", year_from=2014, year_to=2026, tank=65, disp=3.0,
    ),
    model(
        "landrover.discovery.diesel", "Land Rover", "Discovery Sport",
        ["discovery"], ["ingenuim", "td4"],
        "dieselDPF", 82, False, 1.4, "agm", True, "B",
        "TD4 diesel", year_from=2015, year_to=2026, tank=65, disp=2.0,
    ),
    model(
        "jaguar.xe.diesel", "Jaguar", "XE", ["xe"], ["ingenuim", "20d"],
        "dieselDPF", 82, False, 1.4, "agm", True, "B",
        "2.0 diesel", year_from=2015, year_to=2024, tank=56, disp=2.0,
    ),
]

NEW_BRANDS = [
    {"make": "Chevrolet", "archetype": "gasolineNA", "tstat": 87, "mapControlled": False, "capBar": 1.1, "batteryChem": "flooded", "smartAlternator": False, "confidence": "C"},
    {"make": "Mazda", "archetype": "gasolineNA", "tstat": 82, "mapControlled": False, "capBar": 1.1, "batteryChem": "flooded", "smartAlternator": False, "confidence": "B"},
    {"make": "Subaru", "archetype": "gasolineNA", "tstat": 82, "mapControlled": False, "capBar": 1.1, "batteryChem": "flooded", "smartAlternator": False, "confidence": "B"},
    {"make": "Jeep", "archetype": "gasolineNA", "tstat": 87, "mapControlled": False, "capBar": 1.1, "batteryChem": "flooded", "smartAlternator": False, "confidence": "C"},
    {"make": "Tesla", "archetype": "ev", "tstat": 0, "mapControlled": False, "capBar": 1.2, "batteryChem": "lithium", "smartAlternator": False, "confidence": "B"},
    {"make": "Porsche", "archetype": "gasolineTurboEuro", "tstat": 95, "mapControlled": True, "capBar": 1.6, "batteryChem": "agm", "smartAlternator": True, "confidence": "C"},
    {"make": "Land Rover", "archetype": "dieselDPF", "tstat": 82, "mapControlled": False, "capBar": 1.4, "batteryChem": "agm", "smartAlternator": True, "confidence": "B"},
    {"make": "Jaguar", "archetype": "dieselDPF", "tstat": 82, "mapControlled": False, "capBar": 1.4, "batteryChem": "agm", "smartAlternator": True, "confidence": "B"},
    {"make": "Alfa Romeo", "archetype": "gasolineTurboDI", "tstat": 90, "mapControlled": False, "capBar": 1.4, "batteryChem": "agm", "smartAlternator": True, "confidence": "B"},
    {"make": "Mitsubishi", "archetype": "dieselHeavy", "tstat": 80, "mapControlled": False, "capBar": 1.4, "batteryChem": "flooded", "smartAlternator": False, "confidence": "B"},
    {"make": "Universal", "archetype": "gasolineNA", "tstat": 87, "mapControlled": False, "capBar": 1.1, "batteryChem": "flooded", "smartAlternator": False, "confidence": "C"},
]


def enrich(row: dict) -> dict:
    extras = EXTRAS.get(row["id"], {})
    arch = row["archetype"]
    defaults = ARCH_DEFAULTS[arch]
    out = dict(row)
    out["engineLabel"] = extras.get("engineLabel") or (row["matchEngine"][0] if row.get("matchEngine") else arch)
    if "yearFrom" in extras:
        out["yearFrom"] = extras["yearFrom"]
    if "yearTo" in extras:
        out["yearTo"] = extras["yearTo"]
    out["tankL"] = extras.get("tankL", defaults["tankL"])
    out["displacementL"] = extras.get("displacementL", defaults["displacementL"])
    out["fuel"] = extras.get("fuel", defaults["fuel"])
    out["pidPack"] = extras.get("pidPack", "universal")
    return out


def main() -> None:
    data = json.loads(PACK.read_text())
    existing = [enrich(m) for m in data["models"]]
    existing_ids = {m["id"] for m in existing}

    # Insert BMW migration profiles just before the first BMW model.
    bmw_idx = next(i for i, m in enumerate(existing) if m["make"] == "BMW")
    for row in reversed(BMW_MIGRATION):
        if row["id"] not in existing_ids:
            existing.insert(bmw_idx, row)
            existing_ids.add(row["id"])

    extras = [m for m in EXTRA_MODELS if m["id"] not in existing_ids]
    universals = [m for m in UNIVERSAL if m["id"] not in existing_ids]
    models = universals + existing + extras

    brands = list(data["brands"])
    have = {b["make"] for b in brands}
    for b in NEW_BRANDS:
        if b["make"] not in have:
            brands.append(b)
            have.add(b["make"])

    out = {
        "schemaVersion": 3,
        "packVersion": "2026.08.2",
        "models": models,
        "brands": brands,
    }
    PACK.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    makes = {}
    for m in models:
        makes[m["make"]] = makes.get(m["make"], 0) + 1
    print(f"models={len(models)} brands={len(brands)}")
    for k, v in sorted(makes.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
