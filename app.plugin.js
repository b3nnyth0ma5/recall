const { createRunOncePlugin, withPodfile, withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin for Recall App
 *
 * 1. Injects FOLLY_CFG_NO_COROUTINES=1 compiler flag (fixes folly/coro/Coroutine.h build error).
 * 2. Strips -D EXPO_CONFIGURATION_DEBUG from OTHER_SWIFT_FLAGS in Release build configurations
 *    so it cannot leak into production builds and cause module-resolution mismatches.
 * 3. Injects AppGroupModule.swift into ios/RecallNative/ during prebuild.
 * 4. Injects SiriShortcutsModule.swift into ios/RecallNative/ during prebuild.
 */

const withFollyNoCoroutines = (config) => {
  return withPodfile(config, (config) => {
    const contents = config.modResults.contents;

    // Idempotency: skip if already applied
    if (contents.includes('FOLLY_CFG_NO_COROUTINES')) {
      return config;
    }

    const anchor = 'post_install do |installer|';

    if (!contents.includes(anchor)) {
      console.warn('[withFollyNoCoroutines] Could not find post_install block in Podfile — skipping folly fix');
      return config;
    }

    // Inject our fix as the FIRST thing inside the existing post_install block
    const injection = `${anchor}
  # Fix: folly/coro/Coroutine.h file not found (RN 0.81 + Reanimated)
  # Disables folly coroutine support to avoid missing vendored headers.
  installer.pods_project.build_configurations.each do |cfg|
    cfg.build_settings['OTHER_CPLUSPLUSFLAGS'] ||= ['$(OTHER_CFLAGS)']
    cfg.build_settings['OTHER_CPLUSPLUSFLAGS'] << '-DFOLLY_CFG_NO_COROUTINES=1'
  end`;

    // Replace only the FIRST occurrence of the anchor
    config.modResults.contents = contents.replace(anchor, injection);
    return config;
  });
};

/**
 * Strips -D EXPO_CONFIGURATION_DEBUG from OTHER_SWIFT_FLAGS in all Release
 * build configurations of the main Xcode project.  This prevents the debug
 * flag from leaking into production builds and causing module-resolution
 * mismatches (e.g. "no such module 'RecallNative'").
 */
const withStripDebugConfigFlag = (config) => {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const FLAG = '-D EXPO_CONFIGURATION_DEBUG';

    // Iterate every build configuration in the project
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigs)) {
      const buildConfig = buildConfigs[key];
      if (typeof buildConfig !== 'object' || !buildConfig.name) continue;

      // Only strip from Release configurations
      if (buildConfig.name !== 'Release') continue;

      const settings = buildConfig.buildSettings;
      if (!settings) continue;

      // OTHER_SWIFT_FLAGS can be a string or an array
      if (typeof settings.OTHER_SWIFT_FLAGS === 'string') {
        if (settings.OTHER_SWIFT_FLAGS.includes(FLAG)) {
          settings.OTHER_SWIFT_FLAGS = settings.OTHER_SWIFT_FLAGS
            .split(' ')
            .filter((f) => f !== '-D' && f !== 'EXPO_CONFIGURATION_DEBUG')
            .join(' ')
            .trim();
          console.log(`[withStripDebugConfigFlag] Stripped ${FLAG} from Release OTHER_SWIFT_FLAGS (key: ${key})`);
        }
      } else if (Array.isArray(settings.OTHER_SWIFT_FLAGS)) {
        const before = settings.OTHER_SWIFT_FLAGS.length;
        settings.OTHER_SWIFT_FLAGS = settings.OTHER_SWIFT_FLAGS.filter(
          (f) => f !== FLAG && f !== '-D EXPO_CONFIGURATION_DEBUG' && f !== 'EXPO_CONFIGURATION_DEBUG'
        );
        if (settings.OTHER_SWIFT_FLAGS.length !== before) {
          console.log(`[withStripDebugConfigFlag] Stripped ${FLAG} from Release OTHER_SWIFT_FLAGS array (key: ${key})`);
        }
      }
    }

    return config;
  });
};

