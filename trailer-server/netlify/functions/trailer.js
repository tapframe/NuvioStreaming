const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Simple in-memory cache for Netlify functions
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const { youtube_url, title, year } = event.queryStringParameters || {};
    
    // Validate required parameters
    if (!youtube_url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'youtube_url parameter is required' 
        }),
      };
    }
    
    // Create cache key
    const cacheKey = `trailer_${title}_${year}_${youtube_url}`;
    
    // Check cache first
    const cachedResult = cache.get(cacheKey);
    if (cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_TTL) {
      console.log(`🎯 Cache hit for: ${title} (${year})`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(cachedResult.data),
      };
    }
    
    console.log(`🔍 Fetching trailer for: ${title} (${year})`);
    
    // Use yt-dlp to get direct streaming URL
    // Note: yt-dlp needs to be available in the Netlify environment
    const command = `yt-dlp -f "best[height<=720][ext=mp4]/best[height<=720]/best" -g --no-playlist "${youtube_url}"`;
    
    const { stdout, stderr } = await execAsync(command, { 
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    if (stderr && !stderr.includes('WARNING')) {
      console.error('yt-dlp stderr:', stderr);
    }
    
    const directUrl = stdout.trim();
    
    if (!directUrl || !isValidUrl(directUrl)) {
      console.log(`❌ No valid URL found for: ${title} (${year})`);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'Trailer not found or invalid URL' 
        }),
      };
    }
    
    const result = {
      url: directUrl,
      title: title || 'Unknown',
      year: year || 'Unknown',
      source: 'youtube',
      cached: false,
      timestamp: new Date().toISOString()
    };
    
    // Cache the result
    cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    console.log(`✅ Successfully fetched trailer for: ${title} (${year})`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
    
  } catch (error) {
    console.error('Error fetching trailer:', error);
    
    if (error.code === 'TIMEOUT') {
      return {
        statusCode: 408,
        headers,
        body: JSON.stringify({ 
          error: 'Request timeout - video processing took too long' 
        }),
      };
    }
    
    if (error.message.includes('not found') || error.message.includes('unavailable')) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'Trailer not found' 
        }),
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      }),
    };
  }
};

// Helper function to validate URLs
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}
