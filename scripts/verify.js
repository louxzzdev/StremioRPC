const assert = require('node:assert/strict');
const { parseRuntimeSeconds } = require('../metadata');

const cases = [
    ['124 min', 7440],
    ['2h 4m', 7440],
    ['2 hours 4 minutes', 7440],
    [124, 7440],
    ['N/A', null],
    [null, null]
];

for (const [runtime, expected] of cases) {
    assert.equal(parseRuntimeSeconds(runtime), expected, `Unexpected runtime value for ${runtime}`);
}

console.log('Runtime metadata checks passed.');
