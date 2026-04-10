import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("access_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem("refresh_token");
        const { data } = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
          refresh,
        });
        localStorage.setItem("access_token", data.access);
        if (original.headers) {
          original.headers.Authorization = `Bearer ${data.access}`;
        }
        return client(original);
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default client;

// Typed helpers
export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) =>
    client.get<T>(url, { params }).then((r) => r.data),
  post: <T>(url: string, body?: unknown) =>
    client.post<T>(url, body).then((r) => r.data),
  patch: <T>(url: string, body?: unknown) =>
    client.patch<T>(url, body).then((r) => r.data),
  delete: (url: string) => client.delete(url),
};
