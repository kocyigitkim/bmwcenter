import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { useAppSettings, type FuelType } from "@/core/settings/appSettings";
import { useOBDStore } from "@/core/obd/obdService";
import { useGarage } from "@/core/vehicle/useGarage";
import { vehicleRepository, displayedOdometerKm } from "@/core/vehicle/vehicleRepository";
import { VehiclePickerSheet } from "@/components/VehiclePickerSheet";
import { ONBOARDING_STEPS, clampStep, isLastStep, stepAt } from "@/core/onboarding/onboardingState";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const [index, setIndex] = useState(() => clampStep(settings.onboardingStep));

  const step = stepAt(index);

  const go = useCallback(
    (next: number) => {
      const clamped = clampStep(next);
      setIndex(clamped);
      // Persisted so closing the app mid-setup resumes rather than restarts.
      settings.set("onboardingStep", clamped);
    },
    [settings]
  );

  const finish = useCallback(() => {
    settings.set("onboardingCompletedAt", Date.now());
    router.replace("/(tabs)");
  }, [router, settings]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.canvas }}
    >
      <View style={{ paddingTop: insets.top + DSSpace.s4, paddingHorizontal: DSSpace.screenEdge }}>
        <View style={styles.progressRow}>
          {ONBOARDING_STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressPip,
                {
                  backgroundColor: i <= index ? brandPrimary : colors.surface2,
                  flex: i === index ? 2 : 1,
                },
              ]}
            />
          ))}
        </View>
        <Text style={{ color: colors.contentTertiary, fontSize: 12, marginTop: DSSpace.s2 }}>
          {t("onboarding.stepCount", { current: index + 1, total: ONBOARDING_STEPS.length })}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: DSSpace.screenEdge,
          paddingTop: DSSpace.s5,
          paddingBottom: DSSpace.s8,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {step === "welcome" && <WelcomeStep />}
        {step === "adapter" && <AdapterStep />}
        {step === "vehicle" && <VehicleStep />}
        {step === "odometer" && <OdometerStep />}
        {step === "calibration" && <CalibrationStep />}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + DSSpace.s4, borderTopColor: colors.hairline },
        ]}
      >
        <Pressable onPress={index === 0 ? finish : () => go(index - 1)} hitSlop={8}>
          <Text style={{ color: colors.contentSecondary, fontWeight: "600" }}>
            {index === 0 ? t("onboarding.skipAll") : t("onboarding.back")}
          </Text>
        </Pressable>
        <Pressable
          onPress={isLastStep(index) ? finish : () => go(index + 1)}
          style={[styles.primaryButton, { backgroundColor: brandPrimary }]}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>
            {isLastStep(index) ? t("onboarding.finish") : t("onboarding.next")}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function StepHeader({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: DSSpace.s5 }}>
      <View style={[styles.stepIcon, { backgroundColor: withAlpha(brandPrimary, 0.14) }]}>
        <MaterialCommunityIcons name={icon} size={26} color={brandPrimary} />
      </View>
      <Text style={[styles.stepTitle, { color: colors.contentPrimary }]}>{title}</Text>
      <Text style={{ color: colors.contentSecondary, fontSize: 14, lineHeight: 21 }}>{body}</Text>
    </View>
  );
}

