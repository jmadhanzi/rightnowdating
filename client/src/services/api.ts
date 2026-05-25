import axios, { type AxiosInstance } from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api/v1';

/** Shared Axios client. Attaches the bearer token from localStorage. */
export const api: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rightnow.accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
