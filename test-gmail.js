#!/usr/bin/env node
/**
 * Gmail Integration Test Script
 * Tests all Gmail API endpoints
 * 
 * Usage: node test-gmail.js <token>
 * Where <token> is a valid HR/Admin JWT token
 */

const http = require('http');
const BASE_URL = 'http://localhost:8000/api/hr/gmail';

const token = process.argv[2];
if (!token) {
  console.error('Usage: node test-gmail.js <jwt-token>');
  process.exit(1);
}

const makeRequest = (method, endpoint, body = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : null,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
};

const test = async () => {
  console.log('🧪 Gmail Integration Tests\n');

  try {
    // Test 1: Status Check
    console.log('1️⃣  Testing /status endpoint...');
    const statusResult = await makeRequest('GET', '/status');
    console.log(`   Status: ${statusResult.status}`);
    console.log(`   Response:`, JSON.stringify(statusResult.body, null, 2));
    console.log();

    if (statusResult.status === 503) {
      console.log('⚠️  Gmail not configured (expected in demo mode if no refresh token)');
      console.log('   Add GOOGLE_REFRESH_TOKEN to .env to enable Gmail features\n');
      return;
    }

    // Test 2: List Emails
    console.log('2️⃣  Testing /emails endpoint (list)...');
    const listResult = await makeRequest('GET', '/emails?page=1&limit=5');
    console.log(`   Status: ${listResult.status}`);
    if (listResult.status === 200) {
      console.log(`   Found ${listResult.body.pagination.total} emails`);
      if (listResult.body.emails.length > 0) {
        console.log(`   First email:`, {
          subject: listResult.body.emails[0].subject,
          from: listResult.body.emails[0].from,
          date: listResult.body.emails[0].date,
        });
      }
    } else {
      console.log(`   Response:`, JSON.stringify(listResult.body, null, 2));
    }
    console.log();

    // Test 3: Sync Emails
    console.log('3️⃣  Testing /sync endpoint...');
    const syncResult = await makeRequest('POST', '/sync', {
      label: 'INBOX',
      maxResults: 5,
    });
    console.log(`   Status: ${syncResult.status}`);
    console.log(`   Response:`, JSON.stringify(syncResult.body, null, 2));
    console.log();

    // Test 4: Get Email Details (if any exist)
    if (listResult.status === 200 && listResult.body.emails.length > 0) {
      const emailId = listResult.body.emails[0]._id;
      console.log('4️⃣  Testing /emails/:id endpoint...');
      const detailResult = await makeRequest('GET', `/emails/${emailId}`);
      console.log(`   Status: ${detailResult.status}`);
      if (detailResult.status === 200) {
        console.log(`   Email:`, {
          subject: detailResult.body.subject,
          from: detailResult.body.from,
          hasBody: !!detailResult.body.body,
          bodyLength: detailResult.body.body ? detailResult.body.body.length : 0,
        });
      } else {
        console.log(`   Response:`, JSON.stringify(detailResult.body, null, 2));
      }
      console.log();

      // Test 5: Generate AI Summary
      console.log('5️⃣  Testing /emails/:id/ai endpoint (AI summary)...');
      const aiResult = await makeRequest('POST', `/emails/${emailId}/ai`);
      console.log(`   Status: ${aiResult.status}`);
      if (aiResult.status === 200) {
        console.log(`   Summary:`, JSON.stringify(aiResult.body.aiSummary, null, 2));
      } else {
        console.log(`   Response:`, JSON.stringify(aiResult.body, null, 2));
      }
      console.log();
    }

    console.log('✅ All tests completed!');
  } catch (err) {
    console.error('❌ Test error:', err.message);
    process.exit(1);
  }
};

test();
