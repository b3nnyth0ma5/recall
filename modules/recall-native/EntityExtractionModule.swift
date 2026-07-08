import ExpoModulesCore
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

      // Ensure lexical class assets are available before tagging
      let scheme: NLTagScheme = .lexicalClass
      let language: NLLanguage = .english
      if !NLTagger.availableTagSchemes(for: .word, language: language).contains(scheme) {
        do {
          try await NLTagger.requestAssets(for: language, tagScheme: scheme)
        } catch {
          // Asset download failed — tagger will still run with reduced accuracy
          print("[EntityExtraction] NLTagger asset download failed: \(error.localizedDescription)")
        }
      }

      // Named entity recognition — primary pass
      let tagger = NLTagger(tagSchemes: [.nameType, .lexicalClass])
      tagger.string = query

      let nameOptions: NLTagger.Options = [.omitPunctuation, .omitWhitespace, .joinNames]
      tagger.enumerateTags(in: query.startIndex..<query.endIndex, unit: .word, scheme: .nameType, options: nameOptions) { tag, range in
        guard let tag = tag else { return true }
        let token = String(query[range])
        switch tag {
        case .personalName:
          if !people.contains(token) {
            people.append(token)
          }
        case .placeName, .organizationName:
          if location.isEmpty {
            location = token
          }
        default:
          break
        }
        return true
      }

      // Keyword extraction: single words AND multi-word content-word phrases
      // Strategy: scan for consecutive content-word tokens and group them into phrases
      let lexOptions2: NLTagger.Options = [.omitPunctuation, .omitWhitespace]
      let tagger2 = NLTagger(tagSchemes: [.lexicalClass])
      tagger2.string = query

      // Tags that are function words / punctuation — excluded from phrase building
      let excludedTags: Set<NLTag> = [
        .determiner, .particle, .preposition, .conjunction, .interjection,
        .classifier, .idiom, .otherPunctuation, .sentenceTerminator,
        .openQuote, .closeQuote, .openParenthesis, .closeParenthesis,
        .wordJoiner, .dash
      ]

      // Stopwords that add no search value even if tagged as content words
      let stopwords: Set<String> = [
        "my", "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
        "may", "might", "shall", "can", "need", "dare", "ought", "used",
        "to", "of", "in", "for", "on", "with", "at", "by", "from", "up", "about",
        "into", "through", "during", "before", "after", "above", "below", "between",
        "out", "off", "over", "under", "again", "further", "then", "once",
        "i", "me", "we", "our", "you", "your", "he", "she", "it", "they", "them",
        "what", "which", "who", "this", "that", "these", "those",
        "and", "but", "or", "so", "yet", "both", "either", "not", "no", "nor",
        "just", "than", "too", "very", "s", "t", "don",
        "how", "when", "where", "why",
        "all", "any", "each", "few", "more", "most", "other", "some", "such",
        "own", "same", "also"
      ]

      // Collect all (token, tag, range) tuples
      var tokenTags: [(token: String, tag: NLTag, range: Range<String.Index>)] = []
      tagger2.enumerateTags(in: query.startIndex..<query.endIndex, unit: .word, scheme: .lexicalClass, options: lexOptions2) { tag, range in
        guard let tag = tag else { return true }
        let token = String(query[range])
        tokenTags.append((token: token, tag: tag, range: range))
        return true
      }

      // Helper: determine if a token is a content word
      func isContentWord(_ t: (token: String, tag: NLTag, range: Range<String.Index>)) -> Bool {
        let lower = t.token.lowercased()
        if excludedTags.contains(t.tag) { return false }
        if stopwords.contains(lower) { return false }
        return true
      }

      // Slide over tokens: build phrases from consecutive content-word runs
      var i = 0
      while i < tokenTags.count {
        let t = tokenTags[i]
        if isContentWord(t) {
          // Start a phrase run
          var phraseTokens: [String] = [t.token]
          var j = i + 1
          while j < tokenTags.count {
            let next = tokenTags[j]
            if isContentWord(next) {
              phraseTokens.append(next.token)
              j += 1
            } else {
              break
            }
          }
          // Add the full phrase (if multi-word)
          if phraseTokens.count > 1 {
            let phrase = phraseTokens.joined(separator: " ").lowercased()
            if !keywords.contains(phrase) {
              keywords.append(phrase)
            }
          }
          // Also add individual words that are long enough
          for tok in phraseTokens {
            let lower = tok.lowercased()
            if lower.count > 2 && !keywords.contains(lower) {
              keywords.append(lower)
            }
          }
          i = j
        } else {
          i += 1
        }
      }

      // Deduplicate: remove keywords that are already captured as people names
      let peopleNormalized = Set(people.map { $0.lowercased() })
      keywords = keywords.filter { !peopleNormalized.contains($0.lowercased()) }

      // Deduplication: remove shorter keywords that are already covered by a longer phrase
      keywords = keywords.filter { kw in
        // Keep this keyword if no other keyword in the list contains it as a substring
        // (and is longer than it, meaning it's a more specific phrase)
        !keywords.contains(where: { other in
          other != kw && other.contains(kw) && other.count > kw.count
        })
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
        let text = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
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
