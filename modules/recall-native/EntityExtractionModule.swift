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

    // Fix 1 (detectFaces): async URLSession with 15-second timeout
    AsyncFunction("detectFaces") { (imageUri: String, promise: Promise) in
      guard let url = URL(string: imageUri) else {
        print("[EntityExtraction] detectFaces: invalid URL: \(imageUri)")
        promise.resolve([])
        return
      }

      var detectConfig = URLSessionConfiguration.default
      detectConfig.timeoutIntervalForRequest = 15
      detectConfig.timeoutIntervalForResource = 15
      let detectSession = URLSession(configuration: detectConfig)

      let detectImageData: Data
      do {
        let (data, _) = try await detectSession.data(from: url)
        detectImageData = data
      } catch {
        print("[EntityExtraction] detectFaces: network error: \(error.localizedDescription)")
        promise.resolve([])
        return
      }

      guard let uiImage = UIImage(data: detectImageData),
            let cgImage = uiImage.cgImage else {
        print("[EntityExtraction] detectFaces: failed to decode image data")
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

    // ── Face embedding extraction via landmark geometry ───────────────────────
    // Returns a 128-float L2-normalised relative-geometry descriptor derived from
    // VNFaceLandmarks2D (76 points). Deterministic — no CoreML model required.
    // Fix 1: async URLSession with 15-second timeout
    // Fix 2: pose-tolerant pairwise-distance descriptor
    AsyncFunction("extractFaceEmbedding") { (imageUri: String, bboxX: Double, bboxY: Double, bboxW: Double, bboxH: Double, promise: Promise) in
      // Fix 1: async URLSession image loading with timeout
      guard let url = URL(string: imageUri) else {
        print("[EntityExtraction] extractFaceEmbedding: invalid URL: \(imageUri)")
        promise.resolve([Float]())
        return
      }

      var config = URLSessionConfiguration.default
      config.timeoutIntervalForRequest = 15
      config.timeoutIntervalForResource = 15
      let session = URLSession(configuration: config)

      let imageData: Data
      do {
        let (data, _) = try await session.data(from: url)
        imageData = data
      } catch {
        print("[EntityExtraction] extractFaceEmbedding: network error: \(error.localizedDescription)")
        promise.resolve([Float]())
        return
      }

      guard let uiImage = UIImage(data: imageData),
            let cgImage = uiImage.cgImage else {
        print("[EntityExtraction] extractFaceEmbedding: failed to decode image data")
        promise.resolve([Float]())
        return
      }

      let request = VNDetectFaceLandmarksRequest { request, error in
        if let error = error {
          print("[EntityExtraction] extractFaceEmbedding: VNDetectFaceLandmarksRequest error: \(error.localizedDescription)")
          promise.resolve([Float]())
          return
        }

        let observations = request.results as? [VNFaceObservation] ?? []
        guard !observations.isEmpty else {
          print("[EntityExtraction] extractFaceEmbedding: no face observations found")
          promise.resolve([Float]())
          return
        }

        // Find the observation whose centroid is closest to the provided bbox centroid.
        // Vision bbox uses bottom-left origin; provided bbox uses top-left origin.
        let providedCentreX = bboxX + bboxW / 2.0
        let providedCentreY_topLeft = bboxY + bboxH / 2.0
        // Convert to Vision bottom-left Y
        let providedCentreY_vision = 1.0 - providedCentreY_topLeft

        var bestObs: VNFaceObservation? = nil
        var bestDist = Double.greatestFiniteMagnitude
        for obs in observations {
          let b = obs.boundingBox
          let cx = Double(b.origin.x) + Double(b.size.width) / 2.0
          let cy = Double(b.origin.y) + Double(b.size.height) / 2.0
          let dist = (cx - providedCentreX) * (cx - providedCentreX) +
                     (cy - providedCentreY_vision) * (cy - providedCentreY_vision)
          if dist < bestDist {
            bestDist = dist
            bestObs = obs
          }
        }

        guard let obs = bestObs,
              let landmarks = obs.landmarks,
              let allPoints = landmarks.allPoints else {
          print("[EntityExtraction] extractFaceEmbedding: no landmarks on best observation")
          promise.resolve([Float]())
          return
        }

        let pointCount = allPoints.pointCount
        guard pointCount > 0 else {
          print("[EntityExtraction] extractFaceEmbedding: zero landmark points")
          promise.resolve([Float]())
          return
        }

        // allPoints gives normalised points relative to the face bounding box,
        // in Vision space (bottom-left origin, 0–1 relative to bbox).
        var rawPoints = [(x: Float, y: Float)]()
        rawPoints.reserveCapacity(pointCount)
        let normalizedPoints = allPoints.normalizedPoints
        for i in 0..<pointCount {
          let p = normalizedPoints[i]
          // Flip Y to top-left origin for consistency
          rawPoints.append((x: Float(p.x), y: Float(1.0 - p.y)))
        }

        // ── Fix 2: Build a pose-tolerant relative-geometry descriptor ─────────
        // Strategy: compute pairwise distances between key landmark group centroids
        // and specific anchor points. These are invariant to translation and scale
        // (since points are already normalised to the face bbox), and more tolerant
        // of small pose changes than raw coordinates.
        //
        // VNFaceLandmarks2D allPoints layout (76 points, 0-indexed):
        //   0–7   : left eyebrow (8 pts)
        //   8–15  : right eyebrow (8 pts)
        //   16–27 : nose (12 pts)
        //   28–47 : left eye (20 pts)
        //   48–67 : right eye (20 pts)
        //   68–75 : outer lips (8 pts)
        //
        // We use a fixed set of 16 anchor points derived from group centroids
        // and specific landmarks, then compute all pairwise distances (120 values)
        // and pad to 128.

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

        func dist(_ a: (x: Float, y: Float), _ b: (x: Float, y: Float)) -> Float {
          let dx = a.x - b.x; let dy = a.y - b.y
          return sqrt(dx*dx + dy*dy)
        }

        // 16 anchor points
        let anchors: [(x: Float, y: Float)] = [
          centroid(Array(0..<8)),    // left eyebrow centre
          centroid(Array(8..<16)),   // right eyebrow centre
          centroid(Array(16..<28)),  // nose centre
          centroid(Array(28..<48)),  // left eye centre
          centroid(Array(48..<68)),  // right eye centre
          centroid(Array(68..<min(76, rawPoints.count))), // mouth centre
          rawPoints.count > 0  ? rawPoints[0]  : (0,0),  // left eyebrow outer
          rawPoints.count > 7  ? rawPoints[7]  : (0,0),  // left eyebrow inner
          rawPoints.count > 8  ? rawPoints[8]  : (0,0),  // right eyebrow inner
          rawPoints.count > 15 ? rawPoints[15] : (0,0),  // right eyebrow outer
          rawPoints.count > 16 ? rawPoints[16] : (0,0),  // nose bridge top
          rawPoints.count > 27 ? rawPoints[27] : (0,0),  // nose tip
          rawPoints.count > 28 ? rawPoints[28] : (0,0),  // left eye outer corner
          rawPoints.count > 47 ? rawPoints[47] : (0,0),  // left eye inner corner
          rawPoints.count > 48 ? rawPoints[48] : (0,0),  // right eye inner corner
          rawPoints.count > 67 ? rawPoints[67] : (0,0),  // right eye outer corner
        ]

        // All pairwise distances: 16*15/2 = 120 values
        var descriptor = [Float]()
        descriptor.reserveCapacity(128)
        for i in 0..<anchors.count {
          for j in (i+1)..<anchors.count {
            descriptor.append(dist(anchors[i], anchors[j]))
          }
        }
        // Pad to 128 with zeros
        while descriptor.count < 128 { descriptor.append(0) }
        // Truncate to 128 if somehow over
        if descriptor.count > 128 { descriptor = Array(descriptor.prefix(128)) }

        // L2-normalise
        var sumSq: Float = 0
        for v in descriptor { sumSq += v * v }
        let norm = sqrt(sumSq)
        if norm > 1e-6 {
          for i in 0..<descriptor.count { descriptor[i] /= norm }
        }

        print("[EntityExtraction] extractFaceEmbedding: returning \(descriptor.count)-float relative-geometry descriptor (pre-norm magnitude: \(norm))")
        promise.resolve(descriptor)
      }

      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        print("[EntityExtraction] extractFaceEmbedding: handler.perform error: \(error.localizedDescription)")
        promise.resolve([Float]())
      }
    }
  }
}
