/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = (config) => ({
  type: "share",
  name: "ShareExtension",
  displayName: "Recall",
  bundleIdentifier: "com.b3nny1nc.recall.ShareExtension",
  deploymentTarget: "18.0",
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
    "keychain-access-groups": ["9PWN6F3TK8.*", "com.apple.token"],
  },
  icon: "../../assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png",
});