function WelcomeStep() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const settings = useAppSettings();

  const languages: Array<{ code: string; label: string }> = [
    { code: "tr", label: "Türkçe" },
    { code: "en", label: "English" },
  ];

  return (
    <>
      <StepHeader icon="car-connected" title={t("onboarding.welcome.title")} body={t("onboarding.welcome.body")} />
      <Text style={[styles.fieldLabel, { color: colors.contentSecondary }]}>{t("settings.language")}</Text>
      <View style={styles.segment}>
        {languages.map((lang) => {
          const active = (settings.languageCode || i18n.language).startsWith(lang.code);
          return (
            <Pressable
              key={lang.code}
              onPress={() => settings.set("languageCode", lang.code)}
              style={[
                styles.segmentItem,
                { backgroundColor: active ? brandPrimary : colors.surface1 },
              ]}
            >
              <Text style={{ color: active ? "#FFFFFF" : colors.contentPrimary, fontWeight: "600" }}>
                {lang.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.note, { color: colors.contentTertiary }]}>{t("onboarding.welcome.privacy")}</Text>
    </>
  );
}

function AdapterStep() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const connection = useOBDStore((s) => s.connection);
  const autoConnect = useOBDStore((s) => s.autoConnect);
  const devices = useOBDStore((s) => s.devices);
  const connect = useOBDStore((s) => s.connect);

  const connected = connection.status === "connected";
  const working = connection.status === "scanning" || connection.status === "connecting";

  return (
    <>
      <StepHeader icon="bluetooth" title={t("onboarding.adapter.title")} body={t("onboarding.adapter.body")} />

      <Pressable
        onPress={() => autoConnect()}
        disabled={working || connected}
        style={[
          styles.actionCard,
          { backgroundColor: colors.surface1, opacity: working ? 0.7 : 1 },
        ]}
      >
        <MaterialCommunityIcons
          name={connected ? "check-circle" : "bluetooth-connect"}
          size={22}
          color={connected ? colors.semNominal : brandPrimary}
        />
        <Text style={{ color: colors.contentPrimary, flex: 1, marginLeft: DSSpace.s3, fontWeight: "600" }}>
          {connected ? t("connection.connected") : t("onboarding.adapter.search")}
        </Text>
        {working && <ActivityIndicator size="small" />}
      </Pressable>

      {connection.status === "error" && (
        <Text style={[styles.note, { color: colors.semAttention }]}>
          {t(`connection.error.${connection.message}`, {
            defaultValue: t("connection.error.generic", { message: connection.message }),
          })}
        </Text>
      )}

      {!connected &&
        devices.map((device) => (
          <Pressable
            key={device.id}
            onPress={() => connect(device.id)}
            style={[styles.actionCard, { backgroundColor: colors.surface1 }]}
          >
            <MaterialCommunityIcons name="bluetooth" size={20} color={brandPrimary} />
            <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s3 }}>
              {device.name ?? device.id}
            </Text>
          </Pressable>
        ))}

      <Text style={[styles.note, { color: colors.contentTertiary }]}>{t("onboarding.adapter.skipHint")}</Text>
    </>
  );
}

