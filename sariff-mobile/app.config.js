// app.config.js — dynamic Expo config.
// Lets EAS inject a different API URL per build profile (dev / preview / production)
// without editing app.json. Values fall back to app.json's `extra` when no env var is set.
//
// In eas.json, set per profile, e.g.:
//   "preview":    { "env": { "API_BASE_URL": "https://sariff-staging.onrender.com" } }
//   "production": { "env": { "API_BASE_URL": "https://api.sariff.com" } }
//
// EAS_PROJECT_ID is normally written into app.json by `eas init`, so you usually
// don't need to set it here — but the override is available if you want it.

module.exports = ({ config }) => {
  const apiBaseUrl = process.env.API_BASE_URL || config.extra?.apiBaseUrl;
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;

  return {
    ...config,
    extra: {
      ...config.extra,
      apiBaseUrl,
      eas: {
        ...(config.extra?.eas || {}),
        projectId,
      },
    },
  };
};
