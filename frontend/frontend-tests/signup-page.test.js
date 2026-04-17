import { describeTestSuite, testCase } from './test-utils.js'

const signupPageTestSuite = describeTestSuite('Signup Page Test Suite', [
  testCase(
    'SP-001',
    'Verify all required fields are present',
    [
      'Open the signup page',
      'Check for email, password, and confirm password fields',
    ],
    'All required fields should be visible'
  ),
  testCase(
    'SP-002',
    'Verify password confirmation validation',
    [
      'Enter different values in password and confirm password',
      'Submit the form',
    ],
    'System should show password mismatch error'
  ),
  testCase(
    'SP-003',
    'Verify form submission with valid inputs',
    [
      'Enter valid email and matching passwords',
      'Submit the form',
    ],
    'Form should accept valid inputs'
  ),
])

export default signupPageTestSuite