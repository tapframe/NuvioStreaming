// Quick test to verify TrailerService integration
// Run this from the main Nuvio directory

const TrailerService = require('./src/services/trailerService.ts');

async function testTrailerIntegration() {
  console.log('🧪 Testing TrailerService Integration...\n');
  
  // Test 1: Check server status
  console.log('1️⃣ Server Status:');
  const status = TrailerService.getServerStatus();
  console.log('✅ Using Local Server:', status.usingLocal);
  console.log('🔗 Local URL:', status.localUrl);
  console.log('🔗 XPrime URL:', status.xprimeUrl);
  
  console.log('\n');
  
  // Test 2: Try to fetch a trailer
  console.log('2️⃣ Testing trailer fetch...');
  try {
    const trailerUrl = await TrailerService.getTrailerUrl('Test Movie', 2023);
    if (trailerUrl) {
      console.log('✅ Trailer URL fetched successfully!');
      console.log('🔗 URL:', trailerUrl.substring(0, 80) + '...');
    } else {
      console.log('❌ No trailer URL returned');
    }
  } catch (error) {
    console.log('❌ Error fetching trailer:', error.message);
  }
  
  console.log('\n');
  
  // Test 3: Test trailer data
  console.log('3️⃣ Testing trailer data...');
  try {
    const trailerData = await TrailerService.getTrailerData('Test Movie', 2023);
    if (trailerData) {
      console.log('✅ Trailer data fetched successfully!');
      console.log('📹 Title:', trailerData.title);
      console.log('📅 Year:', trailerData.year);
      console.log('🔗 URL:', trailerData.url.substring(0, 80) + '...');
    } else {
      console.log('❌ No trailer data returned');
    }
  } catch (error) {
    console.log('❌ Error fetching trailer data:', error.message);
  }
  
  console.log('\n🏁 Integration test complete!');
}

// Run the test
testTrailerIntegration().catch(console.error);
