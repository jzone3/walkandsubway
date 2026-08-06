import Foundation

// All times are seconds since midnight, America/New_York.
enum TimeUtil {
    static let nyTimeZone = TimeZone(identifier: "America/New_York")!

    static func nowInNY() -> (seconds: Int, dayBit: Int) {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = nyTimeZone
        let now = Date()
        let c = cal.dateComponents([.hour, .minute, .weekday], from: now)
        let seconds = (c.hour ?? 0) * 3600 + (c.minute ?? 0) * 60
        // weekday: 1 = Sunday; dayBit: 0 = Monday
        let dayBit = ((c.weekday ?? 1) + 5) % 7
        return (seconds, dayBit)
    }

    static func clock(_ seconds: Double) -> String {
        let s = (Int(seconds) % 86400 + 86400) % 86400
        var h = s / 3600
        let m = (s % 3600) / 60
        let ampm = h >= 12 ? "PM" : "AM"
        h = h % 12
        if h == 0 { h = 12 }
        return String(format: "%d:%02d %@", h, m, ampm)
    }

    static func duration(_ seconds: Double) -> String {
        let m = Int((seconds / 60).rounded())
        if m < 60 { return "\(m) min" }
        return "\(m / 60)h \(m % 60)m"
    }
}
