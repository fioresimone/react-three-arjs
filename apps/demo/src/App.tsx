import { useEffect, useState, type ReactElement } from 'react';
import { BarcodeDemo } from './demos/BarcodeDemo';
import { CameraModeDemo } from './demos/CameraModeDemo';
import { ImageDemo } from './demos/ImageDemo';
import { LocationDemo } from './demos/LocationDemo';
import { MarkerDemo } from './demos/MarkerDemo';

const demos: Record<string, { title: string; description: string; component: () => ReactElement }> =
  {
    image: {
      title: 'Hiro marker on a still image',
      description: 'No camera needed: tracks the Hiro marker in a photo.',
      component: ImageDemo,
    },
    marker: {
      title: 'Hiro marker (webcam)',
      description: 'Point the camera at a printed or on-screen Hiro marker.',
      component: MarkerDemo,
    },
    barcode: {
      title: 'Barcode markers (webcam)',
      description: '3x3 barcode markers 0–5, with One Euro smoothing.',
      component: BarcodeDemo,
    },
    camera: {
      title: 'Marker camera mode',
      description: 'The marker stays at the origin and the camera moves (AR.js <a-marker-camera>).',
      component: CameraModeDemo,
    },
    location: {
      title: 'Location-based (GPS)',
      description: 'Boxes placed around you by GPS coordinates. Can simulate a position.',
      component: LocationDemo,
    },
  };

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(2));
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash.slice(2));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App(): ReactElement {
  const hash = useHash();
  const demo = demos[hash];
  if (demo) {
    const Demo = demo.component;
    return (
      <div style={{ position: 'fixed', inset: 0 }}>
        <Demo />
        <a href="#/" style={backLink}>
          ← Demos
        </a>
      </div>
    );
  }
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
      <h1>react-three-arjs</h1>
      <p>Marker-based and location-based AR for React Three Fiber.</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {Object.entries(demos).map(([key, d]) => (
          <li key={key} style={{ margin: '12px 0' }}>
            <a href={`#/${key}`} style={{ color: '#7df', fontSize: 18 }}>
              {d.title}
            </a>
            <div style={{ opacity: 0.7 }}>{d.description}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}

const backLink = {
  position: 'absolute',
  top: 12,
  left: 12,
  zIndex: 10,
  color: '#fff',
  background: 'rgba(0,0,0,0.5)',
  padding: '6px 10px',
  borderRadius: 6,
  textDecoration: 'none',
} as const;
