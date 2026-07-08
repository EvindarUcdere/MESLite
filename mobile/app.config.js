const fs = require("node:fs");
const path = require("node:path");

const appJson = require("./app.json");
const config = appJson.expo;
const localGoogleServicesFile = "./google-services.json";
const easGoogleServicesFile = process.env.GOOGLE_SERVICES_JSON;
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
} else if (fs.existsSync(path.join(__dirname, localGoogleServicesFile))) {
  config.android = {
    ...config.android,
    googleServicesFile: localGoogleServicesFile
  };
}

module.exports = config;
