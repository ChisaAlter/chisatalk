export interface PlatformLike {
  OS: string;
  Version: number | string;
}

type PlatformColorFactory<TColor> = (name: string) => TColor;

function getAndroidApiLevel(version: number | string): number {
  if (typeof version === "number") {
    return version;
  }

  const parsedVersion = Number.parseInt(version, 10);
  return Number.isFinite(parsedVersion) ? parsedVersion : 0;
}

export function isDynamicWallpaperColorAvailable(platform: PlatformLike): boolean {
  return platform.OS === "android" && getAndroidApiLevel(platform.Version) >= 31;
}

export function createWallpaperColor<TColor>(
  androidSystemColor: string,
  fallback: string,
  platform: PlatformLike,
  platformColor: PlatformColorFactory<TColor>,
): TColor | string {
  if (!isDynamicWallpaperColorAvailable(platform)) {
    return fallback;
  }

  return platformColor(androidSystemColor);
}
