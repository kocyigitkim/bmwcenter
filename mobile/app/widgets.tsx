import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Alert, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { WidgetPreview } from "@/components/WidgetPreview";
import {
  ALL_PALETTES,
  MAX_HERO_SCALE,
  MAX_STATS,
  MIN_HERO_SCALE,
  PALETTES,
  clampScale,
  designName,
  isCustom,
  metricsUsedBy,
  normaliseDesign,
  type WidgetDesign,
  type WidgetPalette,
} from "@/core/widget/widgetDesign";
import {
  ALL_METRICS,
  BAR_CAPABLE,
  LIVE_ONLY,
  emptyDataSet,
  labelKeyFor,
  type WidgetDataSet,
  type WidgetMetricId,
} from "@/core/widget/widgetMetrics";
import { WIDGET_PRESETS } from "@/core/widget/widgetPresets";
import { WIDGET_SLOTS, newCustomDesignId, useWidgetSlots, type WidgetSlot } from "@/core/widget/widgetSlots";
import { gatherWidgetData } from "@/core/widget/widgetDataSource";
import { publishWidgetState, resetWidgetCache } from "@/core/widget/widgetPublisher";

export default function WidgetsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const slots = useWidgetSlots((s) => s.slots);
  const customDesigns = useWidgetSlots((s) => s.customDesigns);
  const assign = useWidgetSlots((s) => s.assign);
  const deleteCustom = useWidgetSlots((s) => s.deleteCustom);
  const designFor = useWidgetSlots((s) => s.designFor);

  const [data, setData] = useState<WidgetDataSet>(() => emptyDataSet());
  const [editing, setEditing] = useState<WidgetDesign | undefined>();

  /** Previews use the real readings, so what you pick is what you will see. */
  useFocusEffect(
    useCallback(() => {
      gatherWidgetData().then(setData).catch(() => undefined);
    }, [])
  );

  /** Every change reaches the home screen straight away rather than at the
   * next scheduled write. */
  const republish = useCallback(() => {
    resetWidgetCache();
    publishWidgetState(Date.now(), true).catch(() => undefined);
  }, []);

  const designs = useMemo(() => [...WIDGET_PRESETS, ...customDesigns], [customDesigns]);

  if (editing) {
    return (
      <DesignEditor
        design={editing}
        data={data}
        onCancel={() => setEditing(undefined)}
        onSave={(design) => {
          useWidgetSlots.getState().saveCustom(design);
          setEditing(undefined);
          republish();
        }}
      />
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("widget.title")}</Text>
      </View>

      <Text style={[styles.intro, { color: colors.contentSecondary }]}>{t("widget.intro")}</Text>

      {WIDGET_SLOTS.map((slot, index) => (
        <SlotCard
          key={slot}
          slot={slot}
          index={index}
          design={designFor(slot)}
          data={data}
          designs={designs}
          onAssign={(id) => {
            assign(slot, id);
            republish();
          }}
        />
      ))}

      <Text style={[styles.sectionTitle, { color: colors.contentSecondary }]}>{t("widget.yourDesigns")}</Text>

      {customDesigns.length === 0 ? (
        <Text style={[styles.empty, { color: colors.contentTertiary }]}>{t("widget.noCustom")}</Text>
      ) : (
        customDesigns.map((design) => (
          <View key={design.id} style={[styles.card, { backgroundColor: colors.surface1 }]}>
            <WidgetPreview design={design} data={data} />
            <View style={styles.cardActions}>
              <Text style={{ color: colors.contentPrimary, flex: 1, fontWeight: "600" }}>
                {designName(design, t)}
              </Text>
              <Pressable onPress={() => setEditing(design)} hitSlop={8}>
                <Text style={{ color: brandPrimary, fontWeight: "600" }}>{t("widget.edit")}</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(t("widget.deleteTitle"), t("widget.deleteBody"), [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("common.delete"),
                      style: "destructive",
                      onPress: () => {
                        deleteCustom(design.id);
                        republish();
                      },
                    },
                  ])
                }
                hitSlop={8}
                style={{ marginLeft: DSSpace.s4 }}
              >
                <Text style={{ color: colors.semCritical, fontWeight: "600" }}>{t("common.delete")}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Pressable
        onPress={() =>
          setEditing(
            normaliseDesign({
              ...WIDGET_PRESETS[0]!,
              id: newCustomDesignId(),
              nameKey: undefined,
              customName: t("widget.newDesignName"),
            })
          )
        }
        style={[styles.newButton, { backgroundColor: brandPrimary }]}
      >
        <MaterialCommunityIcons name="plus" size={18} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "700", marginLeft: 6 }}>{t("widget.newDesign")}</Text>
      </Pressable>

      <Text style={[styles.footnote, { color: colors.contentTertiary }]}>{t("widget.footnote")}</Text>
    </ScrollView>
  );
}

