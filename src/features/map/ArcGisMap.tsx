import { useEffect, useRef } from "react";

import WebMap from "@arcgis/core/WebMap";
import MapView from "@arcgis/core/views/MapView";

import OAuthInfo from "@arcgis/core/identity/OAuthInfo";
import IdentityManager from "@arcgis/core/identity/IdentityManager";
import esriConfig from "@arcgis/core/config";

export default function ArcGisMap() {
  const divRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!divRef.current) return;

    let view: MapView | null = null;

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

        // (opțional) accesezi un FeatureLayer din WebMap
        const userReportsLayer = webmap.layers.find(
          (layer) => layer.type === "feature"
        );

        console.log("FeatureLayer:", userReportsLayer);
      } catch (err) {
        console.error("❌ ArcGIS init failed", err);
      }
    }

    init();

    return () => {
      view?.destroy();
    };
  }, []);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
