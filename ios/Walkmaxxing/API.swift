import Foundation

enum API {
    static let base = URL(string: "https://walkandsubway.com")!

    static func geocode(_ query: String) async throws -> [Place] {
        var comps = URLComponents(url: base.appending(path: "/api/geocode"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "q", value: query)]
        let (data, _) = try await URLSession.shared.data(from: comps.url!)
        return try JSONDecoder().decode(GeocodeResponse.self, from: data).results
    }

    static func route(from: Place, to: Place, departTime: Int, dayBit: Int) async throws -> [Itinerary] {
        var req = URLRequest(url: base.appending(path: "/api/route"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 60
        let body: [String: Double] = [
            "fromLat": from.lat, "fromLon": from.lon,
            "toLat": to.lat, "toLon": to.lon,
            "departTime": Double(departTime), "dayBit": Double(dayBit),
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(RouteResponse.self, from: data).itineraries
    }

    static func realtimeDelays() async throws -> [String: Double] {
        let (data, _) = try await URLSession.shared.data(from: base.appending(path: "/api/rt"))
        return try JSONDecoder().decode(RTResponse.self, from: data).routeDelays
    }
}
