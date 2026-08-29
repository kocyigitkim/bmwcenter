/**
 * Writes the file the home-screen widgets read.
 *
 * There is no native bridge: the widgets live in the app's own process and read
 * `quickcar-widget.json` from the files directory. The file carries one
 * resolved payload per slot — colours, strings and a bar percentage — so the
 * Kotlin side draws whatever it is given and knows nothing about designs,
 * units, locale or what any metric means.
 */

import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import i18n from "@/i18n";
import { resolveDesign, type WidgetPayload } from "./widgetDesign";
import { gatherWidgetData } from "./widgetDataSource";
import { useWidgetSlots, WIDGET_SLOTS, type WidgetSlot } from "./widgetSlots";

const FILE_NAME = "quickcar-widget.json";
/** The widgets refresh on their own half-hourly schedule; writing faster is
 * wasted work, so a publish that is not forced is rate-limited. */
const MIN_INTERVAL_MS = 30_000;

interface WidgetFile {
  version: number;
  slots: Record<WidgetSlot, RenderedSlot>;
}

/** Stat labels are translated here so the renderer holds no strings. */
interface RenderedSlot extends Omit<WidgetPayload, "stats"> {
  stats: Array<{ label: string; value: string }>;
}

let lastSerialised: string | undefined;
let lastWriteAt = 0;
let writing = false;

export async function publishWidgetState(now = Date.now(), force = false): Promise<void> {
  // iOS widgets need an app extension and a shared container, neither of which
  // exists here. Pretending otherwise would just burn writes.
  if (Platform.OS !== "android") return;
  if (writing) return;
  if (!force && now - lastWriteAt < MIN_INTERVAL_MS) return;

  writing = true;
  try {
    const serialised = JSON.stringify(await buildFile(now));
    // The payload carries `updatedAt`, so compare without it: otherwise every
    // publish would look like a change and rewrite the file for nothing.
    if (!force && stripTimestamps(serialised) === stripTimestamps(lastSerialised)) return;

    const file = new File(Paths.document, FILE_NAME);
    file.create({ overwrite: true });
    file.write(serialised);
    lastSerialised = serialised;
    lastWriteAt = now;
  } catch {
    // The widgets keep showing what they had. Nothing here is worth an error to
    // the user, who did not ask for a file to be written.
  } finally {
    writing = false;
  }
}

async function buildFile(now: number): Promise<WidgetFile> {
  const data = await gatherWidgetData(now);
  const slots = useWidgetSlots.getState();
  const t = i18n.t.bind(i18n);

  const rendered = {} as Record<WidgetSlot, RenderedSlot>;
  for (const slot of WIDGET_SLOTS) {
    const payload = resolveDesign(slots.designFor(slot), data, now);
    rendered[slot] = {
      ...payload,
      stats: payload.stats.map((stat) => ({ label: t(stat.labelKey), value: stat.value })),
    };
  }

  return { version: 2, slots: rendered };
}

function stripTimestamps(serialised: string | undefined): string {
  return serialised ? serialised.replace(/"updatedAt":\d+/g, "") : "";
}

/** Forgets what was last written, so the next publish always goes through. */
export function resetWidgetCache(): void {
  lastSerialised = undefined;
  lastWriteAt = 0;
}
