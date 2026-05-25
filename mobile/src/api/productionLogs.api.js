import { apiClient } from "./client";

export async function createProductionLog(payload) {
  const response = await apiClient.post("/production-logs", payload);
  return response.data.data;
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
