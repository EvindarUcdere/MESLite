const fs = require("node:fs");
const path = require("node:path");

const appJson = require("./app.json");
const config = appJson.expo;
const localGoogleServicesFile = "./google-services.json";
const easGoogleServicesFile = process.env.GOOGLE_SERVICES_JSON;
const useLocalGoogleServicesFile = process.env.USE_LOCAL_GOOGLE_SERVICES === "1";
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const edgeApiUrl = process.env.EXPO_PUBLIC_EDGE_API_URL;

config.extra = {
  ...config.extra,
  ...(apiUrl ? { apiUrl } : {}),
  ...(edgeApiUrl ? { edgeApiUrl } : {})
};

if (easGoogleServicesFile) {
  config.android = {
    ...config.android,
    googleServicesFile: easGoogleServicesFile
  };
} else if (useLocalGoogleServicesFile && fs.existsSync(path.join(__dirname, localGoogleServicesFile))) {
  config.android = {
    ...config.android,
    googleServicesFile: localGoogleServicesFile
  };
}

module.exports = config;
