import { Platform, PlatformColor, type ColorValue } from "react-native";
import { createWallpaperColor } from "./wallpaper-colors";

export const baseColors = {
  white: "#ffffff",
  black: "#000000",
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    500: "#6b7280",
    700: "#374151",
    900: "#111827",
  },
  green: {
    600: "#16a34a",
    700: "#15803d",
  },
  red: {
    600: "#dc2626",
    700: "#b91c1c",
  },
  amber: {
    500: "#c9974a",
    700: "#8b5f1f",
  },
} as const;

export type ThemeName =
  | "light"
  | "dark"
  | "zinc"
  | "midnight"
  | "claude"
  | "ghostty"
  | "liquid-neon"
  | "chisaki"
  | "wallpaper";

const syntaxColors = {
  plain: "#111827",
  keyword: "#2563eb",
  string: "#15803d",
  number: "#9333ea",
  comment: "#6b7280",
} as const;

const SPACING = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  12: 48,
} as const;

const FONT_SIZE = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 22,
  "3xl": 26,
  "4xl": 34,
} as const;

const FONT_WEIGHT = {
  normal: "normal" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

const BORDER_RADIUS = {
  sm: 2,
  base: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const;

const BORDER_WIDTH = {
  0: 0,
  1: 1,
  2: 2,
} as const;

const OPACITY = {
  50: 0.5,
  100: 1,
} as const;

const shadow = {
  sm: {
    shadowColor: "rgba(8, 12, 9, 0.12)",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: "rgba(8, 12, 9, 0.16)",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: "rgba(8, 12, 9, 0.24)",
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 28,
    elevation: 8,
  },
} as const;

const commonTheme = {
  spacing: SPACING,
  fontSize: FONT_SIZE,
  fontWeight: FONT_WEIGHT,
  borderRadius: BORDER_RADIUS,
  borderWidth: BORDER_WIDTH,
  opacity: OPACITY,
  shadow,
} as const;

export const lightTheme = {
  colorScheme: "light" as const,
  colors: {
    surface0: "#f5f6f2",
    surface1: "#ffffff",
    surface2: "#eaeee7",
    surface3: "#d7ded3",
    foreground: "#171b17",
    foregroundMuted: "#666d63",
    foregroundSubtle: "#8c958a",
    statusBar: "#f5f6f2",
    border: "rgba(23, 27, 23, 0.10)",
    borderStrong: "rgba(23, 27, 23, 0.16)",
    accent: "#0b6f55",
    accentSoft: "#dcece5",
    accentForeground: "#ffffff",
    gold: "#8f6a2c",
    destructive: "#b91c1c",
    palette: baseColors,
    syntax: syntaxColors,
  },
  ...commonTheme,
} as const;

export const darkTheme = {
  colorScheme: "dark" as const,
  colors: {
    surface0: "#0d0f0b",
    surface1: "#151912",
    surface2: "#20251b",
    surface3: "#2b3025",
    foreground: "#f4f1e8",
    foregroundMuted: "#a9ad9b",
    foregroundSubtle: "#747a69",
    statusBar: "#0d0f0b",
    border: "rgba(244, 241, 232, 0.10)",
    borderStrong: "rgba(244, 241, 232, 0.18)",
    accent: "#83d99a",
    accentSoft: "#183b27",
    accentForeground: "#071008",
    gold: "#c9974a",
    destructive: "#ff8a8a",
    palette: baseColors,
    syntax: syntaxColors,
  },
  ...commonTheme,
} as const;

export const darkZincTheme = darkTheme;
export const darkMidnightTheme = darkTheme;
export const darkClaudeTheme = darkTheme;
export const darkGhosttyTheme = darkTheme;
export const liquidNeonTheme = lightTheme;
const wallpaperColor = (androidSystemColor: string, fallback: string): ColorValue | string =>
  createWallpaperColor(androidSystemColor, fallback, Platform, PlatformColor);

export const wallpaperTheme = {
  colorScheme: "light" as const,
  colors: {
    surface0: wallpaperColor("@android:color/system_accent2_50", "#f7f3f1"),
    surface1: "rgba(255, 255, 255, 0.74)",
    surface2: "rgba(255, 255, 255, 0.52)",
    surface3: "rgba(255, 255, 255, 0.34)",
    foreground: wallpaperColor("@android:color/system_neutral1_900", "#191619"),
    foregroundMuted: "rgba(25, 22, 25, 0.68)",
    foregroundSubtle: "rgba(25, 22, 25, 0.48)",
    statusBar: "#f7f3f1",
    border: "rgba(25, 22, 25, 0.10)",
    borderStrong: "rgba(25, 22, 25, 0.18)",
    accent: wallpaperColor("@android:color/system_accent1_600", "#a72d2d"),
    accentSoft: wallpaperColor("@android:color/system_accent1_100", "#f2ddda"),
    accentForeground: "#ffffff",
    gold: wallpaperColor("@android:color/system_accent2_700", "#8d6f62"),
    destructive: "#b91c1c",
    palette: baseColors,
    syntax: {
      ...syntaxColors,
      keyword: wallpaperColor("@android:color/system_accent1_700", "#a72d2d"),
      string: wallpaperColor("@android:color/system_accent2_700", "#6f5a52"),
      number: wallpaperColor("@android:color/system_accent3_700", "#7f2f2f"),
    },
  },
  ...commonTheme,
  shadow: {
    sm: {
      shadowColor: "rgba(25, 22, 25, 0.10)",
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 2,
    },
    md: {
      shadowColor: "rgba(25, 22, 25, 0.14)",
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 18,
      elevation: 4,
    },
    lg: {
      shadowColor: "rgba(25, 22, 25, 0.20)",
      shadowOffset: { width: 0, height: 18 },
      shadowRadius: 30,
      elevation: 8,
    },
  },
} as const;

export const chisakiTheme = {
  colorScheme: "light" as const,
  colors: {
    surface0: "#f7f3f1",
    surface1: "#fffdfb",
    surface2: "#eee6e3",
    surface3: "#d9cfcb",
    foreground: "#191619",
    foregroundMuted: "#6d6464",
    foregroundSubtle: "#9b8f8e",
    statusBar: "#f7f3f1",
    border: "rgba(25, 22, 25, 0.10)",
    borderStrong: "rgba(117, 31, 31, 0.24)",
    accent: "#a72d2d",
    accentSoft: "#f2ddda",
    accentForeground: "#fff8f4",
    gold: "#8d6f62",
    destructive: "#b91c1c",
    palette: baseColors,
    syntax: {
      ...syntaxColors,
      keyword: "#a72d2d",
      string: "#6f5a52",
      number: "#7f2f2f",
    },
  },
  ...commonTheme,
  shadow: {
    sm: {
      shadowColor: "rgba(35, 20, 22, 0.12)",
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 2,
    },
    md: {
      shadowColor: "rgba(35, 20, 22, 0.16)",
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 18,
      elevation: 4,
    },
    lg: {
      shadowColor: "rgba(35, 20, 22, 0.22)",
      shadowOffset: { width: 0, height: 18 },
      shadowRadius: 30,
      elevation: 8,
    },
  },
} as const;

export type Theme = typeof lightTheme | typeof darkTheme | typeof chisakiTheme | typeof wallpaperTheme;

type UnistylesThemeKey =
  | "light"
  | "dark"
  | "darkZinc"
  | "darkMidnight"
  | "darkClaude"
  | "darkGhostty"
  | "liquidNeon"
  | "chisaki"
  | "wallpaper";

export const THEME_TO_UNISTYLES: Record<ThemeName, UnistylesThemeKey> = {
  light: "light",
  dark: "dark",
  zinc: "darkZinc",
  midnight: "darkMidnight",
  claude: "darkClaude",
  ghostty: "darkGhostty",
  "liquid-neon": "liquidNeon",
  chisaki: "chisaki",
  wallpaper: "wallpaper",
};
