import axios, { AxiosError } from 'axios';
import { clearAuth } from '../utils/auth';
import { ApiErrorBody } from '../types';

const baseURL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`;

const api = axios.create({
  baseURL,
  timeout: 15000,
  // Auth is entirely via the backend's httpOnly session cookie — never held
  // or read by JS. withCredentials makes the browser send/accept it cross-origin.
  withCredentials: true,
});

// Auto logout on 401 from any protected endpoint (also covers a stolen/replayed
// cookie rejected by the device-fingerprint check — same recovery: re-login).
// 401s from /auth/* (bad login, bad OTP) are handled by the calling page.
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url ?? '';
    const data = error.response?.data as ApiErrorBody | undefined;

    if (status === 403 && data?.code === 'PASSWORD_EXPIRED') {
      if (window.location.pathname !== '/profile') {
        window.location.assign('/profile?expired=1');
      }
      return Promise.reject(error);
    }

    if (status === 401 && !url.includes('/auth/')) {
      clearAuth();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

/** Extract a human-readable message from any thrown error */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorBody | undefined;
    if (data?.errors && data.errors.length > 0 && data.errors[0].msg) {
      return data.errors[0].msg;
    }
    if (data?.message) return data.message;
    if (error.code === 'ECONNABORTED') return 'Request timed out. Is the API running?';
    if (!error.response) return 'Cannot reach the server. Check that the API is running on port 5000.';
  }
  return 'Something went wrong. Please try again.';
};

/** True when the server said the account is locked (HTTP 423) */
export const isLockedError = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 423;

export default api;
