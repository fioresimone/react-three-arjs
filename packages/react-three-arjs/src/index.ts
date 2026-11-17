/**
 * Marker-based and location-based AR for React Three Fiber.
 *
 * @packageDocumentation
 */
export { ARCanvas, type ARCanvasProps } from './react/ARCanvas';
export { ARCamera } from './react/ar-camera';
export { useAR, type ARState, type SourceStatus, type OrientationPermission } from './react/store';
export { MarkerTracking, type MarkerTrackingProps } from './react/MarkerTracking';
export {
  Marker,
  useMarkerVisible,
  useMarkerSize,
  type MarkerProps,
  type MarkerTarget,
  type MarkerEventInfo,
} from './react/Marker';
export { MarkerHelper, type MarkerHelperProps } from './react/MarkerHelper';
export {
  LocationTracking,
  useLocationBased,
  type LocationTrackingProps,
  type SimulatedPosition,
} from './react/LocationTracking';
export { GpsPlace, useGpsDistance, type GpsPlaceProps } from './react/GpsPlace';
export { useCameraDevices } from './react/useCameraDevices';

// Everything from the framework-agnostic core is also available here.
export * from './core';
