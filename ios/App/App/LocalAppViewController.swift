import Foundation
import Capacitor

/// Next's static export has a separate HTML file per route. Capacitor's default
/// SPA router always returns index.html for extensionless paths, including /watch.
final class LocalAppViewController: CAPBridgeViewController {
    override func router() -> Router {
        return BundledPagesRouter()
    }
}

private struct BundledPagesRouter: Router {
    var basePath: String = ""

    func route(for path: String) -> String {
        let root = URL(fileURLWithPath: basePath, isDirectory: true).standardizedFileURL
        let relative = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let requested = root.appendingPathComponent(relative).standardizedFileURL
        let fallback = root.appendingPathComponent("index.html").path
        guard requested.path == root.path || requested.path.hasPrefix(root.path + "/") else {
            return fallback
        }
        if requested.pathExtension.isEmpty {
            for candidate in [requested.appendingPathExtension("html"), requested.appendingPathComponent("index.html")] {
                if FileManager.default.fileExists(atPath: candidate.path) { return candidate.path }
            }
            return fallback
        }
        return requested.path
    }
}
