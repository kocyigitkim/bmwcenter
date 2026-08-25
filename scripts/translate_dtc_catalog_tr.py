#!/usr/bin/env python3
"""Fill missing `tr` fields in QuickCar/Resources/DTCCatalog.json.

DTC descriptions follow the SAE J2012 generic-code vocabulary very closely
(component name + fault type + position, e.g. "Circuit High", "Bank 1
Sensor 2", "Range/Performance") so a phrase/term substitution table covers
the large majority of the ~9.9k catalog without needing a real MT model.

Idempotent: entries that already have a non-empty `tr` are left untouched
(preserves hand-curated translations). Safe to re-run after the catalog is
regenerated from upstream sources (`build_dtc_catalog.py` calls this too).

Usage:
    python3 scripts/translate_dtc_catalog_tr.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "QuickCar/Resources/DTCCatalog.json"

# Longest / most specific phrases first — matched and substituted in this
# order, so e.g. "Circuit Range/Performance" is consumed before the bare
# "Circuit" or "Range/Performance" rules would fire on its leftovers.
PHRASES: list[tuple[str, str]] = [
    # Fault-type compounds (order matters: most specific first)
    ("Circuit Range/Performance", "Devre Aralık/Performans Hatası"),
    ("Circuit Intermittent/Erratic", "Devre Aralıklı/Tutarsız Sinyal"),
    ("Circuit Intermittent", "Devre Aralıklı Sinyal"),
    ("Circuit Low", "Devre Düşük Sinyal"),
    ("Circuit High", "Devre Yüksek Sinyal"),
    ("Circuit/Open", "Devre/Açık Devre"),
    ("Circuit Open", "Devre Açık"),
    ("Circuit Short", "Devre Kısa Devre"),
    ("Range/Performance", "Aralık/Performans Hatası"),
    ("Intermittent/Erratic", "Aralıklı/Tutarsız Sinyal"),
    ("Performance/Stuck", "Performans/Takılı Kalma"),
    ("Sensor/Switch", "Sensörü/Anahtarı"),
    ("Throttle/Pedal", "Gaz Kelebeği/Pedal"),
    ("Hybrid/EV", "Hibrit/Elektrikli"),
    ("Turbocharger/Supercharger", "Turbo/Kompresör"),
    ("Electric/Auxiliary", "Elektrikli/Yardımcı"),
    ("DC/DC", "DC/DC"),
    ("Stuck Open", "Açık Takılı Kaldı"),
    ("Stuck Closed", "Kapalı Takılı Kaldı"),
    ("Not Plausible", "Tutarsız/Mantıksız"),
    ("Too Low", "Çok Düşük"),
    ("Too High", "Çok Yüksek"),
    ("Control Module", "Kontrol Modülü"),
    ("Lost Communication With", "İletişim Kesildi:"),
    ("Lost Communication with", "İletişim Kesildi:"),
    ("Invalid Data Received From", "Geçersiz Veri Alındı:"),
    ("Correlation", "Korelasyon Hatası"),
    ("First Row", "Birinci Sıra"),
    ("Second Row", "İkinci Sıra"),
    ("Third Row", "Üçüncü Sıra"),
    ("Steering Effort", "Direksiyon Kuvveti"),
    ("Steering Wheel", "Direksiyon Simidi"),
    ("Wheel Speed", "Teker Hızı"),
    ("Seat Belt", "Emniyet Kemeri"),
    ("Fuel Rail", "Yakıt Rayı"),
    ("Glow Plug", "Kızdırma Bujisi"),
    ("Grille Shutter", "Panjur"),
    ("Rocker Arm", "Külbütör Kolu"),
    ("Drive Motor", "Tahrik Motoru"),
    ("Air-Fuel", "Hava-Yakıt"),
    ("A/C", "Klima"),
    ("Bank 1", "Sıra 1"),
    ("Bank 2", "Sıra 2"),
    ("Cylinder Deactivation", "Silindir Devre Dışı Bırakma"),
    ("Deactivation/Intake", "Devre Dışı Bırakma/Emme"),
]

# Single-word / short-token dictionary — applied after PHRASES, whole-word,
# case-insensitive. Turkish suffix chosen to read reasonably as a noun
# ("Sensor" -> "Sensörü") since these compose into short technical titles.
WORDS: dict[str, str] = {
    "Circuit": "Devre", "Sensor": "Sensörü", "Control": "Kontrolü",
    "High": "Yüksek", "Low": "Düşük", "Bank": "Sıra", "Module": "Modülü",
    "Position": "Pozisyonu", "Battery": "Akü", "Temperature": "Sıcaklığı",
    "Pressure": "Basıncı", "Cylinder": "Silindir", "Fuel": "Yakıt",
    "Performance": "Performans", "Voltage": "Voltajı", "Valve": "Valfi",
    "Communication": "İletişim", "System": "Sistemi", "Motor": "Motoru",
    "Lost": "Kesildi", "Coolant": "Soğutma Suyu", "Actuator": "Aktüatörü",
    "Pump": "Pompası", "With": "ile", "Air": "Hava", "Current": "Akımı",
    "or": "veya", "Solenoid": "Solenoidi", "Data": "Veri",
    "Received": "Alındı", "the": "", "The": "", "Open": "Açık",
    "Too": "Çok", "Engine": "Motor", "Drive": "Tahrik", "Exhaust": "Egzoz",
    "From": "kaynaklı", "Shift": "Vites Değişimi", "Transmission": "Şanzıman",
    "Sense": "Algılama", "Brake": "Fren", "Heater": "Isıtıcı",
    "Switch": "Anahtarı", "Injector": "Enjektörü", "Camshaft": "Eksantrik Mili",
    "Speed": "Hız", "Reductant": "İndirgen Sıvı (AdBlue)", "Pack": "Paketi",
    "Clutch": "Debriyaj", "Supply": "Besleme", "Signal": "Sinyal",
    "Injection": "Enjeksiyon", "Intake": "Emme", "Flow": "Akış",
    "Fluid": "Sıvı", "Bypass": "Baypas", "Gear": "Vites",
    "Off": "Kapalı", "is": "", "in": "", "a": "", "Driver": "Sürücü",
    "Rear": "Arka", "Active": "Aktif", "Correlation": "Korelasyon",
    "EGR": "EGR", "Right": "Sağ", "NOx": "NOx", "Malfunction": "Arıza",
    "Bus": "Veri Yolu", "Limit": "Limit", "Tank": "Depo", "Wheel": "Teker",
    "Front": "Ön", "Left": "Sol", "Ignition": "Ateşleme", "Vehicle": "Araç",
    "Start": "Kontak/Marş", "Door": "Kapı", "Generator": "Alternatör",
    "Charge": "Şarj", "Converter": "Dönüştürücü", "control": "kontrol",
    "Cooler": "Soğutucu", "Turbocharger": "Turboşarj",
    "Supercharger": "Kompresör", "EVAP": "EVAP", "DTC": "Arıza Kodu",
    "Contactor": "Kontaktör", "Throttle": "Gaz Kelebeği",
    "Compressor": "Kompresör", "Fan": "Fan", "Electronics": "Elektronik",
    "Particulate": "Partikül", "Over": "Aşırı", "from": "kaynaklı",
    "Boost": "Turbo Basıncı", "Hydraulic": "Hidrolik", "Cooling": "Soğutma",
    "Mode": "Mod", "Learning": "Öğrenme", "Steering": "Direksiyon",
    "Incompatibility": "Uyumsuzluk", "Software": "Yazılım", "Park": "Park",
    "Profile": "Profil", "Not": "Değil", "Detected": "Algılandı",
    "Interlock": "Kilitleme", "Manifold": "Manifold", "Booster": "Güçlendirici",
    "Pedal": "Pedal", "Fault": "Arıza", "has": "", "Oil": "Yağ",
    "Outlet": "Çıkış", "Refrigerant": "Soğutucu Gaz", "Regulator": "Regülatör",
    "Trim": "Yakıt Trimi", "Cell": "Hücre", "Leak": "Kaçak",
    "condition": "durum", "Inlet": "Giriş", "Reference": "Referans",
    "Interface": "Arayüz", "Lean": "Fakir (Yakıt)", "Filter": "Filtre",
    "Aerodynamic": "Aerodinamik", "Feature": "Özellik", "Torque": "Tork",
    "Incorrect": "Hatalı", "Electrical": "Elektriksel", "Coil": "Bobini",
    "Balancing": "Dengeleme", "Detection": "Algılama", "Ion": "İyon",
    "Deactivation": "Devre Dışı Bırakma", "Fork": "Çatal", "Lock": "Kilit",
    "Response": "Tepki", "Passenger": "Yolcu", "WD/AWD": "4x4/AWD",
    "Misfire": "Ateşleme Kaçırma", "Loop": "Döngü", "pressure": "basınç",
    "Grille": "Panjur", "Shutter": "Panjur", "Coupler": "Kaplin",
    "Belt": "Kayış", "Exceeded": "Aşıldı", "Slow": "Yavaş", "Cruise": "Hız Sabitleyici",
    "fuel": "yakıt", "Diesel": "Dizel", "Idle": "Rölanti", "Request": "İstek",
    "Shaft": "Mil", "Switching": "Anahtarlama", "Restraints": "Emniyet Sistemleri",
    "Purge": "Temizleme", "Aftertreatment": "Egzoz Sonrası İşlem",
    "Rocker": "Külbütör", "Arm": "Kol", "Lamp": "Lamba", "Learned": "Öğrenilmiş",
    "cylinder": "silindir", "During": "sırasında", "Vacuum": "Vakum",
    "Indicator": "Gösterge", "shift": "vites", "Element": "Eleman",
    "Lever": "Kol", "Threshold": "Eşik", "Erratic": "Tutarsız",
    "commanded": "komut verilen", "Time": "Süre", "Disconnect": "Bağlantı Kesik",
    "Imbalance": "Dengesizlik", "window": "cam", "Error": "Hata",
    "short": "kısa devre", "battery": "akü", "Friction": "Sürtünme",
    "Metering": "Ölçümleme", "Starter": "Marş Motoru", "motor": "motor",
    "Rail": "Ray", "trim": "trim", "Row": "Sıra", "input": "giriş",
    "limit": "limit", "Volume": "Hacim", "CAN": "CAN", "Pulse": "Darbe",
    "Runner": "Emme Kanalı", "Pumping": "Pompalama", "Generic": "Genel",
    "Distribution": "Dağıtım", "HO": "HO", "Pilot": "Pilot",
    "detects": "algılıyor", "HVAC": "İklimlendirme", "for": "için",
    "as": "olarak", "Positive": "Pozitif", "Negative": "Negatif",
    "Unit": "Ünite", "Secondary": "İkincil", "signal": "sinyal",
    "electrical": "elektriksel", "at": "seviyesinde", "voltage": "voltaj",
    "Side": "Taraf", "Ratio": "Oran", "Offset": "Ofset", "Select": "Seçim",
    "expected": "beklenen", "an": "", "and": "ve", "be": "olma",
    "cannot": "sağlanamıyor", "solenoid": "solenoid", "open": "açık",
    "sensor": "sensör", "to": "-e", "reliably": "güvenilir şekilde",
    "of": "-in", "internal": "iç", "Internal": "İç", "G": "G",
    "ABS": "ABS", "Cold": "Soğuk", "Timing": "Zamanlama", "Catalyst": "Katalizör",
    "Level": "Seviyesi", "Output": "Çıkış", "Gas": "Gaz", "Closed": "Kapalı",
    "On": "Açık", "reports": "bildiriyor", "on": "üzerinde", "in ": " ",
    "with": "ile", "Deployment": "Patlatma", "detected": "algılandı",
    "Seat": "Koltuk", "Charging": "Şarj Olma", "Inverter": "İnvertör",
    "Plug": "Buji", "this": "bu", "channel": "kanal",
    "missing": "eksik", "implausible": "tutarsız", "or missing signal": "ya da eksik bir sinyal",
    "Stuck": "Takılı Kaldı", "Input": "Giriş", "Alternative": "Alternatif",
    "Power": "Güç", "Range": "Aralık", "Phase": "Faz", "Charger": "Şarj Cihazı",
    "Relay": "Röle", "Water": "Su", "Condition": "Durumu", "MIL": "Arıza Lambası (MIL)",
    "Illumination": "Yanması", "Requested": "İstendi", "Long": "Uzun",
    "Longer": "Daha Uzun", "longer": "daha uzun", "Stop": "Durdurma",
    "PWM": "PWM", "Header": "Başlık Hattı", "Drain": "Tahliye",
    "Modulation": "Modülasyonu", "valves": "valfleri", "valve": "valf",
    "faulty": "arızalı", "took": "sürdü", "than": "-den", "Anode": "Anot",
    "Ozone": "Ozon", "Reduction": "İndirgeme", "Direct": "Doğrudan",
    "Lift": "Kaldırma", "Cap": "Kapak", "Audible": "Sesli", "Alert": "Uyarı",
}

# Regex that matches any dictionary key as a whole word/phrase, case-insensitively,
# longest key first so multi-word phrases never get shadowed by their sub-words.
_ALL_TERMS = sorted(
    {k for k, _ in PHRASES} | set(WORDS.keys()),
    key=lambda s: (-len(s.split()), -len(s)),
)
_TERM_TO_TR = {k: v for k, v in PHRASES}
_TERM_TO_TR.update(WORDS)
_PATTERN = re.compile(
    r"(?<![A-Za-zÇĞİÖŞÜçğıöşü])(" + "|".join(re.escape(t) for t in _ALL_TERMS) + r")(?![A-Za-zÇĞİÖŞÜçğıöşü])"
)


def translate(en: str) -> str:
    """Best-effort term-substitution translation. Leaves unmatched English
    fragments in place — a partial Turkish/English hybrid still beats a
    fully untranslated string, and the catalog schema already treats `en`
    as the fallback when `tr` is absent."""

    def repl(m: re.Match) -> str:
        term = m.group(1)
        tr = _TERM_TO_TR.get(term)
        if tr is None:
            tr = _TERM_TO_TR.get(term.capitalize(), term)
        return tr

    out = _PATTERN.sub(repl, en)
    out = re.sub(r"\s{2,}", " ", out).strip()
    out = re.sub(r"\s+([.,:;])", r"\1", out)
    return out


def fill_missing_tr(catalog: dict[str, dict]) -> int:
    """Mutates `catalog` in place, filling `tr` for entries missing it.
    Returns the number of entries filled."""
    filled = 0
    for entry in catalog.values():
        if entry.get("tr"):
            continue
        en = entry.get("en")
        if not en:
            continue
        entry["tr"] = translate(en)
        filled += 1
    return filled


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text())
    filled = fill_missing_tr(catalog)
    ordered = {k: catalog[k] for k in sorted(catalog.keys())}
    CATALOG_PATH.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")
    print(f"Filled tr for {filled} entries -> {CATALOG_PATH}")


if __name__ == "__main__":
    main()
