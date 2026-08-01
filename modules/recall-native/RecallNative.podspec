require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'RecallNative'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = { 'Recall' => 'recall@recall.app' }
  s.homepage       = 'https://github.com/recall/recall'
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.source_files   = '*.swift'
  s.exclude_files = ['SearchRecallIntent.swift', 'RecallShortcuts.swift', 'RecallShortcutsHelper.swift', 'CreateRecallIntent.swift']
  s.frameworks     = 'NaturalLanguage', 'Vision'
  s.weak_frameworks = 'FoundationModels'
  s.dependency 'ExpoModulesCore'
end
