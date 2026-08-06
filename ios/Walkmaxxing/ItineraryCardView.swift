import SwiftUI

struct RouteBullet: View {
    let name: String
    let colorHex: String

    var body: some View {
        Text(name)
            .font(.caption.bold())
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .frame(minWidth: 24, minHeight: 24)
            .background(Circle().fill(Color(hex: colorHex)))
    }
}

struct ItineraryCardView: View {
    let it: Itinerary
    let rank: Int
    let selected: Bool
    let delays: [String: Double]

    private var walkPct: Int {
        Int((it.walkSeconds / max(1, it.totalSeconds) * 100).rounded())
    }
    private var maxDelay: Double {
        it.transitLegs.map { delays[$0.routeId] ?? 0 }.max() ?? 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .bottom) {
                stat(value: TimeUtil.duration(it.totalSeconds), label: "total")
                stat(value: "🚶\(Int((it.walkSeconds / 60).rounded())) min", label: "walk")
                stat(value: "🚇\(Int((it.rideSeconds / 60).rounded())) min", label: "ride")
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("\(TimeUtil.clock(it.departTime)) → \(TimeUtil.clock(it.arriveTime))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("#\(rank)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            HStack(spacing: 6) {
                ForEach(Array(it.legs.enumerated()), id: \.offset) { _, leg in
                    switch leg {
                    case .transit(let l):
                        RouteBullet(name: l.routeName, colorHex: l.routeColor)
                    case .walk(let l) where l.seconds >= 120:
                        Text("🚶\(Int((l.seconds / 60).rounded()))min")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    default:
                        EmptyView()
                    }
                }
            }

            HStack(spacing: 6) {
                Text("\(it.transfers) transfer\(it.transfers == 1 ? "" : "s")")
                Text("·").foregroundStyle(.tertiary)
                Text("\(walkPct)% walking")
                if maxDelay > 90 {
                    Text("⚠ +\(Int((maxDelay / 60).rounded())) min delays")
                        .foregroundStyle(.orange)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if selected {
                Divider()
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(it.legs.enumerated()), id: \.offset) { _, leg in
                        switch leg {
                        case .walk(let l):
                            Text("🚶 Walk \(TimeUtil.duration(l.seconds)) (\(String(format: "%.1f", l.meters / 1609)) mi) — \(l.from) → \(l.to)")
                                .font(.caption)
                        case .transit(let l):
                            HStack(alignment: .top, spacing: 6) {
                                RouteBullet(name: l.routeName, colorHex: l.routeColor)
                                Text("\(l.boardStop) → \(l.alightStop) · \(TimeUtil.clock(l.boardTime))–\(TimeUtil.clock(l.alightTime)) · \(l.stops.count - 1) stops")
                                    .font(.caption)
                            }
                        }
                    }
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(selected ? Color.primary : Color(.systemGray5))
                )
        )
        .contentShape(Rectangle())
    }

    private func stat(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.headline)
            Text(label.uppercased()).font(.caption2).foregroundStyle(.tertiary)
        }
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.isEmpty ? "555555" : hex
        var value: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
