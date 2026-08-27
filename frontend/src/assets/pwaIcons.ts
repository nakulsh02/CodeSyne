// Pure TypeScript definition of PWA CodeSyne Icon assets
// Enables direct in-code inspection and rendering across AI Studio and mobile browsers

export const CODESYNE_SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#080711"/>
      <stop offset="50%" stop-color="#0f1122"/>
      <stop offset="100%" stop-color="#18152e"/>
    </linearGradient>
    <linearGradient id="codeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="50%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <rect x="16" y="16" width="480" height="480" rx="96" fill="none" stroke="url(#codeGrad)" stroke-width="6" stroke-opacity="0.3"/>
  <g filter="url(#glow)">
    <path d="M160 176 L80 256 L160 336" fill="none" stroke="url(#codeGrad)" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M352 176 L432 256 L352 336" fill="none" stroke="url(#codeGrad)" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M288 144 L224 368" fill="none" stroke="url(#codeGrad)" stroke-width="32" stroke-linecap="round"/>
  </g>
</svg>`;

export const CODESYNE_ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(CODESYNE_SVG_ICON)}`;

export const PWA_MANIFEST_CONFIG = {
  name: "Codesyne",
  short_name: "Codesyne",
  description: "A modern collaborative cloud IDE.",
  start_url: "/",
  id: "/",
  scope: "/",
  display: "standalone",
  orientation: "any",
  background_color: "#040409",
  theme_color: "#080711",
  icons: [
    {
      src: "/icon.svg",
      sizes: "192x192 512x512",
      type: "image/svg+xml",
      purpose: "any maskable"
    },
    {
      src: "/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any"
    },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any"
    }
  ]
};
