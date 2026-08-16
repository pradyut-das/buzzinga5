import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The Squirrl cat mark at home-screen size. Kept in sync with SquirlMark. */
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <svg viewBox="0 0 100 100" width={size.width} height={size.height}>
        <rect width="100" height="100" fill="#FFD400" />
        <path
          d="M18 8 L34 34 L50 26 L66 34 L82 8 L88 40 L78 64 L64 82 L36 82 L22 64 L12 40 Z"
          fill="#0b0b0b"
        />
        <circle cx="40" cy="50" r="7.5" fill="#fff" />
        <circle cx="60" cy="50" r="7.5" fill="#fff" />
      </svg>
    </div>,
    { ...size },
  );
}
