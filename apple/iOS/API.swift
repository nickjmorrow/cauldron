import Foundation

/// A change to send to the server. Codable so unsent ones can wait in UserDefaults.
struct Write: Codable, Hashable {
    var method: String
    var path: String
    var body: Data?

    static func patch(_ id: Int, _ fields: [String: Any]) -> Write {
        Write(method: "PATCH", path: "/api/shopping/\(id)", body: try? JSONSerialization.data(withJSONObject: fields))
    }
    static func delete(_ id: Int) -> Write { Write(method: "DELETE", path: "/api/shopping/\(id)") }
    static func add(name: String, aisle: String, later: Bool) -> Write {
        Write(method: "POST", path: "/api/shopping",
              body: try? JSONSerialization.data(withJSONObject: ["name": name, "aisle": aisle, "later": later]))
    }
    static let clearDone = Write(method: "POST", path: "/api/shopping/clear")
}

/// The server answered, but refused the request (4xx/5xx). Retrying the same request won't help.
struct Refused: Error {
    var status: Int
    var message: String
}

struct API {
    var base: URL

    func list() async throws -> ShoppingList {
        let data = try await call(Write(method: "GET", path: "/api/shopping"))
        return try JSONDecoder().decode(ShoppingList.self, from: data)
    }

    @discardableResult
    func call(_ write: Write) async throws -> Data {
        guard let url = URL(string: write.path, relativeTo: base) else { throw URLError(.badURL) }
        var request = URLRequest(url: url, timeoutInterval: 8)
        request.httpMethod = write.method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let body = write.body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "HTTP \(status)"
            throw Refused(status: status, message: message)
        }
        return data
    }
}
