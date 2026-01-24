import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.arkavo.app",
  appName: "Arkavo",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
