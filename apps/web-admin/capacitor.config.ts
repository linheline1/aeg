import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.linsgeekai.aeg.admin',
  appName: 'AEG 管理',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: { CapacitorHttp: { enabled: true } }
};

export default config;
