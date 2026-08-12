import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.family.facerunner',
  appName: 'FaceRunner',
  webDir: 'dist',
  android: {
    // Игра рисуется поверх системного фона — чёрный убирает белую вспышку
    // между сплэшем и первым кадром.
    backgroundColor: '#000000',
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
