import SwiftUI

struct LocationField: View {
    let placeholder: String
    @Binding var place: Place?

    @State private var text = ""
    @State private var suggestions: [Place] = []
    @State private var editing = false
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 0) {
            TextField(placeholder, text: $text, onEditingChanged: { editing = $0 })
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(.systemBackground))
                        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color(.systemGray4)))
                )
                .onChange(of: text) { _, newValue in
                    guard editing, newValue != place?.label else { return }
                    searchTask?.cancel()
                    guard newValue.count >= 3 else {
                        suggestions = []
                        return
                    }
                    searchTask = Task {
                        try? await Task.sleep(for: .milliseconds(250))
                        guard !Task.isCancelled else { return }
                        let results = (try? await API.geocode(newValue)) ?? []
                        guard !Task.isCancelled else { return }
                        suggestions = results
                    }
                }

            if editing || (!suggestions.isEmpty && place?.label != text) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(suggestions) { s in
                        Button {
                            place = s
                            text = s.label
                            suggestions = []
                            hideKeyboard()
                        } label: {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(s.label).font(.footnote).foregroundStyle(.primary)
                                if let sub = s.sublabel {
                                    Text(sub).font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                        }
                        .buttonStyle(.plain)
                        if s.id != suggestions.last?.id { Divider() }
                    }
                }
                .background(RoundedRectangle(cornerRadius: 10).fill(Color(.systemBackground)))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color(.systemGray5)))
                .padding(.top, 4)
            }
        }
        .onChange(of: place) { _, newValue in
            if let newValue { text = newValue.label }
        }
    }

    private func hideKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}
