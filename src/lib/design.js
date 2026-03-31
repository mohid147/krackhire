// src/lib/design.js
// Shared design system (colors, tokens, constants)
// Used across all components to maintain consistency

/* ─── COLOR PALETTE ───────────────────────────────────────── */
export const C = {
  // Neutrals
  bg: "#F9F8F6",           // Page background
  surface: "#FFFFFF",      // Card/surface background
  ink: "#1C1917",          // Primary text
  ink2: "#57534E",         // Secondary text
  ink3: "#A8A29E",         // Tertiary text (note: needs contrast increase for accessibility)
  ink4: "#E7E5E4",         // Disabled text
  border: "#E7E5E4",       // Border color
  stone: "#78716C",        // Stone gray

  // Brand (Sage/Green)
  sage: "#3D6B4F",         // Primary brand color
  sageBg: "#F0F5F2",       // Sage background
  sageMid: "#D4E6DA",      // Sage mid-tone

  // Semantic colors
  red: "#C0392B",          // Error/destructive
  redBg: "#FDF2F2",        // Error background
  
  amber: "#B45309",        // Warning
  amberBg: "#FFFBEB",      // Warning background
  
  blue: "#1D4ED8",         // Info/secondary action
  blueBg: "#EFF6FF",       // Info background
  
  purple: "#5B21B6",       // Tertiary color
  purpleBg: "#F5F3FF",     // Purple background
};

/* ─── SPACING SCALE ───────────────────────────────────────– */
export const SPACING = {
  xs: "8px",
  sm: "12px",
  md: "16px",
  lg: "20px",
  xl: "24px",
  xxl: "32px",
};

/* ─── FONT SIZES ───────────────────────────────────────────– */
export const FONT_SIZE = {
  xs: "11px",
  sm: "12px",
  base: "13.5px",
  lg: "15px",
  xl: "16px",
  "2xl": "18px",
  "3xl": "22px",
  "4xl": "28px",
};

/* ─── Z-INDEX LAYERS ──────────────────────────────────────– */
export const Z_INDEX = {
  base: 0,
  dropdown: 100,
  sticky: 100,
  fixed: 200,
  modalBackdrop: 999,
  modal: 1000,
  toast: 1100,
  errorBanner: 1000,
};

/* ─── BREAKPOINTS ────────────────────────────────────────– */
export const BREAKPOINTS = {
  mobile: "0px",
  tablet: "768px",
  desktop: "1024px",
};

/* ─── SHADOWS ────────────────────────────────────────────– */
export const SHADOWS = {
  xs: "0 1px 2px rgba(0,0,0,.04)",
  sm: "0 1px 3px rgba(0,0,0,.05)",
  base: "0 2px 4px rgba(0,0,0,.08)",
  md: "0 4px 8px rgba(0,0,0,.10)",
  lg: "0 4px 16px rgba(0,0,0,.14)",
  xl: "0 20px 48px rgba(0,0,0,.14)",
};

export default { C, SPACING, FONT_SIZE, Z_INDEX, BREAKPOINTS, SHADOWS };