function VehicleStep() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const settings = useAppSettings();
  const vehicles = useGarage((s) => s.vehicles);
  const activeId = useGarage((s) => s.activeId);
  const load = useGarage((s) => s.load);
  const [picking, setPicking] = useState(false);

  const active = vehicles.find((v) => v.id === activeId);

  /** Naming the car turns the app's placeholder into the user's own vehicle. */
  const rename = (name: string) => {
    settings.set("vehicleName", name);
    if (!active) return;
    vehicleRepository
      .update(active.id, { name: name || active.name, isSeeded: false })
      .then(() => load())
      .catch(() => undefined);
  };

  const setFuel = (fuelType: FuelType) => {
    settings.set("fuelType", fuelType);
    if (active) vehicleRepository.update(active.id, { fuelType }).then(() => load()).catch(() => undefined);
  };

  return (
    <>
      <StepHeader icon="car-info" title={t("onboarding.vehicle.title")} body={t("onboarding.vehicle.body")} />

      <Text style={[styles.fieldLabel, { color: colors.contentSecondary }]}>{t("onboarding.vehicle.name")}</Text>
      <TextInput
        defaultValue={settings.vehicleName}
        onChangeText={rename}
        placeholder={t("onboarding.vehicle.namePlaceholder")}
        placeholderTextColor={colors.contentTertiary}
        style={[styles.input, { backgroundColor: colors.surface1, color: colors.contentPrimary }]}
      />

      <Pressable
        onPress={() => setPicking(true)}
        style={[styles.actionCard, { backgroundColor: colors.surface1 }]}
      >
        <MaterialCommunityIcons name="car-select" size={20} color={brandPrimary} />
        <View style={{ flex: 1, marginLeft: DSSpace.s3 }}>
          <Text style={{ color: colors.contentPrimary, fontWeight: "600" }}>
            {t("onboarding.vehicle.pickModel")}
          </Text>
          <Text style={{ color: colors.contentTertiary, fontSize: 12 }}>
            {settings.vehicleMake || settings.vehicleModel
              ? `${settings.vehicleMake} ${settings.vehicleModel}`.trim()
              : t("onboarding.vehicle.pickModelHint")}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.contentTertiary} />
      </Pressable>

      <Text style={[styles.fieldLabel, { color: colors.contentSecondary }]}>{t("settings.fuelType")}</Text>
      <View style={styles.segment}>
        {(["gasoline", "diesel", "lpg"] as FuelType[]).map((fuel) => {
          const active2 = settings.fuelType === fuel;
          return (
            <Pressable
              key={fuel}
              onPress={() => setFuel(fuel)}
              style={[styles.segmentItem, { backgroundColor: active2 ? brandPrimary : colors.surface1 }]}
            >
              <Text style={{ color: active2 ? "#FFFFFF" : colors.contentPrimary, fontWeight: "600" }}>
                {t(`fuelType.${fuel}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {picking && (
        <VehiclePickerSheet
          visible
          onClose={() => setPicking(false)}
          onSelect={(make, entry) => {
            settings.set("vehicleMake", make);
            settings.set("vehicleModel", entry?.model ?? "");
            settings.set("vehicleProfileId", entry?.id ?? "");
            if (entry?.fuel) settings.set("fuelType", entry.fuel);
            if (entry?.displacementL != null) settings.set("displacementL", entry.displacementL);
            if (entry?.tankL != null) settings.set("tankCapacityL", entry.tankL);
            // The garage vehicle carries these too, and it is what every query
            // is scoped to — leaving it behind would make the profile a lie.
            if (active) {
              vehicleRepository
                .update(active.id, {
                  fuelType: entry?.fuel ?? active.fuelType,
                  displacementL: entry?.displacementL ?? active.displacementL,
                  tankCapacityL: entry?.tankL ?? active.tankCapacityL,
                })
                .then(() => load())
                .catch(() => undefined);
            }
            setPicking(false);
          }}
        />
      )}
    </>
  );
}

function OdometerStep() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const vehicles = useGarage((s) => s.vehicles);
  const activeId = useGarage((s) => s.activeId);
  const load = useGarage((s) => s.load);
  const active = vehicles.find((v) => v.id === activeId);
  const [text, setText] = useState(active ? String(Math.round(displayedOdometerKm(active))) : "");

  const commit = (value: string) => {
    setText(value);
    const entered = Number(value.replace(",", "."));
    if (!active || !Number.isFinite(entered)) return;
    // Stored as an offset so recorded distance keeps adding on top of the
    // reading the user typed, rather than replacing it.
    vehicleRepository
      .update(active.id, { odometerOffsetKm: entered - active.odometerKm })
      .then(() => load())
      .catch(() => undefined);
  };

  return (
    <>
      <StepHeader icon="counter" title={t("onboarding.odometer.title")} body={t("onboarding.odometer.body")} />
      <TextInput
        value={text}
        onChangeText={commit}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.contentTertiary}
        style={[styles.input, { backgroundColor: colors.surface1, color: colors.contentPrimary, fontSize: 22 }]}
      />
      <Text style={[styles.note, { color: colors.contentTertiary }]}>{t("onboarding.odometer.hint")}</Text>
    </>
  );
}

function CalibrationStep() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const points: Array<{ icon: IconName; key: string }> = [
    { icon: "gas-station", key: "onboarding.calibration.fuel" },
    { icon: "speedometer", key: "onboarding.calibration.speed" },
    { icon: "shield-check-outline", key: "onboarding.calibration.honesty" },
  ];

  return (
    <>
      <StepHeader
        icon="tune-variant"
        title={t("onboarding.calibration.title")}
        body={t("onboarding.calibration.body")}
      />
      {points.map((point) => (
        <View key={point.key} style={[styles.actionCard, { backgroundColor: colors.surface1 }]}>
          <MaterialCommunityIcons name={point.icon} size={20} color={brandPrimary} />
          <Text style={{ color: colors.contentSecondary, flex: 1, marginLeft: DSSpace.s3, fontSize: 13, lineHeight: 19 }}>
            {t(point.key)}
          </Text>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: "row", gap: 4 },
  progressPip: { height: 4, borderRadius: 2 },
  stepIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DSSpace.s4,
  },
  stepTitle: { fontSize: 26, fontWeight: "800", marginBottom: DSSpace.s2, letterSpacing: -0.4 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: DSSpace.s2, marginTop: DSSpace.s4 },
  segment: { flexDirection: "row", gap: DSSpace.s2 },
  segmentItem: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: DSRadius.card,
    alignItems: "center",
  },
  input: {
    borderRadius: DSRadius.card,
    paddingHorizontal: DSSpace.cardPadding,
    paddingVertical: 14,
    fontSize: 16,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
    marginTop: DSSpace.s3,
  },
  note: { fontSize: 12, lineHeight: 18, marginTop: DSSpace.s4 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: DSSpace.screenEdge,
    paddingTop: DSSpace.s4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryButton: { paddingHorizontal: 28, paddingVertical: 13, borderRadius: DSRadius.card },
});
