import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import {
  MAINTENANCE_TEMPLATES,
  currentOdometerKm,
  maintenanceRepository,
  type ScheduledMaintenanceItem,
} from "@/core/storage/maintenanceRepository";
import { isActionable, type DueStatus } from "@/core/maintenance/maintenanceSchedule";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const ITEM_ICON: Record<string, IconName> = {
  "maintenance.oilChange": "oil",
  "maintenance.oilFilter": "oil-level",
  "maintenance.brakeFluid": "car-brake-fluid-level",
  "maintenance.brakePads": "car-brake-worn-linings",
  "maintenance.airFilter": "air-filter",
  "maintenance.cabinFilter": "air-conditioner",
  "maintenance.fuelFilter": "fuel",
  "maintenance.sparkPlugs": "flash",
  "maintenance.coolant": "coolant-temperature",
  "maintenance.tyreRotation": "tire",
  "maintenance.transmissionOil": "car-shift-pattern",
  "maintenance.timingBelt": "cog-transfer",
  "maintenance.inspection": "clipboard-check-outline",
};

export default function MaintenanceScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const [items, setItems] = useState<ScheduledMaintenanceItem[]>([]);
  const [editing, setEditing] = useState<ScheduledMaintenanceItem | undefined>();
  const [picking, setPicking] = useState(false);

  const reload = useCallback(async () => {
    await maintenanceRepository.ensureDefaults();
    setItems(await maintenanceRepository.schedule());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload().catch(() => undefined);
    }, [reload])
  );

  const odometerKm = currentOdometerKm();
  const attention = items.filter((i) => i.isEnabled && isActionable(i.due.status));

  const statusColor = (status: DueStatus) => {
    switch (status) {
      case "overdue":
        return colors.semCritical;
      case "due":
        return colors.semAttention;
      case "soon":
        return brandPrimary;
      case "ok":
        return colors.semNominal;
      case "unknown":
        return colors.contentTertiary;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("maintenance.title")}</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => setPicking(true)} hitSlop={8}>
            <MaterialCommunityIcons name="plus" size={26} color={brandPrimary} />
          </Pressable>
        </View>

        <View
          style={[
            styles.summary,
            {
              backgroundColor: colors.surface1,
              borderLeftColor: attention.length > 0 ? colors.semAttention : colors.semNominal,
            },
          ]}
        >
          <Text style={{ color: colors.contentPrimary, fontSize: 16, fontWeight: "700" }}>
            {attention.length > 0
              ? t("maintenance.needsAttention", { count: attention.length })
              : t("maintenance.allGood")}
          </Text>
          <Text style={{ color: colors.contentSecondary, fontSize: 12, marginTop: 2 }}>
            {t("maintenance.measuredAgainst", { odometer: Formatters.odometer(odometerKm, settings) })}
          </Text>
        </View>

        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            color={statusColor(item.due.status)}
            onPress={() => setEditing(item)}
            onDone={() => maintenanceRepository.markDone(item.id).then(reload)}
          />
        ))}

        <Text style={[styles.footnote, { color: colors.contentTertiary }]}>{t("maintenance.footnote")}</Text>
      </ScrollView>

      {editing && (
        <ItemEditor
          item={editing}
          odometerKm={odometerKm}
          onClose={() => setEditing(undefined)}
          onChanged={() => reload().catch(() => undefined)}
        />
      )}

      {picking && (
        <TemplatePicker
          existing={items.map((i) => i.titleKey)}
          onClose={() => setPicking(false)}
          onAdded={() => reload().catch(() => undefined)}
        />
      )}
    </View>
  );
}

function ItemCard({
  item,
  color,
  onPress,
  onDone,
}: {
  item: ScheduledMaintenanceItem;
  color: string;
  onPress: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const settings = useAppSettings();
  const dimmed = !item.isEnabled;

  const subtitle = useMemo(() => {
    const { status, remainingKm, remainingDays, driver } = item.due;
    if (status === "unknown") return t("maintenance.neverDone");
    if (driver === "distance" && remainingKm != null) {
      return remainingKm >= 0
        ? t("maintenance.dueInDistance", { distance: Formatters.odometer(remainingKm, settings) })
        : t("maintenance.overdueByDistance", { distance: Formatters.odometer(-remainingKm, settings) });
    }
    if (remainingDays != null) {
      const days = Math.round(Math.abs(remainingDays));
      return remainingDays >= 0
        ? t("maintenance.dueInDays", { count: days })
        : t("maintenance.overdueByDays", { count: days });
    }
    return t("maintenance.neverDone");
  }, [item.due, settings, t]);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.surface1, opacity: dimmed ? 0.5 : 1 }]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.icon, { backgroundColor: withAlpha(color, 0.14) }]}>
          <MaterialCommunityIcons name={ITEM_ICON[item.titleKey] ?? "wrench"} size={19} color={color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.contentPrimary, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>
            {item.customTitle ?? t(item.titleKey, { defaultValue: item.titleKey })}
          </Text>
          <Text style={{ color, fontSize: 12, marginTop: 1 }}>{subtitle}</Text>
        </View>
        <Pressable onPress={onDone} hitSlop={8} style={styles.doneButton}>
          <MaterialCommunityIcons name="check" size={16} color={brandPrimary} />
          <Text style={{ color: brandPrimary, fontSize: 12, fontWeight: "600" }}>{t("maintenance.done")}</Text>
        </Pressable>
      </View>

      {item.due.status !== "unknown" && (
        <View style={[styles.bar, { backgroundColor: colors.surface2 }]}>
          <View
            style={[
              styles.barFill,
              { width: `${Math.round(item.due.progress * 100)}%` as `${number}%`, backgroundColor: color },
            ]}
          />
        </View>
      )}
    </Pressable>
  );
}

