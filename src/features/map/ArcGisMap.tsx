import { useEffect, useRef } from "react";

import WebMap from "@arcgis/core/WebMap";
import MapView from "@arcgis/core/views/MapView";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import Polyline from "@arcgis/core/geometry/Polyline";
import * as route from "@arcgis/core/rest/route";
import RouteParameters from "@arcgis/core/rest/support/RouteParameters";
import FeatureSet from "@arcgis/core/rest/support/FeatureSet";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";

import OAuthInfo from "@arcgis/core/identity/OAuthInfo";
import IdentityManager from "@arcgis/core/identity/IdentityManager";
import esriConfig from "@arcgis/core/config";
import { auth } from "../../lib/firebase";
import { addFavoriteZoneId, getUserDoc, removeFavoriteZoneId } from "../../lib/firestore";

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
  /** When enabled, clicking an existing feature will draw a route from live user location to that feature. */
  routingEnabled?: boolean;
  /** Incrementing this value clears the current route. */
  clearRouteTick?: number;
  /** Optional: surface routing status to UI (instead of relying on console). */
  onRoutingStatus?: (status: string) => void;
};

export default function ArcGisMap({
  webmapItemId,
  onPickLocation,
  pickedLocation,
  savedPoints,
  onArcGisReady,
  enablePicking = true,
  enableEdits = true,
  routingEnabled = false,
  clearRouteTick = 0,
  onRoutingStatus,
}: ArcGisMapProps) {
  const divRef = useRef<HTMLDivElement | null>(null);

  // Keep latest values without re-initializing the ArcGIS view.
  const onPickLocationRef = useRef<ArcGisMapProps["onPickLocation"]>(onPickLocation);
  const pickedLocationRef = useRef<ArcGisMapProps["pickedLocation"]>(pickedLocation);
  const savedPointsRef = useRef<ArcGisMapProps["savedPoints"]>(savedPoints);
  const onArcGisReadyRef = useRef<ArcGisMapProps["onArcGisReady"]>(onArcGisReady);

  const viewRef = useRef<MapView | null>(null);
  const graphicsLayerRef = useRef<GraphicsLayer | null>(null);
  const routeLayerRef = useRef<GraphicsLayer | null>(null);
  const locationLayerRef = useRef<GraphicsLayer | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const latestUserPointRef = useRef<Point | null>(null);
  const lastClearTickRef = useRef<number>(clearRouteTick);
  const routingEnabledRef = useRef<boolean>(routingEnabled);
  const reportLayersRef = useRef<FeatureLayer[]>([]);
  const primaryReportLayerRef = useRef<FeatureLayer | null>(null);
  const userReportsLayerRef = useRef<FeatureLayer | null>(null);
  const quietRecommendationsLayerRef = useRef<FeatureLayer | null>(null);

  const ROUTE_SERVICE_URL = "https://route.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World";

  // Used for favorite grouping on the account page.
  // We infer the map type from the WebMap item id.
  const mapType: "noisy" | "quiet" | "unknown" =
    webmapItemId === "214b24b9b3614049bc64254e3fc42b76"
      ? "noisy"
      : webmapItemId === "7d8482d6700d4e49a9374f16ea912e01"
        ? "quiet"
        : "unknown";

  const toWgs84Point = (p: Point): Point => {
    const sr = (p.spatialReference as any)?.wkid;
    if (!sr || sr === 4326) return p;
    // Most WebMaps are in WebMercator (102100/3857). Convert those safely.
    if (sr === 102100 || sr === 3857) {
      const converted = webMercatorUtils.webMercatorToGeographic(p) as Point;
      return converted;
    }
    // Fallback: return as-is.
    return p;
  };

  const drawRouteStreet = async (from: Point, to: Point) => {
    const routeLayer = routeLayerRef.current;
    if (!routeLayer) return;

    const fromWgs = toWgs84Point(from);
    const toWgs = toWgs84Point(to);

    if (!Number.isFinite(fromWgs.latitude) || !Number.isFinite(fromWgs.longitude)) {
      console.warn("⚠️ Routing: invalid user location point", fromWgs);
      onRoutingStatus?.("Rutare: locația ta nu e disponibilă încă.");
      return;
    }
    if (!Number.isFinite(toWgs.latitude) || !Number.isFinite(toWgs.longitude)) {
      console.warn("⚠️ Routing: invalid destination point", toWgs);
      onRoutingStatus?.("Rutare: destinație invalidă.");
      return;
    }

    const toLat = Number(toWgs.latitude);
    const toLon = Number(toWgs.longitude);
    onRoutingStatus?.(
      `Rutare: calculez traseu către (${toLat.toFixed(5)}, ${toLon.toFixed(5)})…`
    );

    try {
      const stops = new FeatureSet({
        features: [
          new Graphic({ geometry: fromWgs }),
          new Graphic({ geometry: toWgs }),
        ],
      });

      const params = new RouteParameters({
        stops,
        returnDirections: true,
        returnRoutes: true,
        outSpatialReference: { wkid: 4326 },
      });

      // Ensure the request uses the current authenticated ArcGIS session.
      const result = await route.solve(ROUTE_SERVICE_URL, params, {
        authentication: IdentityManager,
      } as any);
      const routeGeom = result?.routeResults?.[0]?.route?.geometry as Polyline | undefined;
      if (!routeGeom) return;

      routeLayer.removeAll();
      routeLayer.add(
        new Graphic({
          geometry: routeGeom,
          symbol: new SimpleLineSymbol({
            color: "#f97316",
            width: 4,
          }),
        })
      );
      onRoutingStatus?.("Rutare: gata.");
    } catch (e) {
      // If the route service isn't available (token/credits/network), fall back to a simple line.
      const fromLon = Number(fromWgs.longitude);
      const fromLat = Number(fromWgs.latitude);
      const toLon = Number(toWgs.longitude);
      const toLat = Number(toWgs.latitude);

      const line = new Polyline({
        paths: [
          [
            [fromLon, fromLat],
            [toLon, toLat],
          ],
        ],
        spatialReference: { wkid: 4326 },
      });

      routeLayer.removeAll();
      routeLayer.add(
        new Graphic({
          geometry: line,
          symbol: new SimpleLineSymbol({
            color: "#f97316",
            width: 3,
            style: "dash",
          }),
        })
      );
      console.warn("⚠️ Route solve failed; using straight-line fallback", e);
      onRoutingStatus?.("Rutare: nu am putut calcula pe străzi (fallback linie). Verifică ArcGIS credits/permissions.");
    }
  };

  useEffect(() => {
    onPickLocationRef.current = onPickLocation;
  }, [onPickLocation]);

  useEffect(() => {
    pickedLocationRef.current = pickedLocation;
  }, [pickedLocation]);

  useEffect(() => {
    routingEnabledRef.current = routingEnabled;
  }, [routingEnabled]);

  // Clear route when requested by parent.
  useEffect(() => {
    if (lastClearTickRef.current === clearRouteTick) return;
    lastClearTickRef.current = clearRouteTick;
    routeLayerRef.current?.removeAll();
  }, [clearRouteTick]);

  // Live user location (only when routing is enabled).
  useEffect(() => {
    const locationLayer = locationLayerRef.current;
    if (!locationLayer) return;

    if (!routingEnabled) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      locationLayer.removeAll();
      latestUserPointRef.current = null;
      routeLayerRef.current?.removeAll();
      return;
    }

    if (!navigator.geolocation) return;

    if (watchIdRef.current != null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const point = new Point({ latitude, longitude });
        latestUserPointRef.current = point;

        locationLayer.removeAll();
        locationLayer.add(
          new Graphic({
            geometry: point,
            symbol: new SimpleMarkerSymbol({
              style: "circle",
              color: "#2563eb",
              size: 10,
              outline: { color: "#ffffff", width: 1 },
            }),
          })
        );
      },
      () => {
        // ignore
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [routingEnabled]);

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

  // Layers:
  // - markers: picked preview marker
  // - route: route polyline
  // - user location: live location marker
  const markerLayer = new GraphicsLayer({ title: "markers" });
  const routeLayer = new GraphicsLayer({ title: "route" });
  const locationLayer = new GraphicsLayer({ title: "user_location" });

  graphicsLayerRef.current = markerLayer;
  routeLayerRef.current = routeLayer;
  locationLayerRef.current = locationLayer;

  webmap.addMany([markerLayer, routeLayer, locationLayer]);

        await view.when();
        console.log("✅ WebMap încărcată complet");

  // Keep popup enabled for existing features.
  view.popupEnabled = true;

        const reportPopupTemplate: __esri.PopupTemplateProperties = {
          title: "User report",
          actions: [
            {
              id: "toggle-favorite",
              title: "Adaugă la favorite",
              className: "esri-icon-favorites favorite-off",
            } as any,
          ],
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

        const quietPopupTemplate: __esri.PopupTemplateProperties = {
          title: "Zonă liniștită",
          actions: [
            {
              id: "toggle-favorite",
              title: "Adaugă la favorite",
              className: "esri-icon-favorites favorite-off",
            } as any,
          ],
          content: [
            {
              type: "fields",
              fieldInfos: [
                { fieldName: "addedBy", label: "addedBy" },
                { fieldName: "score", label: "score" },
                { fieldName: "description", label: "description" },
                {
                  fieldName: "timestamp",
                  label: "timestamp",
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

        const quietRequired = new Set(["addedBy", "score", "description"]);

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

          // Enable popup + favorites for quiet zones layers as well.
          for (const layer of featureLayers) {
            const fieldNames = new Set(layer.fields?.map((f) => f.name) ?? []);
            const matches = [...quietRequired].every((f) => fieldNames.has(f));
            if (!matches) continue;

            layer.outFields = ["*"];
            layer.popupEnabled = true;
            layer.popupTemplate = quietPopupTemplate;
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

          // When routing is enabled: route has priority over popups/picking.
          if (routingEnabledRef.current) {
            onRoutingStatus?.("Rutare: am primit click (încerc să determin destinația)…");
            const userPoint = latestUserPointRef.current;
            if (!userPoint) {
              console.warn("⚠️ Routing: no user location yet (allow location permission?)");
              onRoutingStatus?.("Rutare: permite locația în browser ca să pot calcula traseul.");
            } else {
              try {
                // Explicitly include all feature layers so clicks on `User_Reports` (and any other point layers)
                // consistently return a graphic hit.
                const allFeatureLayers = view.map?.allLayers?.filter(
                  (l): l is FeatureLayer => (l as any)?.type === "feature"
                );

                const hit = await view.hitTest(
                  event,
                  allFeatureLayers && allFeatureLayers.length > 0
                    ? ({ include: allFeatureLayers } as __esri.MapViewHitTestOptions)
                    : undefined
                );
                const graphicHit = hit.results.find((r): r is __esri.GraphicHit => {
                  const g = (r as any).graphic as Graphic | undefined;
                  if (!g) return false;
                  // Ignore clicks on our own overlay graphics.
                  if (g.layer && (g.layer === graphicsLayerRef.current || g.layer === routeLayerRef.current || g.layer === locationLayerRef.current)) {
                    return false;
                  }
                  return true;
                });

                const g = (graphicHit as any)?.graphic as Graphic | undefined;
                const geom = g?.geometry as any;
                // Prefer routing to the clicked feature's point geometry.
                if (geom?.type === "point") {
                  await drawRouteStreet(userPoint, geom as Point);
                  return;
                }

                // Fallback: if we didn't hit a point feature, route to the clicked map point.
                if (event.mapPoint && (event.mapPoint as any).type === "point") {
                  await drawRouteStreet(userPoint, event.mapPoint as Point);
                  return;
                }
              } catch {
                // fall through
              }
            }
          }

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

        // Popup action: toggle favorite
        // ArcGIS JS API emits `trigger-action` on the Popup, not on the MapView.
        const v = view;
        if (!v?.popup) return;

        const logPrefix = `[favorites:${mapType}]`;

        // We bind BOTH trigger-action (when available) and a DOM click fallback.
        // Some ArcGIS builds expose `.on` but don't emit `trigger-action` reliably.
        // To prevent double-toggles when both fire, we guard the handler.
        let toggleInFlight = false;
        let lastToggleKey = "";
        let lastToggleAt = 0;

        const FAVORITE_ACTION_ID = "toggle-favorite";
        const FAVORITE_ICON_CLASS = "esri-icon-favorites";
        const FAVORITE_ON_CLASS = "favorite-on";
        const FAVORITE_OFF_CLASS = "favorite-off";

        const setToggleUi = (opts: { title?: string; isFavorite?: boolean }) => {
          try {
            // `actions` is a Collection; it supports `.find`.
            const actions: any = v.popup?.actions;
            const toggle = actions?.find?.((a: any) => a?.id === FAVORITE_ACTION_ID);
            if (toggle) {
              if (typeof opts.title === "string") {
                toggle.title = opts.title;
              }
              if (typeof opts.isFavorite === "boolean") {
                toggle.className = `${FAVORITE_ICON_CLASS} ${
                  opts.isFavorite ? FAVORITE_ON_CLASS : FAVORITE_OFF_CLASS
                }`;
              }
            }

            // Best-effort DOM sync (some ArcGIS builds don't rerender immediately).
            try {
              const container = (v.popup as any)?.container as HTMLElement | null | undefined;
              const actionEl = container?.querySelector(
                `[data-action-id="${FAVORITE_ACTION_ID}"], .esri-popup__action[data-action-id="${FAVORITE_ACTION_ID}"]`
              ) as HTMLElement | null;
              if (actionEl && typeof opts.isFavorite === "boolean") {
                const favFlag = opts.isFavorite ? "1" : "0";
                const favColor = opts.isFavorite ? "#f59e0b" : "#6b7280";

                actionEl.setAttribute("data-favorite", opts.isFavorite ? "1" : "0");
                actionEl.classList.toggle(FAVORITE_ON_CLASS, opts.isFavorite);
                actionEl.classList.toggle(FAVORITE_OFF_CLASS, !opts.isFavorite);

                // Inline style: most robust override for ArcGIS Online popup styling.
                actionEl.style.color = favColor;

                // Icon may be rendered with different classnames depending on ArcGIS build.
                const iconEls = actionEl.querySelectorAll(
                  ".esri-icon-favorites, .esri-popup__action-icon, .esri-icon"
                ) as NodeListOf<HTMLElement>;
                iconEls.forEach((iconEl) => {
                  iconEl.setAttribute("data-favorite", favFlag);
                  iconEl.classList.toggle(FAVORITE_ON_CLASS, opts.isFavorite);
                  iconEl.classList.toggle(FAVORITE_OFF_CLASS, !opts.isFavorite);
                  iconEl.style.color = favColor;
                });
              }
            } catch {
              // ignore
            }
          } catch {
            // ignore
          }
        };

        const getFavoriteInfoForFeature = (feature: Graphic | null) => {
          if (!feature) return null;

          const layerAny: any = feature.layer;
          const layerTitle = String(layerAny?.title ?? layerAny?.id ?? "unknown");
          const attrs: any = feature.attributes ?? {};
          const oidField: string | undefined = layerAny?.objectIdField;

          const oid =
            (oidField ? attrs?.[oidField] : undefined) ??
            attrs?.OBJECTID ??
            attrs?.objectid ??
            attrs?.ObjectId ??
            attrs?.objectId;

          if (oid == null) {
            console.warn(`${logPrefix} cannot determine objectId`, {
              layerTitle,
              oidField,
              attributeKeys: Object.keys(attrs ?? {}),
              attrs,
            });
            return null;
          }

          return {
            favoriteId: `arcgis:${mapType}:${layerTitle}:${String(oid)}`,
            layerTitle,
            oid,
          };
        };

        const syncFavoriteTitleToSelected = async (feature: Graphic | null) => {
          const info = getFavoriteInfoForFeature(feature);
          if (!info) {
            console.debug(`${logPrefix} selectedFeature changed but no favorite info`);
            return;
          }

          console.debug(`${logPrefix} selectedFeature`, {
            favoriteId: info.favoriteId,
            layerTitle: info.layerTitle,
            oid: info.oid,
          });

          const u = auth.currentUser;
          if (!u) {
            console.warn(`${logPrefix} firebase auth.currentUser is null (not logged in?)`);
            setToggleUi({ title: "Adaugă la favorite", isFavorite: false });
            return;
          }

          try {
            const userDoc = await getUserDoc(u.uid);
            const existing = userDoc?.favoriteZones ?? [];
            const isFav = existing.includes(info.favoriteId);
            setToggleUi({
              title: isFav ? "Scoate de la favorite" : "Adaugă la favorite",
              isFavorite: isFav,
            });
            console.debug(`${logPrefix} title synced`, {
              uid: u.uid,
              isFav,
              favoritesCount: existing.length,
            });
          } catch (e: any) {
            console.warn(`${logPrefix} title sync failed`, e);
            // ignore title sync errors
          }
        };

        // Some ArcGIS builds expose `watch` on the MapView but not on the Popup instance.
        // Watch the nested property from the view to keep the action title in sync.
        const viewWatch = (v as any).watch as ((path: string, cb: (value: any) => void) => __esri.Handle) | undefined;
        if (typeof viewWatch === "function") {
          const selectedHandle = viewWatch.call(v, "popup.selectedFeature", (feature: any) => {
            void syncFavoriteTitleToSelected(feature as Graphic | null);
            // Popup UI (including action buttons) may re-render; re-bind DOM fallback.
            setTimeout(() => {
              void bindDomFavoriteActionFallback();
            }, 0);
          });
          handles.push(selectedHandle as any);
          // Initial sync if popup already has a selected feature.
          void syncFavoriteTitleToSelected(v.popup?.selectedFeature as any);
        } else {
          console.warn(`${logPrefix} cannot watch popup.selectedFeature (view.watch missing)`);
        }

        const onTriggerAction = async (evt: any) => {
          if (evt.action?.id !== FAVORITE_ACTION_ID) return;

          console.log(`${logPrefix} trigger-action`, {
            actionId: evt.action?.id,
            actionTitle: evt.action?.title,
          });

          const u = auth.currentUser;
          if (!u) {
            console.warn(`${logPrefix} blocked: not logged in`);
            onRoutingStatus?.("Trebuie să fii logat ca să setezi favorite.");
            setToggleUi({ title: "Adaugă la favorite", isFavorite: false });
            return;
          }

          const feature = v.popup?.selectedFeature as Graphic | null;
          const info = getFavoriteInfoForFeature(feature);
          if (!info) {
            console.warn(`${logPrefix} blocked: no selectedFeature or missing objectId`, {
              hasSelectedFeature: Boolean(feature),
              layerTitle: (feature?.layer as any)?.title,
              attrs: feature?.attributes,
            });
            onRoutingStatus?.("Nu pot determina ce punct ai selectat.");
            return;
          }

          console.log(`${logPrefix} toggle requested`, {
            uid: u.uid,
            favoriteId: info.favoriteId,
            layerTitle: info.layerTitle,
            oid: info.oid,
          });

          // Guard against duplicate events (trigger-action + DOM click) firing for the same action.
          const toggleKey = `${u.uid}:${info.favoriteId}`;
          const now = Date.now();
          if (toggleInFlight && toggleKey === lastToggleKey) {
            console.debug(`${logPrefix} ignoring duplicate toggle (in-flight)`, { toggleKey });
            return;
          }
          if (toggleKey === lastToggleKey && now - lastToggleAt < 800) {
            console.debug(`${logPrefix} ignoring duplicate toggle (debounced)`, { toggleKey });
            return;
          }

          toggleInFlight = true;
          lastToggleKey = toggleKey;
          lastToggleAt = now;

          try {
            const userDoc = await getUserDoc(u.uid);
            const existing = userDoc?.favoriteZones ?? [];
            const isFav = existing.includes(info.favoriteId);

            console.log(`${logPrefix} current favorites`, {
              isFav,
              favoritesCount: existing.length,
            });

            if (isFav) {
              console.log(`${logPrefix} removing favorite...`);
              await removeFavoriteZoneId(u.uid, info.favoriteId);
              console.log(`${logPrefix} removed favorite OK`);
              onRoutingStatus?.("Scos de la favorite.");
              (evt.action as any).title = "Adaugă la favorite";
              setToggleUi({ title: "Adaugă la favorite", isFavorite: false });
            } else {
              console.log(`${logPrefix} adding favorite...`);
              await addFavoriteZoneId(u.uid, info.favoriteId);
              console.log(`${logPrefix} added favorite OK`);
              onRoutingStatus?.("Adăugat la favorite.");
              (evt.action as any).title = "Scoate de la favorite";
              setToggleUi({ title: "Scoate de la favorite", isFavorite: true });
            }
          } catch (e: any) {
            console.error(`${logPrefix} Firestore write failed`, e);
            const msg = e?.message ?? String(e);
            if (/blocked by client|err_blocked_by_client/i.test(msg)) {
              onRoutingStatus?.("Cererea către Firestore a fost blocată de browser (adblock/extension). Dezactivează uBlock/AdBlock pentru acest site.");
            } else {
              onRoutingStatus?.(msg);
            }
          } finally {
            toggleInFlight = false;
          }
        };

        const bindDomFavoriteActionFallback = () => {
          try {
            const container = (v.popup as any)?.container as HTMLElement | null | undefined;
            if (!container) return false;

            const el = container.querySelector(
              '[data-action-id="toggle-favorite"], .esri-popup__action[data-action-id="toggle-favorite"]'
            ) as HTMLElement | null;
            if (!el) return false;

            // Prevent multiple bindings when popup re-renders.
            const anyEl = el as any;
            if (anyEl.__favoriteBound) return true;
            anyEl.__favoriteBound = true;

            el.addEventListener("click", () => {
              console.debug(`${logPrefix} DOM fallback click captured for toggle-favorite`);
              void onTriggerAction({ action: { id: "toggle-favorite", title: (el as any)?.title } });
            });

            console.debug(`${logPrefix} DOM fallback bound for toggle-favorite`);
            return true;
          } catch (e) {
            console.warn(`${logPrefix} DOM fallback bind failed`, e);
            return false;
          }
        };

        // Depending on ArcGIS runtime, `trigger-action` can be emitted by the Popup, PopupViewModel, or the View.
        const popupAny: any = v.popup;
        const popupOn = popupAny?.on;
        const popupVmOn = popupAny?.viewModel?.on;
        const viewOn = (v as any)?.on;

        if (typeof popupOn === "function") {
          console.debug(`${logPrefix} listening for trigger-action on popup`);
          const actionHandle = popupOn.call(popupAny, "trigger-action", onTriggerAction);
          handles.push(actionHandle as any);
        } else if (typeof popupVmOn === "function") {
          console.debug(`${logPrefix} listening for trigger-action on popup.viewModel`);
          const actionHandle = popupVmOn.call(popupAny.viewModel, "trigger-action", onTriggerAction);
          handles.push(actionHandle as any);
        } else if (typeof viewOn === "function") {
          console.debug(`${logPrefix} listening for trigger-action on view (fallback)`);
          const actionHandle = viewOn.call(v, "trigger-action", onTriggerAction);
          handles.push(actionHandle as any);
        } else {
          console.warn(`${logPrefix} cannot attach trigger-action listener (no .on found). Will try DOM fallback.`);
        }

        // As a last resort, bind a DOM click listener to the popup action button.
        // This helps in cases where ArcGIS runtime doesn't expose trigger-action events.
        // Try now and also after a popup selection change (popup UI re-renders).
        void bindDomFavoriteActionFallback();

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
