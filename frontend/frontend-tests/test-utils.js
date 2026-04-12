export function describeTestSuite(suiteName, tests) {
  return {
    suiteName,
    total: tests.length,
    tests,
  }
}

export function testCase(id, description, steps, expected) {
  return {
    id,
    description,
    steps,
    expected,
  }
}