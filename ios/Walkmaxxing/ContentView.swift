import SwiftUI

@MainActor
final class SearchModel: ObservableObject {
    @Published var origin: Place?
    @Published var dest: Place?
    @Published var slider: Double = 50
    @Published var itineraries: [Itinerary]?
    @Published var loading = false
    @Published var error: String?
    @Published var delays: [String: Double] = [:]
    @Published var selectedKey: String?

    var ranked: (list: [Itinerary], budget: Double)? {
        guard let itineraries else { return nil }
        return Rank.rank(itineraries, slider: slider)
    }

    func go() async {
        guard let origin, let dest else { return }
        loading = true
        error = nil
        defer { loading = false }
        do {
            let now = TimeUtil.nowInNY()
            itineraries = try await API.route(
                from: origin, to: dest, departTime: now.seconds, dayBit: now.dayBit)
            selectedKey = nil
        } catch {
            self.error = "routing failed — \(error.localizedDescription)"
        }
    }

    func loadDelays() async {
        delays = (try? await API.realtimeDelays()) ?? [:]
    }

    func flip() {
        (origin, dest) = (dest, origin)
    }
}

struct ContentView: View {
    @StateObject private var model = SearchModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header
                    inputs
                    sliderCard
                    results
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarHidden(true)
        }
        .task { await model.loadDelays() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Walk & Subway Routes 🚶🚇")
                .font(.title2.bold())
            Text("walkmaxxing")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var inputs: some View {
        VStack(spacing: 8) {
            ZStack(alignment: .trailing) {
                VStack(spacing: 8) {
                    LocationField(placeholder: "From (e.g. home address)", place: $model.origin)
                    LocationField(placeholder: "To (e.g. office address)", place: $model.dest)
                }
                Button {
                    model.flip()
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                        .font(.footnote.weight(.semibold))
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color(.systemBackground)))
                        .overlay(Circle().strokeBorder(Color(.systemGray4)))
                }
                .buttonStyle(.plain)
                .disabled(model.origin == nil && model.dest == nil)
                .padding(.trailing, 40)
            }
            Button {
                Task { await model.go() }
            } label: {
                Group {
                    if model.loading {
                        ProgressView().tint(.white)
                    } else {
                        Text("Go").fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .tint(.black)
            .disabled(model.origin == nil || model.dest == nil || model.loading)
        }
        .onChange(of: model.origin) { _, _ in Task { await model.go() } }
        .onChange(of: model.dest) { _, _ in Task { await model.go() } }
    }

    private var sliderCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("🚇 fewest steps")
                Spacer()
                Text("walkmaxx 🚶")
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
            Slider(value: $model.slider, in: 0...100, step: 1)
                .tint(.green)
            Text("Slide right to allow a longer trip — the most walking within that time shows first.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemBackground)))
    }

    @ViewBuilder
    private var results: some View {
        if model.loading {
            Text("crunching subway + bus schedules… first search can take a few seconds")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
        }
        if let error = model.error {
            Text(error)
                .font(.footnote)
                .foregroundStyle(.red)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10).fill(Color.red.opacity(0.08)))
        }
        if let ranked = model.ranked {
            if ranked.list.isEmpty {
                Text("No routes found — try different points.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(Array(ranked.list.prefix(20).enumerated()), id: \.element.key) { i, it in
                    ItineraryCardView(
                        it: it,
                        rank: i + 1,
                        selected: model.selectedKey == it.key,
                        delays: model.delays
                    )
                    .onTapGesture {
                        withAnimation(.snappy) {
                            model.selectedKey = model.selectedKey == it.key ? nil : it.key
                        }
                    }
                }
            }
        } else if !model.loading {
            Text("Enter two NYC locations to see your options.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.top, 16)
        }
    }
}

#Preview {
    ContentView()
}
