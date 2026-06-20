const pkg = require("./package.json");

const [majorVersion, minorVersion, patchVersion] = pkg.version
  .split(".")
  .map((part) => Number.parseInt(part, 10));
const androidVersionCode =
  (Number.isFinite(majorVersion) ? majorVersion : 0) * 10000 +
  (Number.isFinite(minorVersion) ? minorVersion : 0) * 100 +
  Math.max(Number.isFinite(patchVersion) ? patchVersion : 1, 1);

export default {
  expo: {
    name: "ChisaTalk",
    slug: "chisatalk",
    version: pkg.version,
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "chisatalk",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.chisatalk.app",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#ffffff",
        foregroundImage: "./assets/images/android-icon-foreground.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      softwareKeyboardLayoutMode: "resize",
      usesCleartextTraffic: false,
      permissions: [],
      package: "com.chisatalk.app",
      versionCode: androidVersionCode,
    },
    web: {
      output: "single",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#111827",
          },
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            minSdkVersion: 29,
            kotlinVersion: "2.1.20",
            usesCleartextTraffic: false,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
      autolinkingModuleResolution: true,
    },
    extra: {
      router: {},
    },
  },
};
