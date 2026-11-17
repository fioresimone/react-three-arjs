import { useState, type ReactElement } from 'react';
import { ARCanvas, Marker, MarkerHelper, MarkerTracking } from '@simonefiore/react-three-arjs';
import { Status } from './Status';

export function ImageDemo(): ReactElement {
  const [found, setFound] = useState(false);
  return (
    <ARCanvas
      source={{ type: 'image', url: `${import.meta.env.BASE_URL}HIRO.jpg` }}
      fit="contain"
      overlay={
        <Status>
          <div data-testid="marker-state">{found ? 'Marker found' : 'Searching…'}</div>
        </Status>
      }
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 3]} intensity={1.5} />
      <MarkerTracking>
        <Marker preset="hiro" onFound={() => setFound(true)} onLost={() => setFound(false)}>
          <MarkerHelper label="HIRO" />
          <mesh position={[0.25, 0.15, 0.25]}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color="hotpink" transparent opacity={0.85} />
          </mesh>
        </Marker>
      </MarkerTracking>
    </ARCanvas>
  );
}
