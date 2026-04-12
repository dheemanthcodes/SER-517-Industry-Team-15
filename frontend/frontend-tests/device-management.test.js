import { describeTestSuite, testCase } from './test-utils.js'

const deviceManagementTestSuite = describeTestSuite('Device Management Test Suite', [
  testCase(
    'DM-001',
    'Verify device list section is visible',
    [
      'Open the device management page',
      'Locate the device list area',
    ],
    'Device list section should be displayed'
  ),
  testCase(
    'DM-002',
    'Verify add device form is accessible',
    [
      'Open the device management page',
      'Click on add device option',
    ],
    'Add device form should be visible'
  ),
  testCase(
    'DM-003',
    'Verify Raspberry Pi selection option exists',
    [
      'Open add device form',
      'Locate Raspberry Pi selection field',
    ],
    'Raspberry Pi selection option should be available'
  ),
])

export default deviceManagementTestSuite