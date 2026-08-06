import Foundation

struct Place: Identifiable, Hashable, Codable {
    var id: String { "\(label)|\(lat)|\(lon)" }
    let label: String
    var sublabel: String?
    let lat: Double
    let lon: Double
}

struct GeocodeResponse: Codable {
    let results: [Place]
}

struct WalkLeg: Codable, Hashable {
    let from: String
    let fromLat: Double
    let fromLon: Double
    let to: String
    let toLat: Double
    let toLon: Double
    let seconds: Double
    let meters: Double
}

struct TransitStop: Codable, Hashable {
    let name: String
    let lat: Double
    let lon: Double
    let arr: Double
    let dep: Double
}

struct TransitLeg: Codable, Hashable {
    let routeId: String
    let routeName: String
    let routeColor: String
    let routeType: Int
    let headsign: String
    let boardStop: String
    let alightStop: String
    let boardTime: Double
    let alightTime: Double
    let stops: [TransitStop]
    let headwaySecs: Double?
    let delaySeconds: Double?
}

enum Leg: Codable, Hashable {
    case walk(WalkLeg)
    case transit(TransitLeg)

    private enum CodingKeys: String, CodingKey { case kind }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "walk": self = .walk(try WalkLeg(from: decoder))
        case "transit": self = .transit(try TransitLeg(from: decoder))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .kind, in: c, debugDescription: "unknown leg kind \(kind)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .walk(let l):
            try c.encode("walk", forKey: .kind)
            try l.encode(to: encoder)
        case .transit(let l):
            try c.encode("transit", forKey: .kind)
            try l.encode(to: encoder)
        }
    }
}

struct Itinerary: Codable, Hashable, Identifiable {
    var id: String { key }
    let departTime: Double
    let arriveTime: Double
    let totalSeconds: Double
    let walkSeconds: Double
    let waitSeconds: Double
    let rideSeconds: Double
    let transfers: Int
    let legs: [Leg]
    let key: String

    var transitLegs: [TransitLeg] {
        legs.compactMap { if case .transit(let l) = $0 { return l } else { return nil } }
    }
}

struct RouteResponse: Codable {
    let itineraries: [Itinerary]
    let computeMs: Double?
}

struct RTResponse: Codable {
    let routeDelays: [String: Double]
}
