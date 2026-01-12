import { useEffect, useRef } from "react";

import WebMap from "@arcgis/core/WebMap";
import MapView from "@arcgis/core/views/MapView";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";

import OAuthInfo from "@arcgis/core/identity/OAuthInfo";
import IdentityManager from "@arcgis/core/identity/IdentityManager";
import esriConfig from "@arcgis/core/config";

type ArcGisMapProps = {
  onPickLocation?: (coords: { lat: number; lon: number }) => void;
  pickedLocation?: { lat: number; lon: number } | null;
  savedPoints?: Array<{ lat: number; lon: number; kind: "report" | "quiet" }>;
};

export default function ArcGisMap({
  onPickLocation,
  pickedLocation,
  savedPoints,
}: ArcGisMapProps) {
  const divRef = useRef<HTMLDivElement | null>(null);

  // Keep latest values without re-initializing the ArcGIS view.
  const onPickLocationRef = useRef<ArcGisMapProps["onPickLocation"]>(onPickLocation);
  const pickedLocationRef = useRef<ArcGisMapProps["pickedLocation"]>(pickedLocation);
  const savedPointsRef = useRef<ArcGisMapProps["savedPoints"]>(savedPoints);

  const viewRef = useRef<MapView | null>(null);
  const graphicsLayerRef = useRef<GraphicsLayer | null>(null);
  const reportLayersRef = useRef<FeatureLayer[]>([]);
  const primaryReportLayerRef = useRef<FeatureLayer | null>(null);

  useEffect(() => {
    onPickLocationRef.current = onPickLocation;
  }, [onPickLocation]);

  useEffect(() => {
    pickedLocationRef.current = pickedLocation;
  }, [pickedLocation]);

  useEffect(() => {
    savedPointsRef.current = savedPoints;
  }, [savedPoints]);

  const renderMarkers = () => {
    const layer = graphicsLayerRef.current;
    if (!layer) return;

    layer.removeAll();

    const saved = savedPointsRef.current ?? [];
    for (const p of saved) {
      const symbol = new SimpleMarkerSymbol({
        style: "circle",
        color: p.kind === "report" ? [220, 38, 38, 0.9] : [16, 185, 129, 0.9],
        size: 8,
        outline: { color: [255, 255, 255, 0.9], width: 1 },
      });

      layer.add(
        new Graphic({
          geometry: new Point({ latitude: p.lat, longitude: p.lon }),
          symbol,
        })
      );
    }

    const picked = pickedLocationRef.current;
    if (picked) {
      const symbol = new SimpleMarkerSymbol({
        style: "circle",
        color: [59, 130, 246, 0.9],
        size: 10,
        outline: { color: [255, 255, 255, 0.95], width: 2 },
      });

      layer.add(
        new Graphic({
          geometry: new Point({ latitude: picked.lat, longitude: picked.lon }),
          symbol,
        })
      );
    }
  };

  // Re-render markers when parent updates selected/saved points.
  useEffect(() => {
    renderMarkers();
  }, [pickedLocation, savedPoints]);

  useEffect(() => {
    if (!divRef.current) return;

    let view: MapView | null = null;
    const handles: __esri.Handle[] = [];

    async function init() {
      try {
        esriConfig.portalUrl = "https://www.arcgis.com";

        const oauthInfo = new OAuthInfo({
          appId: import.meta.env.VITE_ARCGIS_CLIENT_ID,
          portalUrl: "https://www.arcgis.com",
          popup: false,
        });

        IdentityManager.registerOAuthInfos([oauthInfo]);
        await IdentityManager.getCredential("https://www.arcgis.com");

        console.log("✅ ArcGIS authenticated");

        // 🔹 WEBMAP
        const webmap = new WebMap({
          portalItem: {
            id: "214b24b9b3614049bc64254e3fc42b76",
          },
        });

        view = new MapView({
          container: divRef.current,
          map: webmap,
        });

        viewRef.current = view;

        // Marker layer for picked + saved
        const markerLayer = new GraphicsLayer({ title: "markers" });
        graphicsLayerRef.current = markerLayer;
        webmap.add(markerLayer);

        await view.when();
        console.log("✅ WebMap încărcată complet");

  // Keep popup enabled for existing features.
  view.popupEnabled = true;

        const reportPopupTemplate: __esri.PopupTemplateProperties = {
          title: "User report",
          content: [
            {
              type: "fields",
              fieldInfos: [
                { fieldName: "userId", label: "userId" },
                { fieldName: "noiseLevel", label: "noiseLevel" },
                { fieldName: "category", label: "category" },
                {
                  fieldName: "reportTimestamp",
                  label: "reportTimestamp",
                  format: { dateFormat: "short-date-short-time" },
                },
              ],
            },
          ],
        };

        // Apply template to any FeatureLayer that has the required fields
        await webmap.loadAll();
        const featureLayers = webmap.allLayers.filter(
          (layer): layer is FeatureLayer => layer.type === "feature"
        );

        if (featureLayers.length === 0) {
          console.warn("⚠️ Nu am găsit niciun FeatureLayer în WebMap");
        } else {
          await Promise.all(featureLayers.map((layer) => layer.load()));

        const required = new Set([
          "userId",
          "noiseLevel",
          "category",
          "reportTimestamp",
        ]);

          const reportLayers: FeatureLayer[] = [];
          for (const layer of featureLayers) {
            const fieldNames = new Set(layer.fields?.map((f) => f.name) ?? []);
            const matches = [...required].every((f) => fieldNames.has(f));
            if (!matches) continue;

            layer.outFields = ["*"];
            layer.popupEnabled = true;
            layer.popupTemplate = reportPopupTemplate;
            reportLayers.push(layer);
          }

          reportLayersRef.current = reportLayers;

        console.log(
          "✅ Report layers cu popupTemplate:",
          reportLayers.map((l) => l.title)
        );

          const primaryReportLayer =
            reportLayers.find((l) => l.title === "User_Reports") ??
            reportLayers.find((l) => (l.title ?? "").toLowerCase().includes("user_reports")) ??
            reportLayers[0] ??
            null;
          primaryReportLayerRef.current = primaryReportLayer;
        }

        // Single click handler:
        // 1) if click hits a report feature -> open popup
        // 2) otherwise -> pick coordinates and show marker
        const clickHandle = view.on("click", async (event) => {
          if (!view || !view.popup) return;

          const reportLayers = reportLayersRef.current;
          if (reportLayers.length > 0) {
            const hit = await view.hitTest(event, {
              include: reportLayers,
            } as __esri.MapViewHitTestOptions);

            const graphicHits = hit.results.filter(
              (r): r is __esri.GraphicHit => "graphic" in r && !!(r as any).graphic
            );

            const target = graphicHits
              .map((r) => r.graphic)
              .find((g) => {
                const attrs = g.attributes as Record<string, unknown> | null;
                if (!attrs) return false;
                return (
                  "userId" in attrs &&
                  "noiseLevel" in attrs &&
                  "category" in attrs &&
                  "reportTimestamp" in attrs
                );
              });

            if (target) {
              if (!target.popupTemplate) target.popupTemplate = reportPopupTemplate;
              view.popup.open({
                features: [target],
                location: event.mapPoint,
              });
              return;
            }

            const primaryReportLayer = primaryReportLayerRef.current;
            if (primaryReportLayer) {
              const query = primaryReportLayer.createQuery();
              query.geometry = event.mapPoint;
              query.spatialRelationship = "intersects";
              query.distance = 30;
              query.units = "meters";
              query.outFields = ["*"];
              query.returnGeometry = true;
              query.num = 1;

              const { features } = await primaryReportLayer.queryFeatures(query);
              if (features && features.length > 0) {
                const feature = features[0];
                if (!feature.popupTemplate) feature.popupTemplate = reportPopupTemplate;
                view.popup.open({
                  features: [feature],
                  location: feature.geometry ?? event.mapPoint,
                });
                return;
              }
            }
          }

          const pt = view.toMap({ x: event.x, y: event.y });
          if (!pt) return;
          if (typeof pt.latitude !== "number" || typeof pt.longitude !== "number") return;

          const coords = {
            lat: Number(pt.latitude.toFixed(6)),
            lon: Number(pt.longitude.toFixed(6)),
          };

          onPickLocationRef.current?.(coords);
          pickedLocationRef.current = coords;
          renderMarkers();
        });

        handles.push(clickHandle);

        // Initial marker render (in case pickedLocation already exists)
        renderMarkers();
      } catch (err) {
        console.error("❌ ArcGIS init failed", err);
      }
    }

    init();

    return () => {
      handles.forEach((h) => h.remove());
      view?.destroy();
      viewRef.current = null;
      graphicsLayerRef.current = null;
      reportLayersRef.current = [];
      primaryReportLayerRef.current = null;
    };
  }, []);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
