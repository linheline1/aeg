import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.linsgeekai.aeg.ops',
  appName: 'AEG 运营',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: { CapacitorHttp: { enabled: true } }
};

export default config;
