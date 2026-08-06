import Foundation

// Port of src/lib/rank.ts: the slider sets a total-trip-time budget
// (quantile of observed totals); within budget the most walking wins,
// over-budget options follow fastest first. Near-duplicates collapse.
enum Rank {
    static func rank(
        _ itins: [Itinerary], slider: Double, topN: Int = .max, maxTransfers: Int? = nil
    ) -> (list: [Itinerary], budget: Double) {
        var itins = itins
        if let maxTransfers, maxTransfers >= 0 {
            itins = itins.filter { $0.transfers <= maxTransfers }
        }
        if itins.isEmpty { return ([], 0) }
        let s = min(100, max(0, slider)) / 100
        let totals = Array(Set(itins.map(\.totalSeconds))).sorted()
        let pos = s * Double(totals.count - 1)
        let lo = Int(pos.rounded(.down))
        let hi = Int(pos.rounded(.up))
        let budget = totals[lo] + (totals[hi] - totals[lo]) * (pos - Double(lo))
        let scored = itins.map { (it: $0, over: $0.totalSeconds > budget) }
            .sorted { a, b in
                if a.over != b.over { return !a.over }
                if a.over { return a.it.totalSeconds < b.it.totalSeconds }
                if a.it.walkSeconds != b.it.walkSeconds { return a.it.walkSeconds > b.it.walkSeconds }
                return a.it.totalSeconds < b.it.totalSeconds
            }
        var out: [Itinerary] = []
        var seen = Set<String>()
        var seenLines = Set<String>()
        for entry in scored {
            let it = entry.it
            if seen.contains(it.key) { continue }
            let lines = it.transitLegs
                .map { "\($0.routeId):\($0.boardStop)>\($0.alightStop)" }
                .joined(separator: ">")
            let lineSig = "\(lines.isEmpty ? "walk" : lines)#\(Int((it.walkSeconds / 300).rounded()))"
            if seenLines.contains(lineSig) { continue }
            seen.insert(it.key)
            seenLines.insert(lineSig)
            out.append(it)
            if out.count >= topN { break }
        }
        return (out, budget)
    }
}
