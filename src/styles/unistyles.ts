import { StyleSheet } from "react-native-unistyles";
import {
  lightTheme,
  darkTheme,
  darkZincTheme,
  darkMidnightTheme,
  darkClaudeTheme,
  darkGhosttyTheme,
  liquidNeonTheme,
  chisakiTheme,
  wallpaperTheme,
} from "./theme";

StyleSheet.configure({
  themes: {
    light: lightTheme,
    dark: darkTheme,
    darkZinc: darkZincTheme,
    darkMidnight: darkMidnightTheme,
    darkClaude: darkClaudeTheme,
    darkGhostty: darkGhosttyTheme,
    liquidNeon: liquidNeonTheme,
    chisaki: chisakiTheme,
    wallpaper: wallpaperTheme,
  },
  breakpoints: {
    xs: 0,
    sm: 576,
    md: 768,
    lg: 992,
    xl: 1200,
  },
  settings: {
    initialTheme: "light",
  },
});

// Type augmentation for TypeScript
interface AppThemes {
  light: typeof lightTheme;
  dark: typeof darkTheme;
  darkZinc: typeof darkZincTheme;
  darkMidnight: typeof darkMidnightTheme;
  darkClaude: typeof darkClaudeTheme;
  darkGhostty: typeof darkGhosttyTheme;
  liquidNeon: typeof liquidNeonTheme;
  chisaki: typeof chisakiTheme;
  wallpaper: typeof wallpaperTheme;
}

interface AppBreakpoints {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

declare module "react-native-unistyles" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesThemes extends AppThemes {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}
