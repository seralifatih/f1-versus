// Global window augmentations — AdSense + Cloudflare Web Analytics

interface Window {
  adsbygoogle: unknown[];
  __cfBeacon?: {
    sendEvent: (name: string, props?: Record<string, string | number | boolean>) => void;
  };
}
