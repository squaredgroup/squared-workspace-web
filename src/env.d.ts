interface SquaredRuntimeConfig {
  apiBaseUrl?: string;
  webBaseUrl?: string;
}

interface Window {
  SQUARED_CONFIG?: SquaredRuntimeConfig;
}
