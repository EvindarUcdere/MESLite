import { apiClient } from "./client";
import { executeOrQueue } from "../offline/offlineApi";

export async function createProductionLog(payload) {
  return executeOrQueue({
    type: "PRODUCTION_LOG",
    payload,
    request: async (body) => {
      const response = await apiClient.post("/production-logs", body);
      return response.data.data;
    }
  });
}

export async function uploadProductionLogImage(productionLogId, image) {
  const formData = new FormData();

  if (image.file) {
    formData.append("image", image.file, image.fileName ?? "production-note.jpg");
  } else {
    formData.append("image", {
      uri: image.uri,
      name: image.fileName ?? "production-note.jpg",
      type: image.mimeType ?? "image/jpeg"
    });
  }

  const response = await apiClient.post(`/production-logs/${productionLogId}/attachments`, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });

  return response.data.data;
}
