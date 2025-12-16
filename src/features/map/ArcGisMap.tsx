import { useEffect, useRef } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

export default function ArcGisMap() {
  const divRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!divRef.current) return;

    const map = new Map({
      basemap: "osm",
    });

    const view = new MapView({
      container: divRef.current,
      map,
      center: [26.1, 44.43],
      zoom: 12,
    });

    const userReportsLayer = new FeatureLayer({
      url: "https://andreeat.maps.arcgis.com/home/item.html?id=a57e16440d134ce9b5718bc65a35a678/0",
      outFields: ["*"],
      popupTemplate: {
        title: "Raport zgomot",
        content: `
          Categorie: {category}<br/>
          dB: {decibels}<br/>
          User: {userId}<br/>
          Timp: {timestamp}
        `,
      },
    });

    map.add(userReportsLayer);

    view.when(() => {
      console.log("✅ FeatureLayer încărcat");
    });

    return () => {
      view.destroy();
    };
  }, []);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
