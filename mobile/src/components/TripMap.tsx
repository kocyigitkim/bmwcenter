import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius } from "@/design/tokens";
import { RouteSketch } from "@/components/RouteSketch";
import type { RouteSegmentClass, TimedRoutePoint, TrafficStop } from "@/core/trip/tripAnalysis";

interface Props {
  route: TimedRoutePoint[];
  segments: RouteSegmentClass[];
  stops: TrafficStop[];
  height?: number;
}

/** Longest stops get a permanent duration pill; the rest stay tap-to-reveal so a
 * stop-and-go commute doesn't bury the route under labels. */
const MAX_LABELED_STOPS = 4;
const LABELED_STOP_MIN_S = 60;

interface Palette {
  tiles: "light_all" | "dark_all";
  bg: string;
  normal: string;
  harsh: string;
  casing: string;
  start: string;
  end: string;
  stop: string;
  pillBg: string;
  pillText: string;
}

/**
 * Trip route on real map tiles, drawn with Leaflet inside a WebView.
 *
 * No API key: tiles are CARTO's OSM basemaps (light/dark to match the app
 * theme), and everything else is vector overlays we control — a casing under a
 * colored route line (blue = normal driving, red = harsh acceleration/braking),
 * iOS-style ringed dots for start/end, and amber pills with the wait time where
 * the trip sat in traffic.
 */
export function TripMap({ route, segments, stops, height = 260 }: Props) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const [failed, setFailed] = useState(false);

  const html = useMemo(() => {
    const dark = scheme === "dark";
    const palette: Palette = {
      tiles: dark ? "dark_all" : "light_all",
      bg: dark ? "#12171e" : "#eef1f5",
      normal: dark ? "#4E9BF5" : "#1C6FE0",
      harsh: dark ? "#FF4D4F" : "#D22C2E",
      casing: dark ? "rgba(7,9,12,0.85)" : "rgba(255,255,255,0.9)",
      start: dark ? "#2FD07B" : "#1E9E58",
      end: dark ? "#F4F7FA" : "#0B0F14",
      stop: dark ? "#F2B23E" : "#C4822A",
      pillBg: dark ? "rgba(18,23,30,0.92)" : "rgba(255,255,255,0.95)",
      pillText: dark ? "#F4F7FA" : "#0B0F14",
    };

    // Consecutive same-class segments merge into single polylines; each carries
    // one extra point of overlap so the route has no visual gaps at class changes.
    const runs: Array<{ cls: string; coords: Array<[number, number]> }> = [];
    for (const seg of segments) {
      const a = route[seg.index];
      const b = route[seg.index + 1];
      if (!a || !b) continue;
      const last = runs[runs.length - 1];
      if (last && last.cls === seg.cls) {
        last.coords.push([b.lat, b.lon]);
      } else {
        runs.push({ cls: seg.cls, coords: [[a.lat, a.lon], [b.lat, b.lon]] });
      }
    }
    if (runs.length === 0 && route.length > 1) {
      runs.push({ cls: "normal", coords: route.map((p) => [p.lat, p.lon]) });
    }

    const labeled = [...stops]
      .filter((s) => s.lat != null && s.lon != null && s.durationS >= LABELED_STOP_MIN_S)
      .sort((a, b) => b.durationS - a.durationS)
      .slice(0, MAX_LABELED_STOPS);
    const stopData = labeled.map((s) => ({ lat: s.lat, lon: s.lon, min: Math.max(1, Math.round(s.durationS / 60)) }));

    const data = JSON.stringify({
      runs,
      stops: stopData,
      bounds: route.map((p) => [p.lat, p.lon]),
      p: palette,
      minuteLabel: t("trip.map.minuteShort"),
    });

    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin:0; padding:0; height:100%; background:${palette.bg}; }
  .leaflet-container { background:${palette.bg}; font-family:-apple-system,system-ui,sans-serif; }
  .leaflet-control-attribution { font-size:8px; background:${palette.pillBg}; color:${dark ? "#9ba6b4" : "#5a6473"}; }
  .dot { border-radius:50%; box-shadow:0 1px 4px rgba(0,0,0,0.35); border:2.5px solid #fff; box-sizing:border-box; }
  .pill { background:${palette.pillBg}; color:${palette.pillText}; border-radius:10px; padding:2px 7px;
          font-size:11px; font-weight:600; white-space:nowrap; box-shadow:0 1px 4px rgba(0,0,0,0.25);
          border:none; }
  .leaflet-tooltip.pill:before { display:none; }
</style></head><body><div id="map"></div><script>
  if (typeof L === 'undefined') {
    // Offline or CDN unreachable — tell the native side so it can fall back.
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage('leaflet-unavailable');
    throw new Error('leaflet unavailable');
  }
  var D = ${data};
  var map = L.map('map', { zoomControl:false, attributionControl:true });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/${palette.tiles}/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(map);

  D.runs.forEach(function (r) {
    L.polyline(r.coords, { color: D.p.casing, weight: 8, opacity: 1, lineCap:'round', lineJoin:'round' }).addTo(map);
  });
  D.runs.forEach(function (r) {
    var color = r.cls === 'normal' ? D.p.normal : D.p.harsh;
    L.polyline(r.coords, { color: color, weight: 4.5, opacity: 1, lineCap:'round', lineJoin:'round' }).addTo(map);
  });

  function dot(latlng, color, size) {
    return L.marker(latlng, { icon: L.divIcon({
      className: '', iconSize: [size, size], iconAnchor: [size/2, size/2],
      html: '<div class="dot" style="width:'+size+'px;height:'+size+'px;background:'+color+'"></div>'
    })}).addTo(map);
  }

  if (D.bounds.length > 1) {
    dot(D.bounds[0], D.p.start, 16);
    dot(D.bounds[D.bounds.length-1], D.p.end, 16);
  }

  D.stops.forEach(function (s) {
    dot([s.lat, s.lon], D.p.stop, 13)
      .bindTooltip(s.min + ' ' + D.minuteLabel, {
        permanent: true, direction: 'top', offset: [0, -10], className: 'pill'
      });
  });

  if (D.bounds.length > 1) {
    map.fitBounds(L.latLngBounds(D.bounds), { padding: [28, 28] });
  } else if (D.bounds.length === 1) {
    map.setView(D.bounds[0], 15);
  }
</script></body></html>`;
  }, [route, segments, stops, scheme, t]);

  if (route.length < 2) {
    return (
      <View style={[styles.container, styles.empty, { height, backgroundColor: colors.surface1 }]}>
        <Text style={{ color: colors.contentTertiary, fontSize: 12 }}>{t("trip.route.unavailable")}</Text>
      </View>
    );
  }

  // Offline / CDN unreachable: draw the route shape locally instead of a blank card.
  if (failed) {
    return <RouteSketch route={route} height={height} />;
  }

  return (
    <View style={[styles.container, { height, backgroundColor: colors.surface1 }]}>
      <WebView
        source={{ html }}
        style={{ backgroundColor: "transparent" }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        onError={() => setFailed(true)}
        onMessage={(e) => {
          if (e.nativeEvent.data === "leaflet-unavailable") setFailed(true);
        }}
        onShouldStartLoadWithRequest={(req) =>
          // The document itself plus the CDN/tile hosts; block navigation elsewhere
          // (e.g. tapping the attribution link opening a browser inside the card).
          req.url === "about:blank" ||
          req.url.startsWith("data:") ||
          req.url.includes("unpkg.com") ||
          req.url.includes("cartocdn.com")
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    borderRadius: DSRadius.card,
    overflow: "hidden",
  },
  empty: { alignItems: "center", justifyContent: "center" },
});
