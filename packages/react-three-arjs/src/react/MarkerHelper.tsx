import { useEffect, useMemo, type ReactElement } from 'react';
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  SRGBColorSpace,
} from 'three';
import { useMarkerSize } from './Marker';

export interface MarkerHelperProps {
  /** Text drawn on the marker plane, e.g. its name or barcode value. */
  label?: string;
  /** Outline and label colour. Default `'#00ffff'`. */
  color?: string;
  /** Show RGB axes (X red, Y green, Z blue). Default true. */
  axes?: boolean;
}

/**
 * Debug overlay for a `<Marker>`: outlines the marker square, shows its axes
 * and an optional label. Port of AR.js `ArMarkerHelper`.
 */
export function MarkerHelper({
  label,
  color = '#00ffff',
  axes = true,
}: MarkerHelperProps): ReactElement {
  const size = useMarkerSize();
  const outline = useMemo(() => {
    const h = size / 2;
    const g = new BufferGeometry();
    g.setAttribute(
      'position',
      new Float32BufferAttribute([-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h, -h, 0, -h], 3),
    );
    return new Line(g, new LineBasicMaterial({ color }));
  }, [size, color]);

  const texture = useMemo(() => {
    if (!label) return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = color;
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 128, 128, 240);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [label, color]);

  useEffect(
    () => () => {
      outline.geometry.dispose();
      outline.material.dispose();
    },
    [outline],
  );
  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <group>
      <primitive object={outline} />
      {axes && <axesHelper args={[size / 2]} />}
      {texture && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
          <planeGeometry args={[size, size]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
