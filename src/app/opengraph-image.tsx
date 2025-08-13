import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0B1220 0%, #101826 60%, #111827 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 24,
              background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
              color: "#0b1220",
              fontSize: 64,
              fontWeight: 800,
              fontFamily: "Inter, system-ui, Arial, sans-serif",
            }}
          >
            C
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontSize: 72,
                lineHeight: 1.1,
                fontWeight: 800,
                letterSpacing: -1.5,
                color: "white",
                fontFamily: "Inter, system-ui, Arial, sans-serif",
              }}
            >
              Coinmind
            </div>
            <div
              style={{
                fontSize: 28,
                marginTop: 8,
                color: "#a3aed0",
                fontFamily: "Inter, system-ui, Arial, sans-serif",
              }}
            >
              AI Finance Copilot • Chat, analyze, auto-categorize, export
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}


