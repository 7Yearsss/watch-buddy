import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession
import PulselingAPI

public typealias PetView = Components.Schemas.PetView
public typealias DayResponse = Components.Schemas.DayResponse

public enum PulselingServer {
    public static let production = URL(string: "https://api.pulseling.workers.dev")!
}

public enum Starter: String, Codable, Sendable, CaseIterable {
    case grass, water, fire
}

public enum PulselingError: Error, Equatable {
    /// A status the API doesn't document (5xx, proxies).
    case server(status: Int)
    /// A documented refusal (401, 404, 409, 422, 429); the description names it.
    case rejected(String)
}

/// The phone's and the watch's way to the server. Signs up anonymously on first use, keeps the token in `tokens`,
/// and asks for game text in the device's language (decision 6, option B: the server sends finished sentences).
public struct PulselingService: Sendable {
    let client: Client
    let tokens: TokenStore

    public init(serverURL: URL = PulselingServer.production, tokens: TokenStore, languages: [String] = Locale.preferredLanguages) {
        self.tokens = tokens
        self.client = Client(
            serverURL: serverURL,
            transport: URLSessionTransport(),
            middlewares: [Headers(tokens: tokens, acceptLanguage: languages.prefix(3).joined(separator: ","))]
        )
    }

    public var hasAccount: Bool { tokens.load() != nil }

    /// Creates the anonymous account once; later calls do nothing.
    public func signUpIfNeeded() async throws {
        guard tokens.load() == nil else { return }
        switch try await client.createAccount() {
        case .created(let r): tokens.save(try r.body.json.token)
        case .undocumented(let status, _): throw PulselingError.server(status: status)
        case let other: throw PulselingError.rejected("\(other)")
        }
    }

    /// Picks the egg and sends up to 28 days of history (empty if Health access was denied).
    public func hatch(starter: Starter, installDate: String, history: [DailyHealth]) async throws -> PetView {
        let body: Components.Schemas.NewGame = try Self.decode(
            JSONEncoder().encode(NewGameJSON(starter: starter, installDate: installDate, history: history))
        )
        switch try await client.createGame(body: .json(body)) {
        case .created(let r): return try r.body.json
        case .undocumented(let status, _): throw PulselingError.server(status: status)
        case let other: throw PulselingError.rejected("\(other)")
        }
    }

    /// Uploads one finished day. Safe to retry: the server settles each date once.
    public func upload(_ day: DailyHealth) async throws -> DayResponse {
        let health: Components.Schemas.DayHealth = try Self.decode(Self.undated(day))
        switch try await client.uploadDay(body: .json(.init(date: day.date, health: health))) {
        case .ok(let r): return try r.body.json
        case .undocumented(let status, _): throw PulselingError.server(status: status)
        case let other: throw PulselingError.rejected("\(other)")
        }
    }

    /// The current pet, or nil before hatching.
    public func pet() async throws -> PetView? {
        switch try await client.getGame() {
        case .ok(let r): return try r.body.json
        case .notFound: return nil
        case .undocumented(let status, _): throw PulselingError.server(status: status)
        case let other: throw PulselingError.rejected("\(other)")
        }
    }

    // The generated types mirror the server's JSON exactly, so building them from JSON keeps this file independent of
    // the generator's initializer order.
    static func decode<T: Decodable>(_ data: Data) throws -> T {
        try JSONDecoder().decode(T.self, from: data)
    }

    /// The day's JSON without `date`: the server's DayHealth is strict.
    static func undated(_ day: DailyHealth) throws -> Data {
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(day)) as? [String: Any] ?? [:]
        object.removeValue(forKey: "date")
        return try JSONSerialization.data(withJSONObject: object)
    }
}

private struct NewGameJSON: Encodable {
    let starter: Starter
    let installDate: String
    let history: [DailyHealth]
}

/// Adds the token and the language to every request.
struct Headers: ClientMiddleware {
    let tokens: TokenStore
    let acceptLanguage: String

    func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        if !acceptLanguage.isEmpty { request.headerFields[.acceptLanguage] = acceptLanguage }
        if let token = tokens.load() { request.headerFields[.authorization] = "Bearer \(token)" }
        return try await next(request, body, baseURL)
    }
}
