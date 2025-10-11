// COMPREHENSIVE API AUDIT - Test ALL endpoints with fresh token
const https = require('https');

function testEndpoint(method, path, body = null, description = '') {
  return new Promise((resolve) => {
    const postData = body ? JSON.stringify(body) : null;
    
    const options = {
      hostname: 'whatnext-backend3-production.up.railway.app',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZG1pbkVtYWlsIjoiYWRtaW5Ad2hhdG5leHQuZnVuIiwiaWF0IjoxNzI4NjUwMzA3LCJleHAiOjE3Mjg2NTM5MDd9.-yFD1r6UxSjGG7fE5l2XVKPmY5d4mCe-jAT-bmyqkss'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const isJSON = res.headers['content-type']?.includes('application/json');
        const response = isJSON ? data : data.substring(0, 100) + '...';
        
        console.log(`${method} ${path} (${description})`);
        console.log(`  Status: ${res.statusCode} | Type: ${isJSON ? 'JSON' : 'HTML/TEXT'}`);
        console.log(`  Response: ${response}`);
        console.log('---');
        resolve({
          method,
          path,
          status: res.statusCode,
          isJSON,
          response: data,
          success: res.statusCode >= 200 && res.statusCode < 300 && isJSON
        });
      });
    });

    req.on('error', () => resolve({ method, path, success: false, error: true }));
    if (postData) req.write(postData);
    req.end();
  });
}

async function auditAllAPIs() {
  console.log('🔍 COMPREHENSIVE API AUDIT - Testing ALL endpoints\n');
  
  const tests = [
    // Health checks
    ['GET', '/', 'Root health check'],
    ['GET', '/health', 'Health endpoint'],
    ['GET', '/api', 'API root'],
    
    // Admin ecosystem spend (THE PROBLEM AREA)
    ['GET', '/api/admin/ecosystem/spend/health', 'Spend health check'],
    ['GET', '/api/admin/ecosystem/spend', 'Get all spending'],
    ['DELETE', '/api/admin/ecosystem/spend/test123', 'Delete single spend'],
    ['DELETE', '/api/admin/ecosystem/spend/bulk', 'Bulk delete (THE FAILING ONE)'],
    ['POST', '/api/admin/ecosystem/spend/bulk', 'Bulk delete POST'],
    
    // Other admin endpoints that work
    ['GET', '/api/admin/stats', 'Admin stats'],
    ['GET', '/api/admin/locations', 'Admin locations'],
    ['GET', '/api/admin/settings', 'Admin settings'],
    
    // Public ecosystem endpoints
    ['GET', '/api/ecosystem/wallet', 'Public ecosystem wallet'],
    ['GET', '/api/ecosystem/pumpfun-fees', 'Public pumpfun fees'],
    
    // Other public endpoints
    ['GET', '/api/pumpfun', 'Public pumpfun'],
    ['GET', '/api/stats', 'Public stats'],
  ];

  const results = [];
  
  for (const [method, path, description] of tests) {
    let body = null;
    
    if (method === 'DELETE' && path.includes('bulk')) {
      body = { ids: ['test123'] };
    } else if (method === 'POST' && path.includes('bulk')) {
      body = { action: 'delete', ids: ['test123'] };
    }
    
    const result = await testEndpoint(method, path, body, description);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
  }
  
  console.log('\n📊 SUMMARY OF ALL API TESTS:');
  console.log('=================================');
  
  const working = results.filter(r => r.success);
  const failing = results.filter(r => !r.success && !r.error);
  const errors = results.filter(r => r.error);
  
  console.log(`✅ Working endpoints: ${working.length}`);
  console.log(`❌ Failing endpoints: ${failing.length}`);
  console.log(`💥 Error endpoints: ${errors.length}`);
  
  if (failing.length > 0) {
    console.log('\n❌ FAILING ENDPOINTS:');
    failing.forEach(r => {
      console.log(`  ${r.method} ${r.path} - Status: ${r.status} - ${r.isJSON ? 'JSON' : 'HTML/TEXT'}`);
    });
  }
  
  // Focus on the ecosystem spend issue
  const spendTests = results.filter(r => r.path.includes('/admin/ecosystem/spend'));
  console.log('\n🎯 ECOSYSTEM SPEND ANALYSIS:');
  spendTests.forEach(r => {
    console.log(`  ${r.method} ${r.path} - ${r.success ? '✅ OK' : '❌ FAIL'} (${r.status}) ${r.isJSON ? 'JSON' : 'HTML'}`);
  });
}

auditAllAPIs();
