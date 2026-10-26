const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const nginxConfig = fs.readFileSync(
  path.resolve(__dirname, '../../../nginx/nginx.conf'),
  'utf8',
);

test('Nginx refreshes both API upstream addresses through Docker DNS', () => {
  assert.match(nginxConfig, /resolver\s+127\.0\.0\.11\b[^;]*;/);
  assert.match(nginxConfig, /upstream\s+crewlink_api\s*{[^}]*\bzone\s+crewlink_api\s+\d+k;/s);
  assert.match(nginxConfig, /server\s+api1:3001\s+resolve;/);
  assert.match(nginxConfig, /server\s+api2:3001\s+resolve;/);
});
