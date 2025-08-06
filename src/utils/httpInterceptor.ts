import { logger } from './logger';

// Enhanced HTTP logging function specifically for AndroidVideoPlayer
export const logHttpRequest = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const method = options.method || 'GET';
  const headers = options.headers || {};
  
  // HTTP request logging removed
  
  const startTime = Date.now();
  
  try {
    // Make the actual request
    const response = await fetch(url, options);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // HTTP response success logging removed
    
    return response;
  } catch (error: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // HTTP response error logging removed
    
    throw error;
  }
};

// Test function to validate video stream URLs with HTTP logging
export const testVideoStreamUrl = async (url: string, headers: Record<string, string> = {}): Promise<boolean> => {
  try {
    const response = await logHttpRequest(url, {
      method: 'HEAD',
      headers: {
        'Range': 'bytes=0-1',
        ...headers
      }
    });
    
    return response.ok || response.status === 206; // 206 for partial content
  } catch (error) {
    return false;
  }
};