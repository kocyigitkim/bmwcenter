const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
  withStringsXml,
  AndroidConfig,
} = require("expo/config-plugins");

/**
 * Android home-screen widgets and the quick settings tile.
 *
 * The generated android/ directory is gitignored and rebuilt by prebuild on
 * every CI run, so the Kotlin sources, resources and manifest entries are
 * written here rather than committed.
 *
 * There is one layout and no design knowledge in Kotlin at all. The app resolves
 * a design — built-in or drawn by the user — into a flat payload of colours,
 * strings and a bar percentage, and this renders it. That is what lets a
 * thirteenth design cost no native work, and it is why the in-app preview
 * cannot drift from the real widget: both draw the same resolved payload.
 *
 * Three providers exist because Android cannot ask which design the user wants
 * as they drop a widget on the home screen without a configuration activity.
 * Three separate widgets in the picker, each assigned a design in the app, gets
 * to the same place with far less native surface.
 */

/**
 * Android 12.
 *
 * RemoteViews only gained runtime tinting (`setProgressTintList`) in API 31.
 * Below that the bar's fill can only be coloured by swapping in a drawable
 * prepared ahead of time, which means one drawable per palette and one stacked
 * ProgressBar per palette in the layout — a lot of machinery to support phones
 * released before 2021. Requiring Android 12 makes it one line instead.
 *
 * Expo's root-project plugin defaults minSdk to 24 and reads this gradle
 * property as an override.
 */
const MIN_SDK = 31;

const WIDGET_LABEL = "QuickCar";
const STATE_FILE = "quickcar-widget.json";
const SLOTS = ["a", "b", "c"];

