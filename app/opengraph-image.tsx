import { ImageResponse } from "next/og";

export const alt = "Doppel — your professional doppelgänger";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(160deg, #fafaf9 0%, #e7e5e4 100%)",
          padding: 72,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#1c1917",
              color: "#fafaf9",
              fontSize: 40,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            D
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, color: "#1c1917", letterSpacing: -0.5 }}>Doppel</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, color: "#1c1917", letterSpacing: -3, lineHeight: 1.05, display: "flex", flexDirection: "column" }}>
            <div>Your professional</div>
            <div>doppelgänger</div>
          </div>
          <div style={{ fontSize: 30, color: "#57534e", lineHeight: 1.4, maxWidth: 880 }}>
            An autonomous agent that runs your professional life — inbox, outreach, applications. You live, Doppel works.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#b45309" }} />
          <div style={{ fontSize: 24, color: "#78716c" }}>Runs a real browser, logged in as you</div>
        </div>
      </div>
    ),
    size
  );
}
