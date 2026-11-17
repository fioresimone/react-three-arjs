import { useFrame, useThree } from '@react-three/fiber';
import { useState, type ReactElement } from 'react';
import {
  ARCanvas,
  GpsPlace,
  LocationTracking,
  useAR,
  useGpsDistance,
  type SimulatedPosition,
} from '@simonefiore/react-three-arjs';
import { Status } from './Status';

// About 20 m north, east, south and west of the origin (1e-4 deg lat ≈ 11 m).
const offsets = [
  { name: 'North', dLat: 0.00018, dLon: 0, color: 'tomato' },
  { name: 'East', dLat: 0, dLon: 0.00028, color: 'gold' },
  { name: 'South', dLat: -0.00018, dLon: 0, color: 'limegreen' },
  { name: 'West', dLat: 0, dLon: -0.00028, color: 'deepskyblue' },
];

const SIMULATED: SimulatedPosition = { latitude: 45.4642, longitude: 9.19 };

/** On desktop there is no compass: turn slowly so every box comes into view. */
function AutoRotate(): null {
  const camera = useThree((s) => s.camera);
  useFrame((_, dt) => {
    camera.rotation.y += dt * 0.3;
  });
  return null;
}

function Place({
  name,
  latitude,
  longitude,
  color,
}: {
  name: string;
  latitude: number;
  longitude: number;
  color: string;
}): ReactElement {
  const distance = useGpsDistance(latitude, longitude);
  return (
    <GpsPlace latitude={latitude} longitude={longitude} maxDistance={500}>
      <mesh scale={4} userData={{ name, distance }}>
        <boxGeometry />
        <meshStandardMaterial color={color} />
      </mesh>
    </GpsPlace>
  );
}

function Places(): ReactElement | null {
  const origin = useAR((s) => s.gpsOrigin);
  if (!origin) return null;
  return (
    <>
      {offsets.map((o) => (
        <Place
          key={o.name}
          name={o.name}
          latitude={origin.latitude + o.dLat}
          longitude={origin.longitude + o.dLon}
          color={o.color}
        />
      ))}
    </>
  );
}

function LocationOverlay({
  simulate,
  setSimulate,
}: {
  simulate: boolean;
  setSimulate: (v: boolean) => void;
}): ReactElement {
  const position = useAR((s) => s.gpsPosition);
  const permission = useAR((s) => s.orientationPermission);
  const { requestOrientationPermission } = useAR();
  return (
    <Status>
      <div style={{ marginTop: 6 }}>
        {position
          ? `GPS ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)} ±${Math.round(position.accuracy)} m`
          : 'Waiting for GPS…'}
      </div>
      <label style={{ display: 'block', marginTop: 6 }}>
        <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />{' '}
        Simulate position (desktop)
      </label>
      {permission === 'prompt' && (
        <button onClick={() => void requestOrientationPermission()} style={{ marginTop: 6 }}>
          Enable compass
        </button>
      )}
    </Status>
  );
}

export function LocationDemo(): ReactElement {
  const [simulate, setSimulate] = useState(!('ontouchstart' in window));
  return (
    <ARCanvas fov={70} overlay={<LocationOverlay simulate={simulate} setSimulate={setSimulate} />}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} />
      <LocationTracking
        simulate={simulate ? SIMULATED : undefined}
        orientation={simulate ? false : { smoothingFactor: 0.3 }}
        gpsMinAccuracy={50}
      >
        {simulate && <AutoRotate />}
        <Places />
      </LocationTracking>
    </ARCanvas>
  );
}
