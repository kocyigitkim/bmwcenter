import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Share } from "react-native";
import Constants from "expo-constants";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import i18n from "@/i18n";
import { DSSpace, DSRadius, brandPrimary, withAlpha, colorsFor } from "@/design/tokens";
import { buildCrashReport, formatCrashReport, type CrashReport } from "@/core/errors/crashReport";

interface Props {
  children: React.ReactNode;
  /** Named in the report so a bug tells us where it happened. */
  screen?: string;
  onReset?: () => void;
}

interface State {
  report?: CrashReport;
  shared: boolean;
}

/**
 * Fixed dark colours rather than the theme hook: the theme provider sits above
 * this boundary, and reading context while recovering from a crash is one more
 * thing that could itself throw.
 */
const fallbackColors = colorsFor("dark");

/**
 * Keeps one bad screen from taking the whole app down.
 *
 * Without this, any render error unmounts the tree and leaves a white screen
 * with no way back — the user's only option is to force-quit, and we learn
 * nothing about what happened. The trip screen's map crash was exactly this.
 *
 * Deliberately a class: error boundaries have no hooks equivalent, and
 * `getDerivedStateFromError` is the only way React offers to render a fallback
 * after a throw.
 */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { shared: false };

  static getDerivedStateFromError(): Partial<State> {
    // The real report is assembled in componentDidCatch, which is the only
    // place React hands over the component stack.
    return { shared: false };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
    this.setState({
      report: buildCrashReport(error, info.componentStack ?? undefined, {
        at: Date.now(),
        screen: this.props.screen,
        appVersion: Constants.expoConfig?.version ?? undefined,
        platform: Platform.OS,
      }),
      shared: false,
    });
  }

  private retry = () => {
    this.setState({ report: undefined, shared: false });
    this.props.onReset?.();
  };

  /** The share sheet rather than the clipboard: it needs no extra dependency
   * and puts the report straight into whatever the user reports bugs through. */
  private share = async () => {
    const { report } = this.state;
    if (!report) return;
    try {
      await Share.share({ message: formatCrashReport(report) });
      this.setState({ shared: true });
    } catch {
      // Nothing useful to say if even the share sheet is unavailable.
    }
  };

  render(): React.ReactNode {
    const { report, shared } = this.state;
    if (!report) return this.props.children;

    const t = i18n.t.bind(i18n);

    return (
      <View style={[styles.root, { backgroundColor: fallbackColors.canvas }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.icon, { backgroundColor: withAlpha(fallbackColors.semCritical, 0.16) }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={30} color={fallbackColors.semCritical} />
          </View>

          <Text style={[styles.title, { color: fallbackColors.contentPrimary }]}>{t("crash.title")}</Text>
          <Text style={[styles.body, { color: fallbackColors.contentSecondary }]}>{t("crash.body")}</Text>

          <View style={[styles.detail, { backgroundColor: withAlpha(fallbackColors.contentPrimary, 0.06) }]}>
            <Text style={[styles.detailText, { color: fallbackColors.contentSecondary }]} numberOfLines={4}>
              {report.message}
            </Text>
          </View>

          <Pressable onPress={this.retry} style={[styles.primary, { backgroundColor: brandPrimary }]}>
            <Text style={styles.primaryText}>{t("crash.retry")}</Text>
          </Pressable>

          <Pressable onPress={this.share} style={styles.secondary}>
            <MaterialCommunityIcons
              name={shared ? "check" : "share-variant"}
              size={16}
              color={fallbackColors.contentSecondary}
            />
            <Text style={[styles.secondaryText, { color: fallbackColors.contentSecondary }]}>
              {t(shared ? "crash.shared" : "crash.share")}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: DSSpace.screenEdge + DSSpace.s2,
  },
  icon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: DSSpace.s5,
  },
  title: { fontSize: 21, fontWeight: "700", textAlign: "center", marginBottom: DSSpace.s2 },
  body: { fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: DSSpace.s5 },
  detail: {
    alignSelf: "stretch",
    borderRadius: DSRadius.card,
    padding: DSSpace.s4,
    marginBottom: DSSpace.s5,
  },
  detailText: { fontSize: 12, lineHeight: 17, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  primary: {
    alignSelf: "stretch",
    paddingVertical: 13,
    borderRadius: DSRadius.card,
    alignItems: "center",
  },
  primaryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: DSSpace.s4,
  },
  secondaryText: { fontSize: 13, fontWeight: "600" },
});
