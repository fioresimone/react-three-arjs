import { useFrame } from '@react-three/fiber';
import { useRef, useState, type ReactElement } from 'react';
import { ARCanvas, Marker, MarkerTracking, useCameraDevices } from '@simonefiore/react-three-arjs';
import type { Mesh } from 'three';
import { Status } from './Status';

function SpinningKnot(): ReactElement {
  const mesh = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  useFrame((_, dt) => {
    if (mesh.current) mesh.current.rotation.y += dt;
  });
  return (
    <mesh
      ref={mesh}
      position-y={0.6}
      scale={0.35}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <torusKnotGeometry />
      <meshNormalMaterial wireframe={hovered} />
    </mesh>
  );
}

export function MarkerDemo(): ReactElement {
  const devices = useCameraDevices();
  const [deviceId, setDeviceId] = useState<string>('');
  return (
    <ARCanvas
      source={deviceId ? { type: 'webcam', deviceId } : { type: 'webcam' }}
      overlay={
        <Status>
          {devices.length > 1 && (
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              style={{ marginLeft: 8 }}
            >
              <option value="">Default camera</option>
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}
        </Status>
      }
    >
      <MarkerTracking>
        <Marker preset="hiro" smoothing={{ type: 'one-euro' }} lostDelay={200}>
          <SpinningKnot />
        </Marker>
      </MarkerTracking>
    </ARCanvas>
  );
}
