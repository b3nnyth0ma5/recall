import ExpoModulesCore
import NaturalLanguage
import Foundation

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
  }
}
