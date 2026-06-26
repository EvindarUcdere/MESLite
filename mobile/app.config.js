const fs = require("node:fs");
const path = require("node:path");

const appJson = require("./app.json");
const config = appJson.expo;
const googleServicesFile = "./google-services.json";
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const edgeApiUrl = process.env.EXPO_PUBLIC_EDGE_API_URL;

config.extra = {
  ...config.extra,
  ...(apiUrl ? { apiUrl } : {}),
  ...(edgeApiUrl ? { edgeApiUrl } : {})
};

if (fs.existsSync(path.join(__dirname, googleServicesFile))) {
  config.android = {
    ...config.android,
    googleServicesFile
  };
}

module.exports = config;
