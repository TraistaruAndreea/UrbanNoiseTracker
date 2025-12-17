import { useEffect, useRef } from "react";

import Map from "@arcgis/core/Map";
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

    async function init() {
      try {
        // 🌍 Portal
        esriConfig.portalUrl = "https://www.arcgis.com";

        // 🔐 OAuth config
        const oauthInfo = new OAuthInfo({
          appId: import.meta.env.VITE_ARCGIS_CLIENT_ID,
          portalUrl: "https://www.arcgis.com",
          popup: false, // 🔑 redirect full-page, NU popup
        });

        IdentityManager.registerOAuthInfos([oauthInfo]);

        // 🔑 Authenticate (silent if already logged in)
        await IdentityManager.getCredential("https://www.arcgis.com");
        console.log("✅ ArcGIS authenticated");

        // 🗺️ Map
        const map = new Map({
          basemap: "osm",
        });

        view = new MapView({
          container: divRef.current!,
          map,
          center: [26.1, 44.43],
          zoom: 12,
        });

        // 📍 Feature Layer (private or public)
        const userReportsLayer = new FeatureLayer({
          url: import.meta.env.VITE_ARCGIS_LAYER_USER_REPORTS_URL,
          outFields: ["*"],
          popupTemplate: {
            title: "Raport zgomot",
            content: `
              Categorie: {category}<br/>
              dB: {decibels}<br/>
              User: {userId}<br/>
              Timp: {reportTimestamp}
            `,
          },
        });

        map.add(userReportsLayer);

        await view.when();
        console.log("🗺️ Harta încărcată complet");
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
