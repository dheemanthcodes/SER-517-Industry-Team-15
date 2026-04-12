import { describeTestSuite, testCase } from './test-utils.js'

const raspberryPiConfigTestSuite = describeTestSuite('Raspberry Pi Config Test Suite', [
  testCase(
    'RP-001',
    'Verify Raspberry Pi list is displayed',
    [
      'Open Raspberry Pi configuration page',
      'Locate the list or table',
    ],
    'List of Raspberry Pi devices should be visible'
  ),
  testCase(
    'RP-002',
    'Verify add Raspberry Pi form',
    [
      'Navigate to add Raspberry Pi section',
      'Check input fields',
    ],
    'Input fields should be available for new entry'
  ),
  testCase(
    'RP-003',
    'Verify search functionality UI exists',
    [
      'Open Raspberry Pi configuration page',
      'Locate search input field',
    ],
    'Search input should be visible'
  ),
])

export default raspberryPiConfigTestSuite