const APP_GROUP_MODULE_SWIFT = `import ExpoModulesCore
import Foundation

public class AppGroupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppGroupModule")

    AsyncFunction("getContainerPath") { (appGroupId: String, promise: Promise) in
      if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) {
        promise.resolve(url.path)
      } else {
        promise.reject("ERR_APP_GROUP", "Could not resolve container URL for app group: \\(appGroupId)")
      }
    }

    AsyncFunction("verifyContainer") { (appGroupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
        promise.reject("ERR_APP_GROUP", "Could not resolve container URL for app group: \\(appGroupId)")
        return
      }
      let containerPath = containerURL.path
      let containerExists = FileManager.default.fileExists(atPath: containerPath)
      let tokenFileURL = containerURL.appendingPathComponent("auth-token.json")
      let tokenFileExists = FileManager.default.fileExists(atPath: tokenFileURL.path)
      var tokenFileSize: Int = 0
      var tokenFileModifiedTimestamp: Double = 0
      if tokenFileExists {
        if let attrs = try? FileManager.default.attributesOfItem(atPath: tokenFileURL.path) {
          tokenFileSize = (attrs[.size] as? Int) ?? 0
          if let modDate = attrs[.modificationDate] as? Date {
            tokenFileModifiedTimestamp = modDate.timeIntervalSince1970 * 1000
          }
        }
      }
      promise.resolve([
        "containerPath": containerPath,
        "containerExists": containerExists,
        "tokenFileExists": tokenFileExists,
        "tokenFileSize": tokenFileSize,
        "tokenFileModifiedTimestamp": tokenFileModifiedTimestamp
      ])
    }

    AsyncFunction("readLastShareExtensionError") { (appGroupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
        promise.resolve(nil)
        return
      }
      let errorFileURL = containerURL.appendingPathComponent("last-share-error.json")
      guard FileManager.default.fileExists(atPath: errorFileURL.path),
            let data = try? Data(contentsOf: errorFileURL),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        promise.resolve(nil)
        return
      }
      promise.resolve(json)
    }

    AsyncFunction("clearLastShareExtensionError") { (appGroupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
        promise.resolve(false)
        return
      }
      let errorFileURL = containerURL.appendingPathComponent("last-share-error.json")
      guard FileManager.default.fileExists(atPath: errorFileURL.path) else {
        promise.resolve(false)
        return
      }
      do {
        try FileManager.default.removeItem(at: errorFileURL)
        promise.resolve(true)
      } catch {
        promise.resolve(false)
      }
    }

    AsyncFunction("writeTokenFile") { (appGroupId: String, json: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
        promise.reject("ERR_APP_GROUP", "Could not resolve container URL for app group: \\(appGroupId)")
        return
      }
      let tokenURL = containerURL.appendingPathComponent("auth-token.json")
      do {
        try json.write(to: tokenURL, atomically: true, encoding: .utf8)
        print("[AppGroupModule] writeTokenFile — wrote \\(json.count) chars to \\(tokenURL.path)")
        promise.resolve(true)
      } catch {
        print("[AppGroupModule] writeTokenFile — write failed: \\(error.localizedDescription)")
        promise.reject("ERR_APP_GROUP_WRITE", error.localizedDescription)
      }
    }

    AsyncFunction("deleteTokenFile") { (appGroupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
        promise.resolve(false)
        return
      }
      let tokenURL = containerURL.appendingPathComponent("auth-token.json")
      guard FileManager.default.fileExists(atPath: tokenURL.path) else {
        promise.resolve(false)
        return
      }
      do {
        try FileManager.default.removeItem(at: tokenURL)
        print("[AppGroupModule] deleteTokenFile — deleted \\(tokenURL.path)")
        promise.resolve(true)
      } catch {
        print("[AppGroupModule] deleteTokenFile — delete failed: \\(error.localizedDescription)")
        promise.resolve(false)
      }
    }
  }
}
`;

