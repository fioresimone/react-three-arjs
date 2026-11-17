import type { ReactElement } from 'react';
import { ARCanvas, Marker, MarkerTracking } from '@simonefiore/react-three-arjs';
import { Status } from './Status';

export function CameraModeDemo(): ReactElement {
  return (
    <ARCanvas overlay={<Status />}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 3]} intensity={1.5} />
      <MarkerTracking>
        <Marker preset="hiro" changeMatrixMode="cameraTransformMatrix" smoothing>
          <gridHelper args={[4, 8]} />
          <mesh position-y={0.25}>
            <cylinderGeometry args={[0.3, 0.3, 0.5, 32]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        </Marker>
      </MarkerTracking>
    </ARCanvas>
  );
}