function ItemEditor({
  item,
  odometerKm,
  onClose,
  onChanged,
}: {
  item: ScheduledMaintenanceItem;
  odometerKm: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useAppSettings();
  const [intervalKm, setIntervalKm] = useState(item.intervalKm != null ? String(item.intervalKm) : "");
  const [intervalMonths, setIntervalMonths] = useState(
    item.intervalMonths != null ? String(item.intervalMonths) : ""
  );
  const [doneKm, setDoneKm] = useState(String(Math.round(item.lastDoneKm ?? odometerKm)));
  const [doneDate, setDoneDate] = useState(toDateInput(item.lastDoneDate ?? Date.now()));
  const [cost, setCost] = useState(item.lastCost != null ? String(item.lastCost) : "");
  const [enabled, setEnabled] = useState(item.isEnabled);

  const title = item.customTitle ?? t(item.titleKey, { defaultValue: item.titleKey });

  const save = async () => {
    const parsedDate = fromDateInput(doneDate);
    if (doneDate.trim().length > 0 && parsedDate == null) {
      Alert.alert(t("maintenance.badDateTitle"), t("maintenance.badDateBody"));
      return;
    }
    await maintenanceRepository.update(item.id, {
      intervalKm: toNumber(intervalKm),
      intervalMonths: toNumber(intervalMonths),
      lastDoneKm: toNumber(doneKm),
      lastDoneDate: parsedDate,
      lastCost: toNumber(cost),
      isEnabled: enabled,
    });
    onChanged();
    onClose();
  };

  const confirmDelete = () => {
    Alert.alert(t("maintenance.removeTitle", { title }), t("maintenance.removeBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await maintenanceRepository.remove(item.id);
          onChanged();
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.sheetBackdrop, { backgroundColor: withAlpha("#000000", 0.35) }]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface1, paddingBottom: insets.bottom + DSSpace.s5 }]}>
          <View style={[styles.grabber, { backgroundColor: colors.hairline }]} />
          <Text style={{ color: colors.contentPrimary, fontSize: 18, fontWeight: "700", marginBottom: DSSpace.s1 }}>
            {title}
          </Text>
          <Text style={{ color: colors.contentSecondary, fontSize: 12, marginBottom: DSSpace.s4 }}>
            {t("maintenance.measuredAgainst", { odometer: Formatters.odometer(odometerKm, settings) })}
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }}>
            <Field label={t("maintenance.lastDoneKm")} value={doneKm} onChange={setDoneKm} keyboard="numeric" />
            <Field label={t("maintenance.lastDoneDate")} value={doneDate} onChange={setDoneDate} placeholder="YYYY-MM-DD" />
            <Field
              label={t("maintenance.cost", { currency: settings.currencyCode })}
              value={cost}
              onChange={setCost}
              keyboard="numeric"
            />
            <Field
              label={t("maintenance.intervalKmLabel")}
              value={intervalKm}
              onChange={setIntervalKm}
              keyboard="numeric"
              placeholder={t("maintenance.notSet")}
            />
            <Field
              label={t("maintenance.intervalMonthsLabel")}
              value={intervalMonths}
              onChange={setIntervalMonths}
              keyboard="numeric"
              placeholder={t("maintenance.notSet")}
            />

            <View style={styles.switchRow}>
              <Text style={{ color: colors.contentPrimary, fontSize: 15, flex: 1 }}>{t("maintenance.tracked")}</Text>
              <Switch value={enabled} onValueChange={setEnabled} />
            </View>
          </ScrollView>

          <Pressable
            onPress={async () => {
              await maintenanceRepository.markDone(item.id, odometerKm, toNumber(cost) ?? undefined);
              onChanged();
              onClose();
            }}
            style={[styles.primaryButton, { backgroundColor: brandPrimary }]}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>{t("maintenance.markDoneNow")}</Text>
          </Pressable>

          <View style={styles.sheetActions}>
            <Pressable onPress={confirmDelete} hitSlop={8}>
              <Text style={{ color: colors.semCritical, fontWeight: "600" }}>{t("common.delete")}</Text>
            </Pressable>
            <Pressable onPress={save} hitSlop={8}>
              <Text style={{ color: brandPrimary, fontWeight: "700" }}>{t("common.save")}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TemplatePicker({
  existing,
  onClose,
  onAdded,
}: {
  existing: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useAppSettings();
  const [custom, setCustom] = useState("");

  const available = MAINTENANCE_TEMPLATES.filter((template) => !existing.includes(template.titleKey));

  const add = async (template: (typeof MAINTENANCE_TEMPLATES)[number], customTitle?: string) => {
    await maintenanceRepository.add({ ...template, customTitle: customTitle ?? null });
    onAdded();
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.sheetBackdrop, { backgroundColor: withAlpha("#000000", 0.35) }]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface1, paddingBottom: insets.bottom + DSSpace.s5 }]}>
          <View style={[styles.grabber, { backgroundColor: colors.hairline }]} />
          <Text style={{ color: colors.contentPrimary, fontSize: 18, fontWeight: "700", marginBottom: DSSpace.s3 }}>
            {t("maintenance.addTitle")}
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 340 }}>
            {available.map((template, i) => (
              <Pressable
                key={template.titleKey}
                onPress={() => add(template)}
                style={[
                  styles.templateRow,
                  i > 0 && { borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <MaterialCommunityIcons
                  name={ITEM_ICON[template.titleKey] ?? "wrench"}
                  size={19}
                  color={brandPrimary}
                />
                <View style={{ flex: 1, marginLeft: DSSpace.s3 }}>
                  <Text style={{ color: colors.contentPrimary, fontSize: 15 }}>{t(template.titleKey)}</Text>
                  <Text style={{ color: colors.contentTertiary, fontSize: 11 }}>
                    {describeInterval(template, settings, t)}
                  </Text>
                </View>
                <MaterialCommunityIcons name="plus" size={20} color={brandPrimary} />
              </Pressable>
            ))}
            {available.length === 0 && (
              <Text style={{ color: colors.contentTertiary, fontSize: 13, paddingVertical: DSSpace.s3 }}>
                {t("maintenance.allTemplatesAdded")}
              </Text>
            )}
          </ScrollView>

          <View style={[styles.customRow, { borderTopColor: colors.hairline }]}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              placeholder={t("maintenance.customPlaceholder")}
              placeholderTextColor={colors.contentTertiary}
              style={{ color: colors.contentPrimary, flex: 1, paddingVertical: DSSpace.s3, fontSize: 15 }}
            />
            <Pressable
              disabled={custom.trim().length === 0}
              onPress={() =>
                add({ titleKey: "maintenance.custom", intervalKm: null, intervalMonths: null }, custom.trim())
              }
              hitSlop={8}
              style={{ opacity: custom.trim().length === 0 ? 0.4 : 1, paddingLeft: DSSpace.s3 }}
            >
              <Text style={{ color: brandPrimary, fontWeight: "700" }}>{t("maintenance.add")}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboard,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: "numeric";
  placeholder?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.field, { borderBottomColor: colors.hairline }]}>
      <Text style={{ color: colors.contentSecondary, fontSize: 14, flex: 1 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard === "numeric" ? "numeric" : "default"}
        placeholder={placeholder}
        placeholderTextColor={colors.contentTertiary}
        style={{ color: colors.contentPrimary, fontSize: 15, textAlign: "right", minWidth: 120, paddingVertical: 6 }}
      />
    </View>
  );
}

