import { describe, expect, it } from "vitest";
import {
  createWallpaperColor,
  isDynamicWallpaperColorAvailable,
} from "./wallpaper-colors";

describe("isDynamicWallpaperColorAvailable", () => {
  it("uses Android wallpaper colors only on Android 12 and newer", () => {
    expect(isDynamicWallpaperColorAvailable({ OS: "android", Version: 31 })).toBe(true);
    expect(isDynamicWallpaperColorAvailable({ OS: "android", Version: 36 })).toBe(true);
    expect(isDynamicWallpaperColorAvailable({ OS: "android", Version: 30 })).toBe(false);
    expect(isDynamicWallpaperColorAvailable({ OS: "ios", Version: "18.0" })).toBe(false);
  });
});

describe("createWallpaperColor", () => {
  it("returns Android system colors when wallpaper dynamic colors are available", () => {
    const color = createWallpaperColor(
      "@android:color/system_accent1_600",
      "#a72d2d",
      { OS: "android", Version: 31 },
      (name) => ({ platformColor: name }),
    );

    expect(color).toEqual({ platformColor: "@android:color/system_accent1_600" });
  });

  it("falls back when Android dynamic colors are not available", () => {
    const color = createWallpaperColor(
      "@android:color/system_accent1_600",
      "#a72d2d",
      { OS: "android", Version: 30 },
      (name) => ({ platformColor: name }),
    );

    expect(color).toBe("#a72d2d");
  });
});