const SIRI_SHORTCUTS_MODULE_SWIFT = `import ExpoModulesCore
import Foundation
import CoreSpotlight
import UniformTypeIdentifiers

public class SiriShortcutsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SiriShortcutsModule")

    AsyncFunction("donateSearch") { (query: String, promise: Promise) in
      let activityType = "com.b3nny1nc.recall.search"
      let activity = NSUserActivity(activityType: activityType)
      activity.title = "Search for \\"\\(query)\\""
      activity.isEligibleForSearch = true
      activity.isEligibleForPrediction = true
      activity.persistentIdentifier = NSUserActivityPersistentIdentifier("search-\\(query)")
      let attributes = CSSearchableItemAttributeSet(contentType: UTType.text)
      attributes.contentDescription = "Search Recall for \\"\\(query)\\""
      activity.becomeCurrent()
      promise.resolve(nil)
    }
  }
}
`;

const ENTITY_EXTRACTION_MODULE_SWIFT = `import ExpoModulesCore
import NaturalLanguage
import Foundation
import Vision

public class EntityExtractionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EntityExtractionModule")

    AsyncFunction("extractEntities") { (query: String, promise: Promise) in
      var keywords: [String] = []
      var people: [String] = []
      var location: String = ""
      var locationIntent: String? = nil

      // Named entity recognition
      let tagger = NLTagger(tagSchemes: [.nameType, .lexicalClass])
      tagger.string = query

      let nameOptions: NLTagger.Options = [.omitPunctuation, .omitWhitespace, .joinNames]
      tagger.enumerateTags(in: query.startIndex..<query.endIndex, unit: .word, scheme: .nameType, options: nameOptions) { tag, range in
        guard let tag = tag else { return true }
        let token = String(query[range])
        switch tag {
        case .personalName:
          people.append(token)
        case .placeName, .organizationName:
          location = token
        default:
          break
        }
        return true
      }

      // Keyword extraction (nouns and adjectives)
      let lexOptions: NLTagger.Options = [.omitPunctuation, .omitWhitespace]
      tagger.enumerateTags(in: query.startIndex..<query.endIndex, unit: .word, scheme: .lexicalClass, options: lexOptions) { tag, range in
        guard let tag = tag else { return true }
        let token = String(query[range]).lowercased()
        if (tag == .noun || tag == .adjective) && token.count > 2 {
          if !keywords.contains(token) {
            keywords.append(token)
          }
        }
        return true
      }

      // Location intent detection
      let lower = query.lowercased()
      if lower.contains("near me") || lower.contains("nearby") || lower.contains("close to me") {
        locationIntent = "near_me"
      } else if lower.contains(" near ") {
        locationIntent = "near"
      } else if lower.contains(" in ") || lower.contains(" at ") || lower.contains(" from ") {
        locationIntent = "in"
      }

      promise.resolve([
        "keywords": keywords,
        "people": people,
        "location": location,
        "locationIntent": locationIntent as Any
      ])
    }

    AsyncFunction("extractPeopleFromText") { (text: String, promise: Promise) in
      // Extract person names from arbitrary text using NLTagger
      var people: [String] = []
      let tagger = NLTagger(tagSchemes: [.nameType])
      tagger.string = text
      let options: NLTagger.Options = [.omitPunctuation, .omitWhitespace, .joinNames]
      tagger.enumerateTags(in: text.startIndex..<text.endIndex, unit: .word, scheme: .nameType, options: options) { tag, range in
        guard let tag = tag, tag == .personalName else { return true }
        let name = String(text[range])
        if !people.contains(name) {
          people.append(name)
        }
        return true
      }
      promise.resolve(people)
    }

    AsyncFunction("extractTextFromImage") { (imageUri: String, promise: Promise) in
      // Use Vision framework VNRecognizeTextRequest for on-device OCR
      guard let url = URL(string: imageUri),
            let imageData = try? Data(contentsOf: url),
            let cgImage = UIImage(data: imageData)?.cgImage else {
        promise.resolve("")
        return
      }

      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          promise.reject("ERR_OCR", error.localizedDescription)
          return
        }
        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        let text = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\\n")
        promise.resolve(text)
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        promise.reject("ERR_OCR", error.localizedDescription)
      }
    }

    AsyncFunction("detectFaces") { (imageUri: String, promise: Promise) in
      guard let url = URL(string: imageUri),
            let imageData = try? Data(contentsOf: url),
            let uiImage = UIImage(data: imageData),
            let cgImage = uiImage.cgImage else {
        promise.resolve([])
        return
      }

      let request = VNDetectFaceRectanglesRequest { request, error in
        if let error = error {
          promise.reject("ERR_FACE", error.localizedDescription)
          return
        }
        let observations = request.results as? [VNFaceObservation] ?? []
        let faces = observations.map { obs -> [String: Any] in
          let bbox = obs.boundingBox
          // Vision uses bottom-left origin — flip Y for top-left UI coordinates
          return [
            "faceUuid": obs.uuid.uuidString,
            "bboxX": Double(bbox.origin.x),
            "bboxY": Double(1.0 - bbox.origin.y - bbox.size.height),
            "bboxW": Double(bbox.size.width),
            "bboxH": Double(bbox.size.height),
            "roll": obs.roll?.doubleValue ?? 0.0,
            "yaw": obs.yaw?.doubleValue ?? 0.0,
          ]
        }
        promise.resolve(faces)
      }

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        promise.reject("ERR_FACE", error.localizedDescription)
      }
    }
  }
}
`;

