import { useEffect, useRef } from "react";

import WebMap from "@arcgis/core/WebMap";
import MapView from "@arcgis/core/views/MapView";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

import OAuthInfo from "@arcgis/core/identity/OAuthInfo";
import IdentityManager from "@arcgis/core/identity/IdentityManager";
import esriConfig from "@arcgis/core/config";

export default function ArcGisMap() {
  const divRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!divRef.current) return;

    let view: MapView | null = null;
    let clickHandle: __esri.Handle | null = null;

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

        await view.when();
        console.log("✅ WebMap încărcată complet");

        // Asigură popup-urile active (API compatibil cu typings-urile curente)
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

        // Aplică template-ul pe orice FeatureLayer care are câmpurile cerute
        await webmap.loadAll();
        const featureLayers = webmap.allLayers.filter(
          (layer): layer is FeatureLayer => layer.type === "feature"
        );

        if (featureLayers.length === 0) {
          console.warn("⚠️ Nu am găsit niciun FeatureLayer în WebMap");
          return;
        }

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

        console.log(
          "✅ Report layers cu popupTemplate:",
          reportLayers.map((l) => l.title)
        );

        const primaryReportLayer =
          reportLayers.find((l) => l.title === "User_Reports") ??
          reportLayers.find(
            (l) => (l.title ?? "").toLowerCase().includes("user_reports")
          ) ??
          reportLayers[0];

        // Forțăm deschiderea popup-ului la click pe feature
        clickHandle = view.on("click", async (event) => {
          if (!view || !view.popup) return;

          // Restrângem hitTest la layerele relevante
          const hit = await view.hitTest(event, {
            include: reportLayers,
          } as __esri.MapViewHitTestOptions);

          const graphicHits = hit.results.filter(
            (r): r is __esri.GraphicHit => "graphic" in r && !!(r as any).graphic
          );

          // Alege primul feature care are atributele cerute (indiferent de layer)
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
            if (!target.popupTemplate)
              target.popupTemplate = reportPopupTemplate;

            view.popup.open({
              features: [target],
              location: event.mapPoint,
            });
            return;
          }

          // Fallback: dacă e heatmap deasupra sau click-ul e "aproape" de punct,
          // facem o interogare mică în layer-ul principal.
          if (!primaryReportLayer) return;
          const query = primaryReportLayer.createQuery();
          query.geometry = event.mapPoint;
          query.spatialRelationship = "intersects";
          query.distance = 30;
          query.units = "meters";
          query.outFields = ["*"];
          query.returnGeometry = true;
          query.num = 1;

          const { features } = await primaryReportLayer.queryFeatures(query);
          if (!features || features.length === 0) return;

          const feature = features[0];
          if (!feature.popupTemplate)
            feature.popupTemplate = reportPopupTemplate;

          view.popup.open({
            features: [feature],
            location: feature.geometry ?? event.mapPoint,
          });
        });
      } catch (err) {
        console.error("❌ ArcGIS init failed", err);
      }
    }

    init();

    return () => {
      clickHandle?.remove();
      view?.destroy();
    };
  }, []);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
