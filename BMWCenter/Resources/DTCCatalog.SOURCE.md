# DTCCatalog sources

Built from public open datasets (offline bundle for the app):

1. **OBDex** (CC0) — https://github.com/foerbsnavi/obdex — SAE J2012 generic families P0/P2/P3/B0/C0/U0/U3 enriched English titles.
2. **Wal33D dtc-database** (open) — https://github.com/Wal33D/dtc-database — GENERIC gap-fill + BMW manufacturer-specific codes.
3. Prior in-app entries — Turkish (`tr`) strings and BMW flags preserved where present.

Regenerate:

```bash
python3 scripts/build_dtc_catalog.py
```
