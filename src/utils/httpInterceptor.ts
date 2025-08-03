import { logger } from './logger';

// Enhanced HTTP logging function specifically for AndroidVideoPlayer
export const logHttpRequest = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const method = options.method || 'GET';
  const headers = options.headers || {};
  
  // Log HTTP request
  console.log('\n🌐 [AndroidVideoPlayer] HTTP REQUEST:');
  console.log('📍 URL:', url);
  console.log('🔧 Method:', method);
  console.log('📋 Headers:', JSON.stringify(headers, null, 2));
  console.log('⏰ Request Time:', new Date().toISOString());
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const startTime = Date.now();
  
  try {
    // Make the actual request
    const response = await fetch(url, options);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Log HTTP response success
    console.log('\n✅ [AndroidVideoPlayer] HTTP RESPONSE SUCCESS:');
    console.log('📍 URL:', url);
    console.log('📊 Status:', `${response.status} ${response.statusText}`);
    console.log('📋 Response Headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
    console.log('⏱️ Duration:', `${duration}ms`);
    console.log('📦 Content-Type:', response.headers.get('content-type') || 'Unknown');
    console.log('📏 Content-Length:', response.headers.get('content-length') || 'Unknown');
    console.log('🔒 CORS:', response.headers.get('access-control-allow-origin') || 'Not specified');
    console.log('⏰ Response Time:', new Date().toISOString());
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    return response;
  } catch (error: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Log HTTP response error
    console.log('\n❌ [AndroidVideoPlayer] HTTP RESPONSE ERROR:');
    console.log('📍 URL:', url);
    console.log('📊 Status: Network Error');
    console.log('💬 Error Message:', error.message || 'Unknown error');
    console.log('🔍 Error Type:', error.name || 'Unknown');
    console.log('⏱️ Duration:', `${duration}ms`);
    console.log('📋 Full Error:', JSON.stringify(error, null, 2));
    console.log('⏰ Error Time:', new Date().toISOString());
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
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