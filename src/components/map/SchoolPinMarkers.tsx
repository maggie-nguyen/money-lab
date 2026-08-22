"use client";

import { Marker } from "@vis.gl/react-google-maps";
import type { SchoolPin } from "@/lib/map";
import { schoolMarkerIconUrl } from "@/lib/map";

type Props = {
  schools: SchoolPin[];
  onSelect?: (school: SchoolPin) => void;
};

export function SchoolPinMarkers({ schools, onSelect }: Props) {
  return (
    <>
      {schools.map((s) => (
        <Marker
          key={s.id}
          position={{ lat: s.lat, lng: s.lng }}
          title={s.name}
          icon={{
            url: schoolMarkerIconUrl(s.kind),
            scaledSize: { width: 28, height: 28, equals: () => false },
            anchor: { x: 14, y: 14, equals: () => false },
          }}
          zIndex={1}
          onClick={() => onSelect?.(s)}
        />
      ))}
    </>
  );
}
