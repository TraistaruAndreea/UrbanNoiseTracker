import { useEffect, useRef } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";

export default function ArcGisMap() {
  const divRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!divRef.current) return;

    const map = new Map({
      basemap: "osm", // FREE, fără credit
    });

    const view = new MapView({
      container: divRef.current,
      map,
      center: [26.1, 44.43],
      zoom: 12,
    });

    view.when(() => {
      console.log("✅ Harta OSM încărcată");
    });

    return () => view.destroy();
  }, []);

  return <div ref={divRef} style={{ width: "100%", height: "100%" }} />;
}
