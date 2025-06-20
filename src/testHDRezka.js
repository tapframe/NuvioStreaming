// Test script for HDRezka service
const { hdrezkaService } = require('./services/hdrezkaService');

// Enable more detailed console logging
const originalConsoleLog = console.log;
console.log = function(...args) {
  const timestamp = new Date().toISOString();
  originalConsoleLog(`[${timestamp}]`, ...args);
};

// Test function to get streams from HDRezka
async function testHDRezka() {
  console.log('Testing HDRezka service...');

  // Test a popular movie - "Deadpool & Wolverine" (2024)
  const movieId = 'tt6263850';
  console.log(`Testing movie ID: ${movieId}`);
  
  try {
    const streams = await hdrezkaService.getStreams(movieId, 'movie');
    console.log('Streams found:', streams.length);
    if (streams.length > 0) {
      console.log('First stream:', {
        name: streams[0].name,
        title: streams[0].title,
        url: streams[0].url.substring(0, 100) + '...' // Only show part of the URL
      });
    } else {
      console.log('No streams found.');
    }
  } catch (error) {
    console.error('Error testing HDRezka:', error);
  }
  
  // Test a TV show - "House of the Dragon" with a specific episode
  const showId = 'tt11198330';
  console.log(`\nTesting TV show ID: ${showId}, Season 2 Episode 1`);
  
  try {
    const streams = await hdrezkaService.getStreams(showId, 'series', 2, 1);
    console.log('Streams found:', streams.length);
    if (streams.length > 0) {
      console.log('First stream:', {
        name: streams[0].name,
        title: streams[0].title,
        url: streams[0].url.substring(0, 100) + '...' // Only show part of the URL
      });
    } else {
      console.log('No streams found.');
    }
  } catch (error) {
    console.error('Error testing HDRezka TV show:', error);
  }
}

// Run the test
testHDRezka().then(() => {
  console.log('Test completed.');
}).catch(error => {
  console.error('Test failed:', error);
}); 