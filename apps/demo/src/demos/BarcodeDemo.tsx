import type { ReactElement } from 'react';
import { ARCanvas, Marker, MarkerHelper, MarkerTracking } from '@simonefiore/react-three-arjs';
import { Status } from './Status';

const colors = ['tomato', 'gold', 'limegreen', 'deepskyblue', 'orchid', 'white'];

export function BarcodeDemo(): ReactElement {
  return (
    <ARCanvas overlay={<Status />}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 4, 3]} />
      <MarkerTracking detectionMode="mono_and_matrix" matrixCodeType="3x3">
        {colors.map((color, value) => (
          <Marker key={value} type="barcode" value={value} smoothing={{ type: 'one-euro' }}>
            <MarkerHelper label={String(value)} color={color} />
            <mesh position-y={0.3}>
              <sphereGeometry args={[0.3, 32, 16]} />
              <meshStandardMaterial color={color} />
            </mesh>
          </Marker>
        ))}
      </MarkerTracking>
    </ARCanvas>
  );
}
