/** Notifee has no JS-only implementation; tests exercise the decision logic
 * around it, so every call resolves quietly. */
const AndroidImportance = { NONE: 0, MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4 };
const AndroidCategory = { SERVICE: "service" };
const AndroidVisibility = { PUBLIC: 1 };
const AuthorizationStatus = { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 };

const notifee = {
  createChannel: jest.fn(async () => "channel"),
  displayNotification: jest.fn(async () => undefined),
  cancelNotification: jest.fn(async () => undefined),
  getNotificationSettings: jest.fn(async () => ({ authorizationStatus: AuthorizationStatus.AUTHORIZED })),
  requestPermission: jest.fn(async () => ({ authorizationStatus: AuthorizationStatus.AUTHORIZED })),
  registerForegroundService: jest.fn(),
  stopForegroundService: jest.fn(async () => undefined),
  isBatteryOptimizationEnabled: jest.fn(async () => false),
  openBatteryOptimizationSettings: jest.fn(async () => undefined),
};

module.exports = notifee;
module.exports.default = notifee;
module.exports.AndroidImportance = AndroidImportance;
module.exports.AndroidCategory = AndroidCategory;
module.exports.AndroidVisibility = AndroidVisibility;
module.exports.AuthorizationStatus = AuthorizationStatus;
