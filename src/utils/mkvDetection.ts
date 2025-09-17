/**
 * Enhanced MKV stream detection utility
 * Provides multiple methods to detect if a video stream is in MKV format
 */

export interface StreamDetectionResult {
  isMkv: boolean;
  method: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Comprehensive MKV stream detection
 * Uses multiple detection methods for maximum accuracy
 */
export const detectMkvStream = (streamUri: string, streamHeaders?: Record<string, string>): StreamDetectionResult => {
  if (!streamUri) {
    return { isMkv: false, method: 'none', confidence: 'high' };
  }

  const lowerUri = streamUri.toLowerCase();
  const contentType = (streamHeaders && (streamHeaders['Content-Type'] || streamHeaders['content-type'])) || '';

  // Method 1: Content-Type header detection (most reliable)
  if (typeof contentType === 'string') {
    if (/video\/x-matroska|application\/x-matroska/i.test(contentType)) {
      return { isMkv: true, method: 'content-type', confidence: 'high' };
    }
    if (/matroska/i.test(contentType)) {
      return { isMkv: true, method: 'content-type', confidence: 'high' };
    }
  }

  // Method 2: File extension detection
  const mkvExtensions = ['.mkv', '.mka', '.mks', '.mk3d'];
  for (const ext of mkvExtensions) {
    if (lowerUri.includes(ext)) {
      return { isMkv: true, method: 'extension', confidence: 'high' };
    }
  }

  // Method 3: URL parameter detection
  const urlPatterns = [
    /[?&]ext=mkv\b/,
    /[?&]format=mkv\b/,
    /[?&]container=mkv\b/,
    /[?&]codec=mkv\b/,
    /[?&]format=matroska\b/,
    /[?&]type=mkv\b/,
    /[?&]file_format=mkv\b/
  ];

  for (const pattern of urlPatterns) {
    if (pattern.test(lowerUri)) {
      return { isMkv: true, method: 'url-pattern', confidence: 'high' };
    }
  }

  // Method 4: Known MKV streaming patterns (medium confidence)
  const streamingPatterns = [
    /mkv|matroska/i,
    /video\/x-matroska/i,
    /ebml/i, // EBML is the container format MKV uses
  ];

  for (const pattern of streamingPatterns) {
    if (pattern.test(lowerUri)) {
      return { isMkv: true, method: 'streaming-pattern', confidence: 'medium' };
    }
  }

  // Method 5: Provider-specific patterns (lower confidence)
  const providerPatterns = [
    /vidsrc|embedsu|multiembed/i, // Providers that often serve MKV
  ];

  for (const pattern of providerPatterns) {
    if (pattern.test(lowerUri)) {
      // These providers often serve MKV, but not guaranteed
      return { isMkv: true, method: 'provider-pattern', confidence: 'low' };
    }
  }

  return { isMkv: false, method: 'none', confidence: 'high' };
};

/**
 * Async HEAD request detection for MKV
 * Most reliable method but requires network request
 */
export const detectMkvViaHeadRequest = async (
  url: string,
  headers?: Record<string, string>,
  timeoutMs: number = 2000
): Promise<StreamDetectionResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers,
      signal: controller.signal as any,
    } as any);

    const contentType = response.headers.get('content-type') || '';

    if (/video\/x-matroska|application\/x-matroska/i.test(contentType)) {
      return { isMkv: true, method: 'head-request', confidence: 'high' };
    }

    if (/matroska/i.test(contentType)) {
      return { isMkv: true, method: 'head-request', confidence: 'high' };
    }

    return { isMkv: false, method: 'head-request', confidence: 'high' };
  } catch (error) {
    return { isMkv: false, method: 'head-request-failed', confidence: 'low' };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Combined detection: fast local detection + optional HEAD request
 */
export const detectMkvComprehensive = async (
  streamUri: string,
  streamHeaders?: Record<string, string>,
  useHeadRequest: boolean = false,
  headTimeoutMs: number = 2000
): Promise<StreamDetectionResult> => {
  // First try fast local detection
  const localResult = detectMkvStream(streamUri, streamHeaders);

  if (localResult.isMkv && localResult.confidence === 'high') {
    return localResult;
  }

  // If local detection is inconclusive and HEAD request is enabled, try network detection
  if (useHeadRequest) {
    const headResult = await detectMkvViaHeadRequest(streamUri, streamHeaders, headTimeoutMs);

    if (headResult.isMkv || headResult.method === 'head-request') {
      return headResult;
    }
  }

  return localResult;
};

/**
 * Simple boolean wrapper for backward compatibility
 */
export const isMkvStream = (streamUri: string, streamHeaders?: Record<string, string>): boolean => {
  const result = detectMkvStream(streamUri, streamHeaders);

  // Debug logging in development
  if (__DEV__ && streamUri) {
    console.log('[MKV Detection]', {
      uri: streamUri.substring(0, 100) + (streamUri.length > 100 ? '...' : ''),
      isMkv: result.isMkv,
      method: result.method,
      confidence: result.confidence
    });
  }

  return result.isMkv;
};
