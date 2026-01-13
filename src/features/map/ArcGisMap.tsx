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
  webmapItemId: string;
  onPickLocation?: (coords: { lat: number; lon: number }) => void;
  pickedLocation?: { lat: number; lon: number } | null;
  savedPoints?: Array<{ lat: number; lon: number; kind: "report" | "quiet" }>;
  onArcGisReady?: (api: {
    addNoiseReportFeature: (p: {
      lat: number;
      lon: number;
      category: string;
      decibels: number;
      timestamp: number;
      userId: string;
    }) => Promise<void>;
    addQuietZoneFeature: (p: {
      lat: number;
      lon: number;
      score: number;
      description: string;
      addedBy: string;
      timestamp: number;
    }) => Promise<void>;
  }) => void;
  /** When true, clicking the map picks coordinates (for forms). When false, map is view-only. */
  enablePicking?: boolean;
  /** When false, we don't expose applyEdits helpers (useful for view-only tab). */
  enableEdits?: boolean;
};

export default function ArcGisMap({
  webmapItemId,
  onPickLocation,
  pickedLocation,
  savedPoints,
  onArcGisReady,
  enablePicking = true,
  enableEdits = true,
}: ArcGisMapProps) {
  const divRef = useRef<HTMLDivElement | null>(null);

  // Keep latest values without re-initializing the ArcGIS view.
  const onPickLocationRef = useRef<ArcGisMapProps["onPickLocation"]>(onPickLocation);
  const pickedLocationRef = useRef<ArcGisMapProps["pickedLocation"]>(pickedLocation);
  const savedPointsRef = useRef<ArcGisMapProps["savedPoints"]>(savedPoints);
  const onArcGisReadyRef = useRef<ArcGisMapProps["onArcGisReady"]>(onArcGisReady);

  const viewRef = useRef<MapView | null>(null);
  const graphicsLayerRef = useRef<GraphicsLayer | null>(null);
  const reportLayersRef = useRef<FeatureLayer[]>([]);
  const primaryReportLayerRef = useRef<FeatureLayer | null>(null);
  const userReportsLayerRef = useRef<FeatureLayer | null>(null);
  const quietRecommendationsLayerRef = useRef<FeatureLayer | null>(null);

  useEffect(() => {
    onPickLocationRef.current = onPickLocation;
  }, [onPickLocation]);

  useEffect(() => {
    pickedLocationRef.current = pickedLocation;
  }, [pickedLocation]);

  useEffect(() => {
    savedPointsRef.current = savedPoints;
  }, [savedPoints]);

  useEffect(() => {
    onArcGisReadyRef.current = onArcGisReady;
  }, [onArcGisReady]);

  const renderMarkers = () => {
    const layer = graphicsLayerRef.current;
    if (!layer) return;

    layer.removeAll();

    // Note: saved points should be rendered by the ArcGIS FeatureLayers themselves
    // (so they look identical to the existing ArcGIS points). We keep only a
    // "picked" preview marker here.
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

  // Re-render preview marker when parent updates selected point.
  useEffect(() => {
    renderMarkers();
  }, [pickedLocation]);

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
            id: webmapItemId,
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

          // Pick destination layers by title
          const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");
          const findByTitle = (title: string) => {
            const t = normalize(title);
            return (
              featureLayers.find((l) => normalize(l.title ?? "") === t) ??
              featureLayers.find((l) => normalize(l.title ?? "").includes(t)) ??
              null
            );
          };

          userReportsLayerRef.current = findByTitle("User_Reports") ?? findByTitle("user_reports");
          quietRecommendationsLayerRef.current =
            findByTitle("QuietRecommendations") ?? findByTitle("quietrecommendations") ?? findByTitle("quiet_recommendations");

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
            userReportsLayerRef.current ??
            reportLayers.find((l) => l.title === "User_Reports") ??
            reportLayers.find((l) => (l.title ?? "").toLowerCase().includes("user_reports")) ??
            reportLayers[0] ??
            null;
          primaryReportLayerRef.current = primaryReportLayer;
        }

        if (enableEdits) {
          // Expose applyEdits helpers to parent so saved points are real ArcGIS features.
          onArcGisReadyRef.current?.({
            addNoiseReportFeature: async (p) => {
              const layer = userReportsLayerRef.current ?? primaryReportLayerRef.current;
              if (!layer) throw new Error("Nu am găsit layer-ul User_Reports în WebMap");

              await layer.load();

              const res = await layer.applyEdits({
                addFeatures: [
                  {
                    geometry: new Point({ latitude: p.lat, longitude: p.lon }),
                    attributes: {
                      userId: p.userId,
                      category: p.category,
                      noiseLevel: Math.round(p.decibels),
                      reportTimestamp: new Date(p.timestamp),
                    },
                  } as any,
                ],
              });

              const r0 = res.addFeatureResults?.[0];
              if (r0?.error) throw r0.error;
            },
            addQuietZoneFeature: async (p) => {
              const layer = quietRecommendationsLayerRef.current;
              if (!layer)
                throw new Error("Nu am găsit layer-ul QuietRecommendations în WebMap");

              await layer.load();

              const res = await layer.applyEdits({
                addFeatures: [
                  {
                    geometry: new Point({ latitude: p.lat, longitude: p.lon }),
                    attributes: {
                      score: p.score,
                      description: p.description,
                      addedBy: p.addedBy,
                      timestamp: new Date(p.timestamp),
                    },
                  } as any,
                ],
              });

              const r0 = res.addFeatureResults?.[0];
              if (r0?.error) throw r0.error;
            },
          });
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

          if (!enablePicking) return;

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
  }, [webmapItemId, enablePicking, enableEdits]);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
