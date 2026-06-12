const fs = require("node:fs");
const path = require("node:path");

const appJson = require("./app.json");
const config = appJson.expo;
const googleServicesFile = "./google-services.json";

if (fs.existsSync(path.join(__dirname, googleServicesFile))) {
  config.android = {
    ...config.android,
    googleServicesFile
  };
}

module.exports = config;
