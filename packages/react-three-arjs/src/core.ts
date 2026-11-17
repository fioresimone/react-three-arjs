/**
 * Framework-agnostic core: usable with plain three.js, without React.
 *
 * @packageDocumentation
 */
export { ArError, type ArErrorCode } from './core/errors';
export { Emitter } from './core/emitter';

export {
  openSource,
  listCameraDevices,
  type ArSource,
  type SourceElement,
  type SourceOptions,
  type WebcamSourceOptions,
  type VideoSourceOptions,
  type ImageSourceOptions,
} from './core/source/source';

export {
  MarkerTracker,
  type MarkerTrackerOptions,
  type MarkerDescriptor,
  type MarkerHandle,
  type DetectedMarker,
  type MarkerFrameResult,
  type DetectionMode,
  type MatrixCodeType,
  type LabelingMode,
  type ThresholdMode,
  type ImageProcMode,
} from './core/marker/marker-tracker';
export {
  MarkerControls,
  type MarkerControlsOptions,
  type MarkerControlsEvents,
  type ChangeMatrixMode,
} from './core/marker/marker-controls';

export {
  createSmoother,
  OneEuroFilter,
  VisibilityFilter,
  type PoseSmoother,
  type SmoothingOptions,
  type AverageSmoothingOptions,
  type LerpSmoothingOptions,
  type OneEuroSmoothingOptions,
} from './core/math/smoothing';
export { fitProjectionToView, processingSize, type FitMode } from './core/math/projection';
export {
  parseCameraParams,
  serializeCameraParams,
  rotateCameraParams,
  type CameraParams,
} from './core/math/camera-params';

export {
  LocationBased,
  type LocationBasedOptions,
  type LocationBasedEvents,
  type GpsPosition,
} from './core/location/location-based';
export {
  SphMercProjection,
  LocalTangentProjection,
  haversineDistance,
  bearing,
  type GeoProjection,
  type LonLat,
} from './core/location/projection';
export {
  DeviceOrientationControls,
  requestOrientationPermission,
  orientationPermissionRequired,
  smoothAngle,
  type DeviceOrientationControlsOptions,
  type DeviceOrientationControlsEvents,
} from './core/location/device-orientation';

export {
  CAMERA_PARAMETERS_URL,
  HIRO_PATTERN_URL,
  KANJI_PATTERN_URL,
} from './assets/inline.generated';