const WIDGET_PROVIDER_KT = `package com.quickcar.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.net.Uri
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import com.quickcar.app.R
import org.json.JSONObject
import java.io.File

/**
 * Draws whatever the app last wrote for this slot.
 *
 * Every value arrives already formatted and every colour already chosen, so
 * this class converts no units, picks no palette and knows no metric names — it
 * cannot disagree with the app about what a number means.
 */
abstract class QuickCarWidgetProvider(private val slot: String) : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) render(context, manager, id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, javaClass))
            if (ids.isNotEmpty()) onUpdate(context, manager, ids)
        }
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
        val views = RemoteViews(context.packageName, R.layout.quickcar_widget)
        val payload = readSlot(context)

        if (payload == null) {
            // Never been written: say so rather than showing zeroes that look
            // like readings.
            views.setTextViewText(R.id.widget_header, "${WIDGET_LABEL}")
            views.setTextViewText(R.id.widget_hero, "--")
            views.setViewVisibility(R.id.widget_secondary, View.GONE)
            views.setViewVisibility(R.id.widget_bar, View.GONE)
            hideStatsFrom(views, 0)
        } else {
            applyPayload(views, payload)
        }

        views.setOnClickPendingIntent(R.id.widget_root, launchAppIntent(context))
        manager.updateAppWidget(id, views)
    }

    private fun applyPayload(views: RemoteViews, payload: JSONObject) {
        val colors = payload.optJSONObject("colors")
        val background = color(colors?.optString("background"), Color.BLACK)
        val muted = color(colors?.optString("muted"), Color.GRAY)
        val primary = color(colors?.optString("primary"), Color.WHITE)
        val accent = color(colors?.optString("accent"), Color.BLUE)
        val track = color(colors?.optString("track"), Color.DKGRAY)

        views.setInt(R.id.widget_root, "setBackgroundColor", background)
        views.setInt(R.id.widget_stripe, "setBackgroundColor", accent)
        views.setViewVisibility(
            R.id.widget_stripe,
            if (payload.optBoolean("accentStripe", false)) View.VISIBLE else View.GONE
        )

        setTextOrHide(views, R.id.widget_header, payload.optString("header"), muted)
        setTextOrHide(views, R.id.widget_secondary, payload.optString("secondary"), muted)

        views.setTextViewText(R.id.widget_hero, payload.optString("hero", "--"))
        views.setTextColor(R.id.widget_hero, primary)
        // The scale is a multiplier the designer exposes; 34sp is the base size.
        val scale = payload.optDouble("heroScale", 1.0).toFloat().coerceIn(0.7f, 1.5f)
        views.setTextViewTextSize(R.id.widget_hero, TypedValue.COMPLEX_UNIT_SP, 34f * scale)

        // Negative means the design has no bar; zero means an empty one. Drawing
        // them the same would make a car that reports no fuel look empty.
        val barPercent = payload.optInt("barPercent", -1)
        if (barPercent < 0) {
            views.setViewVisibility(R.id.widget_bar, View.GONE)
        } else {
            views.setViewVisibility(R.id.widget_bar, View.VISIBLE)
            views.setProgressBar(R.id.widget_bar, 100, barPercent.coerceIn(0, 100), false)
            views.setColorStateList(R.id.widget_bar, "setProgressTintList", ColorStateList.valueOf(accent))
            views.setColorStateList(
                R.id.widget_bar,
                "setProgressBackgroundTintList",
                ColorStateList.valueOf(track)
            )
        }

        val stats = payload.optJSONArray("stats")
        val count = stats?.length() ?: 0
        for (i in 0 until minOf(count, STAT_LABELS.size)) {
            val stat = stats?.optJSONObject(i) ?: continue
            views.setViewVisibility(STAT_CELLS[i], View.VISIBLE)
            views.setTextViewText(STAT_LABELS[i], stat.optString("label"))
            views.setTextColor(STAT_LABELS[i], muted)
            views.setTextViewText(STAT_VALUES[i], stat.optString("value"))
            views.setTextColor(STAT_VALUES[i], primary)
        }
        hideStatsFrom(views, count)
        views.setViewVisibility(
            R.id.widget_stats,
            if (count > 0) View.VISIBLE else View.GONE
        )
    }

    private fun hideStatsFrom(views: RemoteViews, from: Int) {
        for (i in from until STAT_CELLS.size) {
            views.setViewVisibility(STAT_CELLS[i], View.GONE)
        }
    }

    private fun setTextOrHide(views: RemoteViews, id: Int, text: String?, textColor: Int) {
        if (text.isNullOrEmpty()) {
            views.setViewVisibility(id, View.GONE)
        } else {
            views.setViewVisibility(id, View.VISIBLE)
            views.setTextViewText(id, text)
            views.setTextColor(id, textColor)
        }
    }

    private fun color(value: String?, fallback: Int): Int {
        if (value.isNullOrEmpty()) return fallback
        return try {
            Color.parseColor(value)
        } catch (error: IllegalArgumentException) {
            fallback
        }
    }

    private fun readSlot(context: Context): JSONObject? {
        return try {
            val file = File(context.filesDir, "${STATE_FILE}")
            if (!file.exists()) return null
            JSONObject(file.readText()).optJSONObject("slots")?.optJSONObject(slot)
        } catch (error: Exception) {
            // A half-written or corrupt file must leave the widget blank, not
            // crash the launcher's host process.
            null
        }
    }

    private fun launchAppIntent(context: Context): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("quickcar://"))
        intent.setPackage(context.packageName)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(
            context,
            slot.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        const val ACTION_REFRESH = "com.quickcar.app.widget.REFRESH"

        private val STAT_CELLS = intArrayOf(
            R.id.widget_stat1, R.id.widget_stat2, R.id.widget_stat3, R.id.widget_stat4
        )
        private val STAT_LABELS = intArrayOf(
            R.id.widget_stat1_label, R.id.widget_stat2_label,
            R.id.widget_stat3_label, R.id.widget_stat4_label
        )
        private val STAT_VALUES = intArrayOf(
            R.id.widget_stat1_value, R.id.widget_stat2_value,
            R.id.widget_stat3_value, R.id.widget_stat4_value
        )
    }
}

${SLOTS.map((slot) => `class QuickCarWidget${slot.toUpperCase()} : QuickCarWidgetProvider("${slot}")`).join("\n")}
`;

const TILE_SERVICE_KT = `package com.quickcar.app.widget

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Quick settings tile that starts or stops recording.
 *
 * The tile does not talk to the recorder directly — it opens a deep link and
 * lets the app decide, so there is one implementation of what starting a trip
 * means rather than two that can drift apart.
 */
class RecordTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        qsTile?.let { tile ->
            tile.state = Tile.STATE_INACTIVE
            tile.label = "${WIDGET_LABEL}"
            tile.updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("quickcar://record"))
        intent.setPackage(packageName)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // startActivityAndCollapse(Intent) throws on API 34 and above.
            val pending = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            startActivityAndCollapse(pending)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
`;

const widgetInfoXML = (slot) => `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp"
    android:minHeight="110dp"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:updatePeriodMillis="1800000"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:description="@string/quickcar_widget_description_${slot}"
    android:initialLayout="@layout/quickcar_widget" />
`;

const WIDGET_BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#0B0F14" />
    <corners android:radius="20dp" />
