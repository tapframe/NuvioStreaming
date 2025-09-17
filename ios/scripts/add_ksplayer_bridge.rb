require 'xcodeproj'
require 'fileutils'

project_path = File.expand_path('../Nuvio.xcodeproj', __dir__)
project = Xcodeproj::Project.open(project_path)

app_dir = File.expand_path('..', __dir__)

target_name = 'Nuvio'
bridge_files = [
  File.expand_path('Nuvio/KSPlayerView.swift', app_dir),
  File.expand_path('Nuvio/KSPlayerViewManager.swift', app_dir),
  File.expand_path('Nuvio/KSPlayerManager.m', app_dir),
  File.expand_path('Nuvio/KSPlayerModule.swift', app_dir),
]

missing = bridge_files.reject { |p| File.exist?(p) }
if missing.any?
  abort "Missing files: \n#{missing.join("\n")}"
end

target = project.targets.find { |t| t.name == target_name }
abort "Target '#{target_name}' not found" unless target

# Ensure group exists at the correct relative path
root_group = project.main_group
app_group = root_group['Nuvio'] || root_group.new_group('Nuvio', 'Nuvio')

added_files = []
bridge_files.each do |file_path|
  relative_path = Pathname.new(file_path).relative_path_from(Pathname.new(project_path).dirname).to_s
  ref = project.files.find { |f| f.path == relative_path }
  unless ref
    ref = app_group.new_file(relative_path)
    added_files << relative_path
  end
  unless target.source_build_phase.files_references.include?(ref)
    target.add_file_references([ref])
  end
end

project.save
puts "Ensured bridge files are added to target '#{target_name}':\n - #{(added_files.empty? ? '(no new files)' : added_files.join("\n - "))}"