/**
 * Writes EntityExtractionModule.swift into ios/RecallNative/ during expo prebuild.
 * Always overwrites (idempotent).
 */
const withEntityExtractionModule = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const targetDir = path.join(config.modRequest.projectRoot, 'modules', 'recall-native');
      fs.mkdirSync(targetDir, { recursive: true });
      const targetFile = path.join(targetDir, 'EntityExtractionModule.swift');
      fs.writeFileSync(targetFile, ENTITY_EXTRACTION_MODULE_SWIFT, 'utf8');
      console.log('[withEntityExtractionModule] Wrote modules/recall-native/EntityExtractionModule.swift');
      return config;
    },
  ]);
};

/**
 * Writes AppGroupModule.swift into modules/recall-native/ during expo prebuild.
 * Always overwrites (idempotent).
 */
const withAppGroupModule = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const targetDir = path.join(config.modRequest.projectRoot, 'modules', 'recall-native');
      fs.mkdirSync(targetDir, { recursive: true });
      const targetFile = path.join(targetDir, 'AppGroupModule.swift');
      fs.writeFileSync(targetFile, APP_GROUP_MODULE_SWIFT, 'utf8');
      console.log('[withAppGroupModule] Wrote modules/recall-native/AppGroupModule.swift');
      return config;
    },
  ]);
};

/**
 * Writes SiriShortcutsModule.swift into ios/RecallNative/ during expo prebuild.
 * Always overwrites (idempotent).
 */
const withSiriShortcutsModule = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const targetDir = path.join(config.modRequest.projectRoot, 'ios', 'RecallNative');
      fs.mkdirSync(targetDir, { recursive: true });
      const targetFile = path.join(targetDir, 'SiriShortcutsModule.swift');
      fs.writeFileSync(targetFile, SIRI_SHORTCUTS_MODULE_SWIFT, 'utf8');
      console.log('[withSiriShortcutsModule] Wrote ios/RecallNative/SiriShortcutsModule.swift');
      return config;
    },
  ]);
};

const withRecallConfig = (config) => {
  config = withFollyNoCoroutines(config);
  config = withStripDebugConfigFlag(config);
  config = withEntityExtractionModule(config);
  config = withAppGroupModule(config);
  // config = withSiriShortcutsModule(config); // recall-native disabled
  return config;
};

module.exports = createRunOncePlugin(withRecallConfig, 'withRecallConfig', '1.0.0');
