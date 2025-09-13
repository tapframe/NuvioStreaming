const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Search YouTube for trailers using yt-dlp search functionality
 * @param {string} query - Search query (e.g., "Avengers Endgame 2019 official trailer")
 * @returns {Promise<string|null>} - YouTube URL or null if not found
 */
async function searchYouTubeTrailer(query) {
  try {
    console.log(`🔍 Searching YouTube for: ${query}`);
    
    // Use yt-dlp to search YouTube and get the YouTube URL (not direct streaming URL)
    // --get-url returns direct streaming URLs, we need --get-id to get YouTube video ID
    const command = `yt-dlp --get-id --no-playlist "ytsearch1:${query}"`;
    
    const { stdout, stderr } = await execAsync(command, { 
      timeout: 15000, // 15 second timeout
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    if (stderr && !stderr.includes('WARNING')) {
      console.error('yt-dlp search stderr:', stderr);
    }
    
    const videoId = stdout.trim();
    
    if (!videoId || videoId.length !== 11) {
      console.log(`❌ No valid YouTube video ID found for: ${query}`);
      return null;
    }
    
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`✅ Found YouTube URL: ${youtubeUrl}`);
    return youtubeUrl;
  } catch (error) {
    console.error('Error searching YouTube:', error);
    return null;
  }
}

/**
 * Validate if the URL is a valid YouTube URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid YouTube URL
 */
function isValidYouTubeUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be');
  } catch {
    return false;
  }
}

module.exports = { searchYouTubeTrailer };
