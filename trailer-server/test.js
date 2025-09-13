const fetch = require('node-fetch');

const SERVER_URL = 'http://localhost:3001';

async function testServer() {
  console.log('🧪 Testing Trailer Server...\n');
  
  // Test 1: Health check
  console.log('1️⃣ Testing health endpoint...');
  try {
    const healthResponse = await fetch(`${SERVER_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check passed:', healthData.status);
    console.log('📊 Cache stats:', healthData.cache);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }
  
  console.log('\n');
  
  // Test 2: Trailer endpoint with sample YouTube URL
  console.log('2️⃣ Testing trailer endpoint...');
  const testTrailer = {
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rick Roll for testing
    title: 'Test Movie',
    year: '2023'
  };
  
  try {
    const trailerResponse = await fetch(
      `${SERVER_URL}/trailer?${new URLSearchParams(testTrailer)}`
    );
    
    if (trailerResponse.ok) {
      const trailerData = await trailerResponse.json();
      console.log('✅ Trailer fetch successful!');
      console.log('📹 Title:', trailerData.title);
      console.log('📅 Year:', trailerData.year);
      console.log('🔗 URL:', trailerData.url.substring(0, 50) + '...');
      console.log('⏰ Timestamp:', trailerData.timestamp);
    } else {
      const errorData = await trailerResponse.json();
      console.log('❌ Trailer fetch failed:', errorData.error);
    }
  } catch (error) {
    console.log('❌ Trailer test failed:', error.message);
  }
  
  console.log('\n');
  
  // Test 3: Cache endpoint
  console.log('3️⃣ Testing cache endpoint...');
  try {
    const cacheResponse = await fetch(`${SERVER_URL}/cache`);
    const cacheData = await cacheResponse.json();
    console.log('✅ Cache endpoint working');
    console.log('📦 Cached items:', cacheData.count);
  } catch (error) {
    console.log('❌ Cache test failed:', error.message);
  }
  
  console.log('\n');
  
  // Test 4: Rate limiting
  console.log('4️⃣ Testing rate limiting...');
  try {
    const promises = Array(12).fill().map(() => 
      fetch(`${SERVER_URL}/trailer?youtube_url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&title=Test&year=2023`)
    );
    
    const responses = await Promise.all(promises);
    const rateLimited = responses.some(r => r.status === 429);
    
    if (rateLimited) {
      console.log('✅ Rate limiting working correctly');
    } else {
      console.log('⚠️ Rate limiting may not be working');
    }
  } catch (error) {
    console.log('❌ Rate limiting test failed:', error.message);
  }
  
  console.log('\n🏁 Testing complete!');
}

// Run tests
testServer().catch(console.error);