</shape>
`;

/**
 * The bar is a plain view pair rather than a ProgressBar drawable, because
 * RemoteViews cannot tint a progress drawable on every Android version. The
 * track and the fill are coloured directly instead.
 */
const WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="horizontal"
    android:background="@drawable/quickcar_widget_bg"
    android:padding="14dp">

    <View
        android:id="@+id/widget_stripe"
        android:layout_width="3dp"
        android:layout_height="match_parent"
        android:layout_marginEnd="12dp"
        android:visibility="gone" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical">

        <TextView
            android:id="@+id/widget_header"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textSize="12sp"
            android:maxLines="1"
            android:ellipsize="end" />

        <TextView
            android:id="@+id/widget_hero"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textSize="34sp"
            android:textStyle="bold"
            android:maxLines="1"
            android:ellipsize="end"
            android:includeFontPadding="false" />

        <TextView
            android:id="@+id/widget_secondary"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textSize="13sp"
            android:maxLines="1"
            android:ellipsize="end" />

        <ProgressBar
            android:id="@+id/widget_bar"
            style="?android:attr/progressBarStyleHorizontal"
            android:layout_width="match_parent"
            android:layout_height="6dp"
            android:layout_marginTop="8dp"
            android:max="100"
            android:progress="0" />

        <LinearLayout
            android:id="@+id/widget_stats"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="10dp"
            android:orientation="horizontal">

${[1, 2, 3, 4]
  .map(
    (i) => `            <LinearLayout
                android:id="@+id/widget_stat${i}"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:orientation="vertical"
                android:visibility="gone">
                <TextView
                    android:id="@+id/widget_stat${i}_label"
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:textSize="10sp"
                    android:maxLines="1"
                    android:ellipsize="end" />
                <TextView
                    android:id="@+id/widget_stat${i}_value"
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:textSize="13sp"
                    android:textStyle="bold"
                    android:maxLines="1"
                    android:ellipsize="end" />
            </LinearLayout>`
  )
  .join("\n")}
        </LinearLayout>
    </LinearLayout>
</LinearLayout>
`;

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
}

function withWidgetSources(config) {
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const root = mod.modRequest.platformProjectRoot;
      const main = path.join(root, "app", "src", "main");
      const pkgDir = path.join(main, "java", "com", "quickcar", "app", "widget");

      write(path.join(pkgDir, "QuickCarWidgetProvider.kt"), WIDGET_PROVIDER_KT);
      write(path.join(pkgDir, "RecordTileService.kt"), TILE_SERVICE_KT);
      write(path.join(main, "res", "layout", "quickcar_widget.xml"), WIDGET_LAYOUT_XML);
      write(path.join(main, "res", "drawable", "quickcar_widget_bg.xml"), WIDGET_BACKGROUND_XML);
      for (const slot of SLOTS) {
        write(path.join(main, "res", "xml", `quickcar_widget_info_${slot}.xml`), widgetInfoXML(slot));
      }

      return mod;
    },
  ]);
}

function withWidgetStrings(config) {
  return withStringsXml(config, (mod) => {
    for (const [index, slot] of SLOTS.entries()) {
      mod.modResults = AndroidConfig.Strings.setStringItem(
        [
          {
            _: `QuickCar widget ${index + 1} — choose its design in the app`,
            $: { name: `quickcar_widget_description_${slot}`, translatable: "false" },
          },
        ],
        mod.modResults
      );
    }
    return mod;
  });
}

function withWidgetManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    app.receiver = app.receiver ?? [];
    for (const [index, slot] of SLOTS.entries()) {
      const name = `.widget.QuickCarWidget${slot.toUpperCase()}`;
      if (app.receiver.some((r) => r.$["android:name"] === name)) continue;
      app.receiver.push({
        $: {
          "android:name": name,
          // Only the system and this app ever send it anything.
          "android:exported": "false",
          "android:label": `${WIDGET_LABEL} ${index + 1}`,
        },
        "intent-filter": [
          { action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }] },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.appwidget.provider",
              "android:resource": `@xml/quickcar_widget_info_${slot}`,
            },
          },
        ],
      });
    }

    app.service = app.service ?? [];
    const tileName = ".widget.RecordTileService";
    if (!app.service.some((s) => s.$["android:name"] === tileName)) {
      app.service.push({
        $: {
          "android:name": tileName,
          "android:label": WIDGET_LABEL,
          "android:icon": "@drawable/notification_icon",
          // The system binds the tile, so it has to be exported; the permission
          // means only the system can.
          "android:exported": "true",
          "android:permission": "android.permission.BIND_QUICK_SETTINGS_TILE",
        },
        "intent-filter": [
          { action: [{ $: { "android:name": "android.service.quicksettings.action.QS_TILE" } }] },
        ],
      });
    }

    return mod;
  });
}

function withMinSdk(config) {
  return withGradleProperties(config, (mod) => {
    const key = "android.minSdkVersion";
    const existing = mod.modResults.find((item) => item.type === "property" && item.key === key);
    if (existing) existing.value = String(MIN_SDK);
    else mod.modResults.push({ type: "property", key, value: String(MIN_SDK) });
    return mod;
  });
}

module.exports = function withHomeWidget(config) {
  return withMinSdk(withWidgetManifest(withWidgetStrings(withWidgetSources(config))));
};
