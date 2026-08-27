// Centralized API Client with error handling and environment-aware timeouts
import { API_BASE_URL } from './config';

export interface ApiError extends Error {
  status?: number;
  type: 'offline' | 'timeout' | 'http' | 'network' | 'unknown';
  originalError?: any;
}

export interface SafeFetchOptions extends RequestInit {
  skipThrowOnNonOk?: boolean;
  maxRetries?: number;
}

/**
 * Executes a network fetch with built-in timeout, automatic base URL resolution,
 * client offline detection, and custom production-friendly error handling for HTTP statuses.
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}, timeoutMs = 75000): Promise<Response> {
  const maxRetries = options.maxRetries ?? 0;
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Automatically prefix relative API paths with the centralized base URL
    const finalUrl = url.startsWith('http') || url.startsWith('//')
      ? url
      : `${API_BASE_URL || ''}${url.startsWith('/') ? url : `/${url}`}`;

    // Dynamically inject the JWT authorization token if available
    const jwtToken = typeof window !== 'undefined' ? localStorage.getItem('ide_jwt_token') : null;
    const finalHeaders = { ...(options.headers || {}) } as Record<string, string>;
    if (jwtToken) {
      finalHeaders['Authorization'] = `Bearer ${jwtToken}`;
    }

    try {
      const response = await fetch(finalUrl, {
        ...options,
        headers: finalHeaders,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok && !options.skipThrowOnNonOk) {
        // For 5xx server errors, retry if attempt < maxRetries
        if (response.status >= 500 && response.status < 600 && attempt < maxRetries) {
          attempt++;
          const backoff = Math.pow(2, attempt) * 250;
          await new Promise(res => setTimeout(res, backoff));
          continue;
        }

        let customMessage = `Backend request failed with status code ${response.status}.`;
        
        try {
          // Clone response to avoid body already read stream issues
          const clonedResponse = response.clone();
          const errorData = await clonedResponse.json();
          if (errorData && errorData.error) {
            customMessage = errorData.error;
          } else if (errorData && errorData.message) {
            customMessage = errorData.message;
          }
        } catch (e) {
          // Fallback to static mapping if JSON parsing fails
          if (response.status === 401) {
            customMessage = 'Unauthorized (401): Session expired or invalid. Please re-authenticate.';
          } else if (response.status === 403) {
            customMessage = 'Forbidden (403): You do not have the required permissions to perform this operation.';
          } else if (response.status === 404) {
            customMessage = 'Not Found (404): The requested API resource could not be located on the server.';
          } else if (response.status === 500) {
            customMessage = 'Internal Server Error (500): The backend encountered an unexpected crash or database failure.';
          }
        }

        const httpError = new Error(customMessage) as ApiError;
        httpError.status = response.status;
        httpError.type = 'http';
        throw httpError;
      }

      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.type === 'http') {
        throw error;
      }

      // Retry network or timeout errors if attempt < maxRetries
      if (attempt < maxRetries) {
        attempt++;
        const backoff = Math.pow(2, attempt) * 250;
        await new Promise(res => setTimeout(res, backoff));
        continue;
      }

      // Intercept standard AbortError as a high-fidelity timeout
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        const timeoutError = new Error(`Request timed out after ${timeoutMs}ms. Please verify connection speed.`) as ApiError;
        timeoutError.type = 'timeout';
        throw timeoutError;
      }

      // Detect browser client offline state vs server offline state
      const isClientOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
      let fallbackMessage = 'Unable to establish connection to the backend server. The service may be offline.';
      let errorType: 'offline' | 'network' = 'network';

      if (isClientOffline) {
        fallbackMessage = 'Network Connection Lost: Your browser appears to be offline. Please verify your internet settings.';
        errorType = 'offline';
      }

      const networkError = new Error(fallbackMessage) as ApiError;
      networkError.type = errorType;
      networkError.originalError = error;
      throw networkError;
    }
  }
}
