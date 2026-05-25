import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { ApiError } from "../utils/ApiError.js";

const uploadRoot = path.resolve("uploads");
const productionLogUploadDir = path.join(uploadRoot, "production-logs");
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

fs.mkdirSync(productionLogUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, productionLogUploadDir);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  }
});

export const productionLogImageUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new ApiError(400, "Only jpg, png, and webp images are allowed"));
      return;
    }

    callback(null, true);
  }
});
