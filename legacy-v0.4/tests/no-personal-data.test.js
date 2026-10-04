const assert = require('assert');
const fs = require('fs');
const path = require('path');

const FORBIDDEN = [
  'PRINCE THAKUR', 'prince.thakur@gov.in', '93172 69369',
  'SHRI DEEP CHAND', '11235', 'Bhoranj (Tarkwari)', 'Bajroh'
];

const srcDir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js') || f.endsWith('.html'));

files.forEach((f) => {
  const text = fs.readFileSync(path.join(srcDir, f), 'utf8');
  FORBIDDEN.forEach((needle) => {
    assert.ok(!text.includes(needle), `${f} contains personal data: "${needle}"`);
  });
});

console.log('no-personal-data test passed (' + files.length + ' files checked)');