/** One home-screen widget, and which design it shows. */
function SlotCard({
  slot,
  index,
  design,
  data,
  designs,
  onAssign,
}: {
  slot: WidgetSlot;
  index: number;
  design: WidgetDesign;
  data: WidgetDataSet;
  designs: WidgetDesign[];
  onAssign: (designId: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [picking, setPicking] = useState(false);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
      <Text style={{ color: colors.contentTertiary, fontSize: 12, marginBottom: DSSpace.s3 }}>
        {t("widget.slotName", { number: index + 1 })}
      </Text>

      <WidgetPreview design={design} data={data} />

      <Pressable onPress={() => setPicking((v) => !v)} style={styles.cardActions}>
        <Text style={{ color: colors.contentPrimary, flex: 1, fontWeight: "600" }}>
          {designName(design, t)}
        </Text>
        <Text style={{ color: brandPrimary, fontWeight: "600" }}>{t("widget.change")}</Text>
        <MaterialCommunityIcons
          name={picking ? "chevron-up" : "chevron-down"}
          size={18}
          color={brandPrimary}
        />
      </Pressable>

      {picking && (
        <View style={{ marginTop: DSSpace.s2 }}>
          {designs.map((candidate) => {
            const active = candidate.id === design.id;
            return (
              <Pressable
                key={candidate.id}
                onPress={() => {
                  onAssign(candidate.id);
                  setPicking(false);
                }}
                style={[
                  styles.pickRow,
                  { backgroundColor: active ? withAlpha(brandPrimary, 0.12) : "transparent" },
                ]}
              >
                <View style={[styles.swatch, { backgroundColor: PALETTES[candidate.palette].background }]}>
                  <View style={[styles.swatchDot, { backgroundColor: PALETTES[candidate.palette].accent }]} />
                </View>
                <Text style={{ color: colors.contentPrimary, flex: 1, marginLeft: DSSpace.s3 }}>
                  {designName(candidate, t)}
                </Text>
                {isCustom(candidate) && (
                  <Text style={{ color: colors.contentTertiary, fontSize: 11, marginRight: DSSpace.s2 }}>
                    {t("widget.customTag")}
                  </Text>
                )}
                {active && <MaterialCommunityIcons name="check" size={18} color={brandPrimary} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** The custom-design editor. Every change redraws the preview above it. */
function DesignEditor({
  design: initial,
  data,
  onCancel,
  onSave,
}: {
  design: WidgetDesign;
  data: WidgetDataSet;
  onCancel: () => void;
  onSave: (design: WidgetDesign) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [design, setDesign] = useState(initial);

  const update = (patch: Partial<WidgetDesign>) =>
    setDesign((current) => normaliseDesign({ ...current, ...patch }));

  const liveOnly = metricsUsedBy(design).filter((m) => LIVE_ONLY.has(m));
  const barChoices = ALL_METRICS.filter((m) => BAR_CAPABLE.has(m));

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("widget.editorTitle")}</Text>
        </View>

        <View style={{ paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.cardGap }}>
          <WidgetPreview design={design} data={data} />
        </View>

        {liveOnly.length > 0 && (
          <View style={[styles.warning, { backgroundColor: withAlpha(colors.semAttention, 0.12) }]}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.semAttention} />
            <Text style={{ color: colors.contentSecondary, flex: 1, marginLeft: DSSpace.s2, fontSize: 12, lineHeight: 17 }}>
              {t("widget.liveOnlyWarning", {
                metrics: liveOnly.map((m) => t(labelKeyFor(m))).join(", "),
              })}
            </Text>
          </View>
        )}

        <Field label={t("widget.field.name")}>
          <TextInput
            value={design.customName ?? ""}
            onChangeText={(customName) => update({ customName })}
            placeholder={t("widget.newDesignName")}
            placeholderTextColor={colors.contentTertiary}
            style={{ color: colors.contentPrimary, fontSize: 15, paddingVertical: 8, textAlign: "right", flex: 1 }}
          />
        </Field>

        <MetricPicker
          label={t("widget.field.header")}
          value={design.header}
          onChange={(header) => update({ header })}
        />
        <MetricPicker label={t("widget.field.hero")} value={design.hero} onChange={(hero) => update({ hero })} />
        <MetricPicker
          label={t("widget.field.secondary")}
          value={design.secondary}
          onChange={(secondary) => update({ secondary })}
        />
        <MetricPicker
          label={t("widget.field.bar")}
          value={design.bar ?? "empty"}
          choices={["empty", ...barChoices]}
          onChange={(bar) => update({ bar: bar === "empty" ? null : bar })}
        />

        <Text style={[styles.sectionTitle, { color: colors.contentSecondary }]}>{t("widget.field.stats")}</Text>
        {Array.from({ length: MAX_STATS }, (_, i) => (
          <MetricPicker
            key={i}
            label={t("widget.field.statN", { number: i + 1 })}
            value={design.stats[i] ?? "empty"}
            onChange={(metric) => {
              const stats = [...design.stats];
              if (metric === "empty") stats.splice(i, 1);
              else if (i < stats.length) stats[i] = metric;
              else stats.push(metric);
              update({ stats });
            }}
          />
        ))}

        <Text style={[styles.sectionTitle, { color: colors.contentSecondary }]}>{t("widget.field.look")}</Text>

        <View style={[styles.rowCard, { backgroundColor: colors.surface1 }]}>
          <Text style={{ color: colors.contentSecondary, fontSize: 13, marginBottom: DSSpace.s3 }}>
            {t("widget.field.palette")}
          </Text>
          <View style={styles.paletteRow}>
            {ALL_PALETTES.map((palette) => (
              <Pressable
                key={palette}
                onPress={() => update({ palette })}
                style={[
                  styles.paletteSwatch,
                  {
                    backgroundColor: PALETTES[palette].background,
                    borderColor: design.palette === palette ? brandPrimary : colors.hairline,
                    borderWidth: design.palette === palette ? 2 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <View style={[styles.swatchDot, { backgroundColor: PALETTES[palette].accent }]} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.rowCard, { backgroundColor: colors.surface1, flexDirection: "row", alignItems: "center" }]}>
          <Text style={{ color: colors.contentPrimary, flex: 1, fontSize: 15 }}>{t("widget.field.stripe")}</Text>
          <Switch value={design.accentStripe} onValueChange={(accentStripe) => update({ accentStripe })} />
        </View>

        <View style={[styles.rowCard, { backgroundColor: colors.surface1 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: DSSpace.s3 }}>
            <Text style={{ color: colors.contentPrimary, flex: 1, fontSize: 15 }}>{t("widget.field.heroSize")}</Text>
            <Text style={{ color: colors.contentTertiary, fontSize: 13 }}>
              {Math.round(design.heroScale * 100)}%
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: DSSpace.s2 }}>
            {[MIN_HERO_SCALE, 0.85, 1, 1.2, MAX_HERO_SCALE].map((scale) => (
              <Pressable
                key={scale}
                onPress={() => update({ heroScale: clampScale(scale) })}
                style={[
                  styles.scaleChip,
                  {
                    backgroundColor:
                      Math.abs(design.heroScale - scale) < 0.01 ? brandPrimary : colors.surface2,
                  },
                ]}
              >
                <Text
                  style={{
                    color: Math.abs(design.heroScale - scale) < 0.01 ? "#fff" : colors.contentPrimary,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {Math.round(scale * 100)}%
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.editorFooter, { paddingBottom: insets.bottom + DSSpace.s4, borderTopColor: colors.hairline }]}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={{ color: colors.contentSecondary, fontWeight: "600" }}>{t("common.cancel")}</Text>
        </Pressable>
        <Pressable
          onPress={() => onSave(design)}
          style={[styles.saveButton, { backgroundColor: brandPrimary }]}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t("common.save")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.rowCard, { backgroundColor: colors.surface1, flexDirection: "row", alignItems: "center" }]}>
      <Text style={{ color: colors.contentSecondary, fontSize: 14 }}>{label}</Text>
      {children}
    </View>
  );
}

/** Cycles through the metric list in place — a full picker per slot would bury
 * the preview, which is the thing the user is actually watching. */
function MetricPicker({
  label,
  value,
  choices = ALL_METRICS,
  onChange,
}: {
  label: string;
  value: WidgetMetricId;
  choices?: WidgetMetricId[];
  onChange: (metric: WidgetMetricId) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.rowCard, { backgroundColor: colors.surface1 }]}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ color: colors.contentSecondary, fontSize: 14, flex: 1 }}>{label}</Text>
        <Text style={{ color: colors.contentPrimary, fontSize: 14, fontWeight: "600" }}>
          {t(labelKeyFor(value))}
        </Text>
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.contentTertiary}
          style={{ marginLeft: 4 }}
        />
      </Pressable>

      {open && (
        <View style={{ marginTop: DSSpace.s2 }}>
          {choices.map((metric) => (
            <Pressable
              key={metric}
              onPress={() => {
                onChange(metric);
                setOpen(false);
              }}
              style={[
                styles.pickRow,
                { backgroundColor: metric === value ? withAlpha(brandPrimary, 0.12) : "transparent" },
              ]}
            >
              <Text style={{ color: colors.contentPrimary, flex: 1, fontSize: 14 }}>{t(labelKeyFor(metric))}</Text>
              {LIVE_ONLY.has(metric) && (
                <MaterialCommunityIcons name="car-connected" size={14} color={colors.contentTertiary} />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: DSSpace.s2,
    paddingHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.s3,
  },
  title: { fontSize: 22, fontWeight: "700" },
  intro: {
    paddingHorizontal: DSSpace.screenEdge,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: DSSpace.s4,
  },
  card: {
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
  },
  rowCard: {
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.s2,
    paddingHorizontal: DSSpace.cardPadding,
    paddingVertical: DSSpace.s3,
    borderRadius: DSRadius.card,
  },
  cardActions: { flexDirection: "row", alignItems: "center", marginTop: DSSpace.s3 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: DSSpace.s2,
    borderRadius: 8,
  },
  swatch: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  swatchDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: DSSpace.screenEdge + DSSpace.s1,
    marginTop: DSSpace.s4,
    marginBottom: DSSpace.s2,
  },
  empty: { paddingHorizontal: DSSpace.screenEdge + DSSpace.s1, fontSize: 13, marginBottom: DSSpace.s3 },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: DSSpace.screenEdge,
    marginTop: DSSpace.s3,
    paddingVertical: 13,
    borderRadius: DSRadius.card,
  },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: DSSpace.screenEdge + DSSpace.s1,
    marginTop: DSSpace.s5,
  },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.s3,
    padding: DSSpace.s3,
    borderRadius: DSRadius.card,
  },
  paletteRow: { flexDirection: "row", gap: DSSpace.s2, flexWrap: "wrap" },
  paletteSwatch: { width: 44, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  scaleChip: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  editorFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: DSSpace.screenEdge,
    paddingTop: DSSpace.s4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveButton: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: DSRadius.card },
});
