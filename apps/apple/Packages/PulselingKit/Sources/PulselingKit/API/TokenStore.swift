import Foundation

/// Where the anonymous account's bearer token lives. The Keychain doesn't sync between iPhone and Watch, so the phone
/// hands the token to the watch over WatchConnectivity at first pairing (docs/design/11, 数据流).
public protocol TokenStore: Sendable {
    func load() -> String?
    func save(_ token: String)
    func clear()
}

/// For tests and previews.
public final class MemoryTokenStore: TokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var token: String?

    public init(_ token: String? = nil) {
        self.token = token
    }

    public func load() -> String? { lock.withLock { token } }
    public func save(_ token: String) { lock.withLock { self.token = token } }
    public func clear() { lock.withLock { token = nil } }
}

#if canImport(Security)
import Security

/// The token in this device's Keychain, readable after first unlock so background wake-ups can upload.
public struct KeychainTokenStore: TokenStore {
    let service: String
    let account = "token"

    public init(service: String = "pulseling.api") {
        self.service = service
    }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    public func load() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public func save(_ token: String) {
        clear()
        var q = query
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    public func clear() {
        SecItemDelete(query as CFDictionary)
    }
}
#endif
