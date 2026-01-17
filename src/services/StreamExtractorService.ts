import EventEmitter from 'eventemitter3';
import { logger } from '../utils/logger';

// Events for communication between Service and Component
export const EXTRACTOR_EVENTS = {
  START_EXTRACTION: 'start_extraction',
  EXTRACTION_SUCCESS: 'extraction_success',
  EXTRACTION_FAILURE: 'extraction_failed',
};

interface ExtractionRequest {
  id: string;
  url: string;
  script?: string;
  headers?: Record<string, string>;
}

interface ExtractionResult {
  id: string;
  streamUrl?: string;
  headers?: Record<string, string>;
  error?: string;
}

class StreamExtractorService {
  private static instance: StreamExtractorService;
  public events = new EventEmitter();
  private pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timeout: NodeJS.Timeout }>();

  private constructor() {
    // Listen for results from the component
    this.events.on(EXTRACTOR_EVENTS.EXTRACTION_SUCCESS, this.handleSuccess.bind(this));
    this.events.on(EXTRACTOR_EVENTS.EXTRACTION_FAILURE, this.handleFailure.bind(this));
  }

  static getInstance(): StreamExtractorService {
    if (!StreamExtractorService.instance) {
      StreamExtractorService.instance = new StreamExtractorService();
    }
    return StreamExtractorService.instance;
  }

  /**
   * Extracts a direct stream URL from an embed URL using a hidden WebView.
   * @param url The embed URL to load.
   * @param script Optional custom JavaScript to run in the WebView.
   * @param timeoutMs Timeout in milliseconds (default 15000).
   * @returns Promise resolving to the stream URL or object with url and headers.
   */
  public async extractStream(url: string, script?: string, timeoutMs = 15000): Promise<{ streamUrl: string; headers?: Record<string, string> } | null> {
    const id = Math.random().toString(36).substring(7);
    logger.log(`[StreamExtractor] Starting extraction for ${url} (ID: ${id})`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.finishRequest(id, undefined, 'Timeout waiting for stream extraction');
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      // Emit event for the component to pick up
      this.events.emit(EXTRACTOR_EVENTS.START_EXTRACTION, { id, url, script });
    });
  }

  private handleSuccess(result: ExtractionResult) {
    logger.log(`[StreamExtractor] Extraction success for ID: ${result.id}`);
    this.finishRequest(result.id, { streamUrl: result.streamUrl, headers: result.headers });
  }

  private handleFailure(result: ExtractionResult) {
    logger.log(`[StreamExtractor] Extraction failed for ID: ${result.id}: ${result.error}`);
    this.finishRequest(result.id, undefined, result.error);
  }

  private finishRequest(id: string, data?: any, error?: string) {
    const pending = this.pendingRequests.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(id);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(data);
      }
    }
  }
}

export const streamExtractorService = StreamExtractorService.getInstance();
export default streamExtractorService;
