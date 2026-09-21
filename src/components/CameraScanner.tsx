import { Scanner } from "@yudiel/react-qr-scanner";

/**
 * Browser-only QR scanner. Loaded lazily inside <ClientOnly> so the camera
 * libraries never reach the server render.
 */
export default function CameraScanner({ onToken }: { onToken: (token: string) => void }) {
  return (
    <Scanner
      onScan={(codes) => {
        const value = codes[0]?.rawValue;
        if (value) onToken(value.trim());
      }}
      onError={() => {}}
      constraints={{ facingMode: "environment" }}
      styles={{ container: { width: "100%" } }}
    />
  );
}
