#!/usr/bin/env node

const http = require('http');

// Start server
const server = require('./src/server.js');

// Give server time to start
setTimeout(() => {
  // Test health endpoint
  http
    .get('http://localhost:3001/health', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log('\n✓ Health check passed:', data);
        process.exit(0);
      });
    })
    .on('error', (err) => {
      console.error('\n✗ Health check failed:', err.message);
      process.exit(1);
    });
}, 500);
