// src/lib/design.js
// KrackHire Premium Design System v2
// Same palette — refined shadows, gradients, spacing

export const C = {
  /* ── Neutrals ── */
  bg:      "#F9F8F6",
  surface: "#FFFFFF",
  ink:     "#1C1917",
  ink2:    "#57534E",
  ink3:    "#A8A29E",
  ink4:    "#E7E5E4",
  border:  "#E7E5E4",
  stone:   "#78716C",

  /* ── Brand (Sage / Green) ── */
  sage:    "#3D6B4F",
  sageLight: "#4E8A65",
  sageDark:  "#2D5240",
  sageBg:  "#F0F5F2",
  sageMid: "#D4E6DA",
  sageGlow: "rgba(61,107,79,0.12)",

  /* ── Semantic ── */
  red:      "#C0392B",
  redBg:    "#FDF2F2",
  amber:    "#B45309",
  amberBg:  "#FFFBEB",
  blue:     "#1D4ED8",
  blueBg:   "#EFF6FF",
  purple:   "#5B21B6",
  purpleBg: "#F5F3FF",

  /* ── Gradients ── */
  gradSage:   "linear-gradient(145deg, #3D6B4F, #2D5240)",
  gradSageHero: "linear-gradient(135deg, #2D5240 0%, #3D6B4F 55%, #4E8A65 100%)",
  gradAmber:  "linear-gradient(135deg, #B45309, #CA8A04)",
};

/* ── Shadows ── */
export const S = {
  xs:   "0 1px 2px rgba(0,0,0,.04)",
  sm:   "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)",
  md:   "0 4px 16px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04)",
  lg:   "0 12px 40px rgba(0,0,0,.10), 0 4px 12px rgba(0,0,0,.05)",
  xl:   "0 24px 64px rgba(0,0,0,.12), 0 8px 20px rgba(0,0,0,.06)",
  sage: "0 8px 32px rgba(61,107,79,.18), 0 2px 8px rgba(61,107,79,.10)",
};

/* ── Border radii ── */
export const R = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "28px",
};

export default { C, S, R };
