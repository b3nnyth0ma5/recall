// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: [
    'expo',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'import'],
  root: true,
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  ignorePatterns: ['/dist/*', '/public/*', '/babel-plugins/*', '*.config.js', '*.config.ts'],
  env: {
    browser: true,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-var-requires": "off",
    "react/react-in-jsx-scope": "off",
    "@typescript-eslint/no-empty-object-type": "off",
    "@typescript-eslint/no-wrapper-object-types": "off",
    "react/no-unescaped-entities": "off",
    "import/no-unresolved": ["error", { "ignore": ["react-native", "@10play/tentap-editor", "expo-image", "expo-blur", "expo-haptics", "expo-symbols", "expo-linear-gradient", "expo-location", "expo-clipboard", "expo-sharing", "expo-web-browser", "expo-constants", "expo-font", "expo-asset", "expo-status-bar", "expo-splash-screen", "expo-system-ui", "expo-network", "expo-media-library", "expo-image-picker", "expo-image-manipulator", "expo-document-picker", "expo-file-system", "expo-linking", "expo-build-properties"] }],
    "@typescript-eslint/no-require-imports": "off",
    "import/namespace": "off",
    "prefer-const": "off",
    "react/prop-types": 1,
    "no-case-declarations": "off",
    "no-empty": "off",
    "react/display-name": "off"
  },
  overrides: [
    {
      files: ['metro.config.js'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off'
      }
    },
    {
      files: ['jest.setup.js', '**/__tests__/**/*', '**/*.test.ts', '**/*.test.tsx'],
      env: {
        jest: true,
      },
    }
  ]
};
