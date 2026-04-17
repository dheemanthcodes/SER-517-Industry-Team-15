import { describeTestSuite, testCase } from './test-utils.js'

const loginPageTestSuite = describeTestSuite('Login Page Test Suite', [
  testCase(
    'LP-001',
    'Verify email input field is present on the login page',
    [
      'Open the login page',
      'Locate the email input field',
    ],
    'Email input field should be visible and enabled'
  ),
  testCase(
    'LP-002',
    'Verify password input field is present',
    [
      'Open the login page',
      'Locate the password input field',
    ],
    'Password input field should be visible and masked'
  ),
  testCase(
    'LP-003',
    'Verify validation message on empty submission',
    [
      'Open the login page',
      'Click login without entering any data',
    ],
    'Validation messages should be shown for required fields'
  ),
  testCase(
    'LP-004',
    'Verify login button is clickable',
    [
      'Open the login page',
      'Locate the login button',
      'Click the login button',
    ],
    'Login button should respond to click action'
  ),
])

export default loginPageTestSuite