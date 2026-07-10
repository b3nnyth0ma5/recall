import ExpoModulesCore
import NaturalLanguage
import Foundation
import Vision

public struct FaceDetectionResult: Record {
  @Field public var faceUuid: String = ""
  @Field public var bboxX: Double = 0
  @Field public var bboxY: Double = 0
  @Field public var bboxW: Double = 0
  @Field public var bboxH: Double = 0
  @Field public var roll: Double = 0
  @Field public var yaw: Double = 0
}

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

    AsyncFunction("extractTextFromImage") { (imageUri: String) async throws -> String in
      guard let url = URL(string: imageUri) else {
        return ""
      }

      let config = URLSessionConfiguration.default
      config.timeoutIntervalForRequest = 15
      config.timeoutIntervalForResource = 15
      let session = URLSession(configuration: config)

      let imageData: Data
      do {
        let (data, _) = try await session.data(from: url)
        imageData = data
      } catch {
        print("[EntityExtraction] extractTextFromImage: network error: \(error.localizedDescription)")
        return ""
      }

      guard let cgImage = UIImage(data: imageData)?.cgImage else {
        return ""
      }

      var resultText = ""
      var resultError: Error? = nil

      let request = VNRecognizeTextRequest { req, err in
        if let err = err { resultError = err; return }
        let observations = req.results as? [VNRecognizedTextObservation] ?? []
        resultText = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      try handler.perform([request])

      if let err = resultError { throw err }
      return resultText
    }

    AsyncFunction("detectFaces") { (imageUri: String) async throws -> [FaceDetectionResult] in
      guard let url = URL(string: imageUri) else {
        print("[EntityExtraction] detectFaces: invalid URL: \(imageUri)")
        return []
      }

      let config = URLSessionConfiguration.default
      config.timeoutIntervalForRequest = 15
      config.timeoutIntervalForResource = 15
      let session = URLSession(configuration: config)

      let imageData: Data
      do {
        let (data, _) = try await session.data(from: url)
        imageData = data
      } catch {
        print("[EntityExtraction] detectFaces: network error: \(error.localizedDescription)")
        return []
      }

      guard let uiImage = UIImage(data: imageData),
            let cgImage = uiImage.cgImage else {
        print("[EntityExtraction] detectFaces: failed to decode image data")
        return []
      }

      var faces: [FaceDetectionResult] = []

      let request = VNDetectFaceRectanglesRequest { req, err in
        if let err = err {
          print("[EntityExtraction] detectFaces: Vision error: \(err.localizedDescription)")
          return
        }
        let observations = req.results as? [VNFaceObservation] ?? []
        faces = observations.map { obs -> FaceDetectionResult in
          let bbox = obs.boundingBox
          var result = FaceDetectionResult()
          result.faceUuid = obs.uuid.uuidString
          result.bboxX = Double(bbox.origin.x)
          result.bboxY = Double(1.0 - bbox.origin.y - bbox.size.height)
          result.bboxW = Double(bbox.size.width)
          result.bboxH = Double(bbox.size.height)
          result.roll = obs.roll?.doubleValue ?? 0.0
          result.yaw = obs.yaw?.doubleValue ?? 0.0
          return result
        }
      }

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        print("[EntityExtraction] detectFaces: handler.perform error: \(error.localizedDescription)")
        return []
      }

      print("[EntityExtraction] detectFaces: detected \(faces.count) face(s)")
      return faces
    }

    AsyncFunction("extractFaceEmbedding") { (imageUri: String, bboxX: Double, bboxY: Double, bboxW: Double, bboxH: Double) async throws -> [Double] in
      guard let url = URL(string: imageUri) else {
        print("[EntityExtraction] extractFaceEmbedding: invalid URL: \(imageUri)")
        return []
      }

      let config = URLSessionConfiguration.default
      config.timeoutIntervalForRequest = 15
      config.timeoutIntervalForResource = 15
      let session = URLSession(configuration: config)

      let imageData: Data
      do {
        let (data, _) = try await session.data(from: url)
        imageData = data
      } catch {
        print("[EntityExtraction] extractFaceEmbedding: network error: \(error.localizedDescription)")
        return []
      }

      guard let uiImage = UIImage(data: imageData),
            let cgImage = uiImage.cgImage else {
        print("[EntityExtraction] extractFaceEmbedding: failed to decode image data")
        return []
      }

      var descriptor = [Double]()

      let request = VNDetectFaceLandmarksRequest { req, err in
        if let err = err {
          print("[EntityExtraction] extractFaceEmbedding: Vision error: \(err.localizedDescription)")
          return
        }

        let observations = req.results as? [VNFaceObservation] ?? []
        guard !observations.isEmpty else {
          print("[EntityExtraction] extractFaceEmbedding: no face observations found")
          return
        }

        // Find the observation whose centroid is closest to the provided bbox centroid.
        // Vision bbox uses bottom-left origin; provided bbox uses top-left origin.
        let providedCentreX = bboxX + bboxW / 2.0
        let providedCentreY_topLeft = bboxY + bboxH / 2.0
        let providedCentreY_vision = 1.0 - providedCentreY_topLeft

        var bestObs: VNFaceObservation? = nil
        var bestDist = Double.greatestFiniteMagnitude
        for obs in observations {
          let b = obs.boundingBox
          let cx = Double(b.origin.x) + Double(b.size.width) / 2.0
          let cy = Double(b.origin.y) + Double(b.size.height) / 2.0
          let d = (cx - providedCentreX) * (cx - providedCentreX) +
                  (cy - providedCentreY_vision) * (cy - providedCentreY_vision)
          if d < bestDist { bestDist = d; bestObs = obs }
        }

        guard let obs = bestObs,
              let landmarks = obs.landmarks,
              let allPoints = landmarks.allPoints else {
          print("[EntityExtraction] extractFaceEmbedding: no landmarks on best observation")
          return
        }

        let pointCount = allPoints.pointCount
        guard pointCount > 0 else {
          print("[EntityExtraction] extractFaceEmbedding: zero landmark points")
          return
        }

        var rawPoints = [(x: Float, y: Float)]()
        rawPoints.reserveCapacity(pointCount)
        let normalizedPoints = allPoints.normalizedPoints
        for i in 0..<pointCount {
          let p = normalizedPoints[i]
          rawPoints.append((x: Float(p.x), y: Float(1.0 - p.y)))
        }

        func centroid(_ indices: [Int]) -> (x: Float, y: Float) {
          guard !indices.isEmpty else { return (0, 0) }
          var sx: Float = 0; var sy: Float = 0
          for i in indices {
            let p = i < rawPoints.count ? rawPoints[i] : (x: Float(0), y: Float(0))
            sx += p.x; sy += p.y
          }
          let n = Float(indices.count)
          return (sx / n, sy / n)
        }

        func dist(_ a: (x: Float, y: Float), _ b: (x: Float, y: Float)) -> Double {
          let dx = a.x - b.x; let dy = a.y - b.y
          return Double(sqrt(dx*dx + dy*dy))
        }

        let anchors: [(x: Float, y: Float)] = [
          centroid(Array(0..<8)),
          centroid(Array(8..<16)),
          centroid(Array(16..<28)),
          centroid(Array(28..<48)),
          centroid(Array(48..<68)),
          centroid(Array(68..<min(76, rawPoints.count))),
          rawPoints.count > 0  ? rawPoints[0]  : (0,0),
          rawPoints.count > 7  ? rawPoints[7]  : (0,0),
          rawPoints.count > 8  ? rawPoints[8]  : (0,0),
          rawPoints.count > 15 ? rawPoints[15] : (0,0),
          rawPoints.count > 16 ? rawPoints[16] : (0,0),
          rawPoints.count > 27 ? rawPoints[27] : (0,0),
          rawPoints.count > 28 ? rawPoints[28] : (0,0),
          rawPoints.count > 47 ? rawPoints[47] : (0,0),
          rawPoints.count > 48 ? rawPoints[48] : (0,0),
          rawPoints.count > 67 ? rawPoints[67] : (0,0),
        ]

        var result = [Double]()
        result.reserveCapacity(128)
        for i in 0..<anchors.count {
          for j in (i+1)..<anchors.count {
            result.append(dist(anchors[i], anchors[j]))
          }
        }
        while result.count < 128 { result.append(0) }
        if result.count > 128 { result = Array(result.prefix(128)) }

        var sumSq: Double = 0
        for v in result { sumSq += v * v }
        let norm = sqrt(sumSq)
        if norm > 1e-6 {
          for i in 0..<result.count { result[i] /= norm }
        }

        print("[EntityExtraction] extractFaceEmbedding: returning \(result.count)-float descriptor (pre-norm magnitude: \(norm))")
        descriptor = result
      }

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        print("[EntityExtraction] extractFaceEmbedding: handler.perform error: \(error.localizedDescription)")
        return []
      }

      return descriptor
    }
  }
}
