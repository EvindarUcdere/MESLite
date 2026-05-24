import axios from "axios";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api"
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("mes_lite_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("mes_lite_token");
      localStorage.removeItem("mes_lite_user");
      window.location.assign("/login");
    }

    return Promise.reject(error);
  }
);
