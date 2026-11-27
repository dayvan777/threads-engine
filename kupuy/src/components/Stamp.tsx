export function Stamp({
  text,
  tone,
  size = "lg",
  rot = -7,
  animate = false,
  sub,
}: {
  text: string;
  tone: "red" | "blue" | "green" | "ink";
  size?: "sm" | "md" | "lg";
  rot?: number;
  animate?: boolean;
  sub?: string;
}) {
  const fs = size === "lg" ? "clamp(28px, 9vw, 44px)" : size === "md" ? "22px" : "14px";
  return (
    <span
      className={`stamp ${animate ? "stamp-in" : ""}`}
      data-tone={tone}
      style={{ ["--rot" as string]: `${rot}deg`, fontSize: fs, borderWidth: size === "sm" ? 2.5 : 4 }}
    >
      <span>{text}</span>
      {sub && <span style={{ fontSize: "0.36em", letterSpacing: "0.14em", marginTop: 4, fontWeight: 600 }}>{sub}</span>}
    </span>
  );
}
