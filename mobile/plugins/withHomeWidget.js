const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
  AndroidConfig,
} = require("expo/config-plugins");

/**
 * Android home-screen widget and quick settings tile.
 *
 * The generated android/ directory is gitignored and rebuilt by prebuild on
 * every CI run, so the Kotlin sources, resources and manifest entries are
 * written here rather than committed.
 *
 * The widget deliberately contains no logic: the app writes a small JSON file
 * of already-formatted strings into its files directory, and the widget renders
 * them. Units, locale and consumption maths stay in one place — duplicating any
 * of that in Kotlin is how a widget ends up disagreeing with the app it belongs
 * to.
 */

const WIDGET_LABEL = "QuickCar";
const STATE_FILE = "quickcar-widget.json";

const WIDGET_PROVIDER_KT = `package com.quickcar.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.quickcar.app.R
import org.json.JSONObject
import java.io.File

/**
 * Renders whatever the app last wrote to ${STATE_FILE}.
 *
 * Every value arrives pre-formatted, so this class never converts units or
 * computes anything — it cannot disagree with the app about what a number means.
 */
class QuickCarWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) render(context, manager, id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, QuickCarWidgetProvider::class.java)
            )
            if (ids.isNotEmpty()) onUpdate(context, manager, ids)
        }
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
        val views = RemoteViews(context.packageName, R.layout.quickcar_widget)
        val state = readState(context)

        if (state == null) {
            // Never been written: say so rather than showing zeroes that look real.
            views.setTextViewText(R.id.widget_vehicle, "${WIDGET_LABEL}")
            views.setTextViewText(R.id.widget_primary, "--")
            views.setTextViewText(R.id.widget_secondary, "")
            views.setTextViewText(R.id.widget_trip, "")
            views.setProgressBar(R.id.widget_fuel_bar, 100, 0, false)
        } else {
            views.setTextViewText(R.id.widget_vehicle, state.optString("vehicleName", "${WIDGET_LABEL}"))
            views.setTextViewText(R.id.widget_primary, state.optString("primary", "--"))
            views.setTextViewText(R.id.widget_secondary, state.optString("secondary", ""))
            views.setTextViewText(R.id.widget_trip, state.optString("trip", ""))

            val hasFuel = state.has("fuelLevelPct") && !state.isNull("fuelLevelPct")
            val level = if (hasFuel) state.optInt("fuelLevelPct", 0).coerceIn(0, 100) else 0
            views.setProgressBar(R.id.widget_fuel_bar, 100, level, false)
        }

        views.setOnClickPendingIntent(R.id.widget_root, launchAppIntent(context))
        manager.updateAppWidget(id, views)
    }

    private fun readState(context: Context): JSONObject? {
        return try {
            val file = File(context.filesDir, "${STATE_FILE}")
            if (!file.exists()) null else JSONObject(file.readText())
        } catch (error: Exception) {
            // A half-written or corrupt file must leave the widget blank, not crash
            // the launcher's host process.
            null
        }
    }

    private fun launchAppIntent(context: Context): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("quickcar://"))
        intent.setPackage(context.packageName)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        const val ACTION_REFRESH = "com.quickcar.app.widget.REFRESH"
    }
}
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

const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="110dp"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:updatePeriodMillis="1800000"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:description="@string/quickcar_widget_description"
    android:initialLayout="@layout/quickcar_widget" />
`;

const WIDGET_BACKGROUND_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#0B0F14" />
    <corners android:radius="20dp" />
</shape>
`;

const WIDGET_BAR_XML = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:id="@android:id/background">
        <shape android:shape="rectangle">
            <solid android:color="#1E2630" />
            <corners android:radius="3dp" />
        </shape>
    </item>
    <item android:id="@android:id/progress">
        <clip>
            <shape android:shape="rectangle">
                <solid android:color="#1C6FE0" />
                <corners android:radius="3dp" />
            </shape>
        </clip>
    </item>
</layer-list>
`;

const WIDGET_LAYOUT_XML = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/quickcar_widget_bg"
    android:padding="16dp">

    <TextView
        android:id="@+id/widget_vehicle"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:textColor="#8B96A5"
        android:textSize="12sp"
        android:maxLines="1"
        android:ellipsize="end"
        android:text="${WIDGET_LABEL}" />

    <TextView
        android:id="@+id/widget_primary"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="2dp"
        android:textColor="#F4F7FA"
        android:textSize="30sp"
        android:textStyle="bold"
        android:maxLines="1"
        android:ellipsize="end"
        android:text="--" />

    <TextView
        android:id="@+id/widget_secondary"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:textColor="#B6C0CC"
        android:textSize="13sp"
        android:maxLines="1"
        android:ellipsize="end" />

    <ProgressBar
        android:id="@+id/widget_fuel_bar"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="6dp"
        android:layout_marginTop="10dp"
        android:max="100"
        android:progress="0"
        android:progressDrawable="@drawable/quickcar_widget_bar" />

    <TextView
        android:id="@+id/widget_trip"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="10dp"
        android:textColor="#8B96A5"
        android:textSize="12sp"
        android:maxLines="1"
        android:ellipsize="end" />
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
      write(path.join(main, "res", "xml", "quickcar_widget_info.xml"), WIDGET_INFO_XML);
      write(path.join(main, "res", "layout", "quickcar_widget.xml"), WIDGET_LAYOUT_XML);
      write(path.join(main, "res", "drawable", "quickcar_widget_bg.xml"), WIDGET_BACKGROUND_XML);
      write(path.join(main, "res", "drawable", "quickcar_widget_bar.xml"), WIDGET_BAR_XML);

      return mod;
    },
  ]);
}

function withWidgetStrings(config) {
  return withStringsXml(config, (mod) => {
    mod.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          _: "Fuel level, range and your last drive",
          $: { name: "quickcar_widget_description", translatable: "false" },
        },
      ],
      mod.modResults
    );
    return mod;
  });
}

function withWidgetManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    app.receiver = app.receiver ?? [];
    const receiverName = ".widget.QuickCarWidgetProvider";
    if (!app.receiver.some((r) => r.$["android:name"] === receiverName)) {
      app.receiver.push({
        $: {
          "android:name": receiverName,
          // Only the system and this app ever send it anything.
          "android:exported": "false",
          "android:label": WIDGET_LABEL,
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.appwidget.provider",
              "android:resource": "@xml/quickcar_widget_info",
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
          {
            action: [{ $: { "android:name": "android.service.quicksettings.action.QS_TILE" } }],
          },
        ],
      });
    }

    return mod;
  });
}

module.exports = function withHomeWidget(config) {
  return withWidgetManifest(withWidgetStrings(withWidgetSources(config)));
};
