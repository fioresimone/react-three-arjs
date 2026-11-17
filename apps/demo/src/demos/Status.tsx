import type { ReactElement, ReactNode } from 'react';
import { useAR } from '@simonefiore/react-three-arjs';

/** DOM overlay showing pipeline status and errors; reads state with useAR(). */
export function Status({ children }: { children?: ReactNode }): ReactElement {
  const sourceStatus = useAR((s) => s.sourceStatus);
  const error = useAR((s) => s.error);
  const ready = useAR((s) => s.markerTrackingReady);
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        right: 12,
        zIndex: 10,
        background: 'rgba(0,0,0,0.55)',
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 14,
      }}
    >
      {error ? (
        <span style={{ color: '#f88' }} data-testid="error">
          {error.code}: {error.message}
        </span>
      ) : (
        <span>
          Source: {sourceStatus}
          {ready ? ' · tracker ready' : ''}
        </span>
      )}
      {children}
    </div>
  );
}
