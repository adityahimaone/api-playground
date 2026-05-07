// Feature flags — toggle features on/off without removing code
// Auth is disabled by default; use the in-app switch or set NEXT_PUBLIC_FEATURE_AUTH=true

export const FEATURES = {
  // Account/Auth — disabled by default, toggle via in-app settings
  auth: process.env.NEXT_PUBLIC_FEATURE_AUTH === 'true',
} as const;

export type FeatureFlag = keyof typeof FEATURES;
