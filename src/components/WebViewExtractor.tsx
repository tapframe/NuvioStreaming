import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { streamExtractorService, EXTRACTOR_EVENTS } from '../services/StreamExtractorService';
import { logger } from '../utils/logger';

export const WebViewExtractor: React.FC = () => {
  const [currentRequest, setCurrentRequest] = useState<{ id: string; url: string; script?: string } | null>(null);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    const startListener = (request: { id: string; url: string; script?: string }) => {
      logger.log(`[WebViewExtractor] Received request: ${request.url}`);
      setCurrentRequest(request);
    };

    streamExtractorService.events.on(EXTRACTOR_EVENTS.START_EXTRACTION, startListener);

    return () => {
      streamExtractorService.events.off(EXTRACTOR_EVENTS.START_EXTRACTION, startListener);
    };
  }, []);

  const handleMessage = (event: any) => {
    if (!currentRequest) return;

    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'found_stream') {
        streamExtractorService.events.emit(EXTRACTOR_EVENTS.EXTRACTION_SUCCESS, {
          id: currentRequest.id,
          streamUrl: data.url,
          headers: data.headers
        });
        setCurrentRequest(null); // Reset after success
      } else if (data.type === 'error') {
        // Optional: Retry logic or just log
        logger.warn(`[WebViewExtractor] Error from page: ${data.message}`);
      }
    } catch (e) {
      logger.error('[WebViewExtractor] Failed to parse message:', e);
    }
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    logger.warn('[WebViewExtractor] WebView error: ', nativeEvent);
    if (currentRequest) {
      streamExtractorService.events.emit(EXTRACTOR_EVENTS.EXTRACTION_FAILURE, {
        id: currentRequest.id,
        error: `WebView Error: ${nativeEvent.description}`
      });
      setCurrentRequest(null);
    }
  };

  // Default extraction script: looks for video tags and intercepts network traffic
  const DEFAULT_INJECTED_JS = `
    (function() {
      function sendStream(url, headers) {
        // Broad regex to catch HLS, DASH, and common video containers
        const videoRegex = /\.(m3u8|mp4|mpd|mkv|webm|mov|avi)(\?|$)/i;
        if (!videoRegex.test(url)) return;

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'found_stream',
          url: url,
          headers: headers
        }));
      }

      // 1. Intercept Video Elements
      function checkVideoElements() {
        var videos = document.getElementsByTagName('video');
        for (var i = 0; i < videos.length; i++) {
          if (videos[i].src && !videos[i].src.startsWith('blob:')) {
            sendStream(videos[i].src);
            return true;
          }
          // Check for source children
          var sources = videos[i].getElementsByTagName('source');
          for (var j = 0; j < sources.length; j++) {
            if (sources[j].src) {
              sendStream(sources[j].src);
              return true;
            }
          }
        }
        return false;
      }

      // Check periodically
      setInterval(checkVideoElements, 1000);

      // 2. Intercept XHR (optional, for m3u8/mp4 fetches)
      var originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        sendStream(url);
        originalOpen.apply(this, arguments);
      };

      // 3. Intercept Fetch
      var originalFetch = window.fetch;
      window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
        sendStream(url);
        return originalFetch.apply(this, arguments);
      };
      
      // 4. Check for specific common player variables (optional)
      // e.g., jwplayer, etc.
    })();
  `;

  if (!currentRequest) {
    return null;
  }

  return (
    <View style={styles.hiddenContainer}>
      <WebView
        ref={webViewRef}
        source={{ uri: currentRequest.url }}
        onMessage={handleMessage}
        onError={handleError}
        injectedJavaScript={currentRequest.script || DEFAULT_INJECTED_JS}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        // Important: Use a desktop or generic user agent to avoid mobile redirect loops sometimes
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        style={{ width: 1, height: 1 }} // Minimal size to keep it active
      />
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenContainer: {
    position: 'absolute',
    top: -1000, // Move off-screen
    left: 0,
    width: 1,
    height: 1,
    opacity: 0.01, // Almost invisible but technically rendered
  },
});