function describeInterval(
  template: { intervalKm: number | null; intervalMonths: number | null },
  settings: Parameters<typeof Formatters.odometer>[1],
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const parts: string[] = [];
  if (template.intervalKm != null) {
    parts.push(t("maintenance.everyDistance", { distance: Formatters.odometer(template.intervalKm, settings) }));
  }
  if (template.intervalMonths != null) {
    parts.push(t("maintenance.everyMonths", { count: template.intervalMonths }));
  }
  return parts.join(" · ") || t("maintenance.notSet");
}

function toNumber(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return text.trim().length > 0 && Number.isFinite(value) ? value : null;
}

function toDateInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses the YYYY-MM-DD the field accepts; undefined-safe so a cleared field
 * means "no recorded service" rather than 1 January 1970. */
function fromDateInput(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return date.getTime();
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: DSSpace.s2,
    paddingHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.s4,
  },
  title: { fontSize: 22, fontWeight: "700" },
  summary: {
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
    borderLeftWidth: 3,
  },
  card: {
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: DSSpace.s3 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  doneButton: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 6, paddingHorizontal: 8 },
  bar: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: DSSpace.s3 },
  barFill: { height: 5, borderRadius: 3 },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: DSSpace.screenEdge + DSSpace.s1,
    marginTop: DSSpace.s2,
  },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: DSSpace.cardPadding,
    paddingTop: DSSpace.s3,
  },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: DSSpace.s4 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: DSSpace.s2,
  },
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: DSSpace.s3 },
  primaryButton: {
    marginTop: DSSpace.s4,
    paddingVertical: 13,
    borderRadius: DSRadius.card,
    alignItems: "center",
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: DSSpace.s4,
  },
  templateRow: { flexDirection: "row", alignItems: "center", paddingVertical: DSSpace.s3 },
  customRow: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, marginTop: DSSpace.s2 },
});
