/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = (config) => ({
  type: "share",
  name: "ShareExtension",
  bundleIdentifier: "com.b3nny1nc.recall.ShareExtension",
  deploymentTarget: "15.1",
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
  icon: "../../assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png",
});
