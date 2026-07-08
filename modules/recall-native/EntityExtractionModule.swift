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

      // Deduplicate: remove keywords that are already captured as people names
      let peopleNormalized = Set(people.map { $0.lowercased() })
      keywords = keywords.filter { !peopleNormalized.contains($0.lowercased()) }

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
