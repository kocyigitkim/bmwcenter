import SwiftUI

struct WatchTripControlView: View {
    @ObservedObject var bridge: WatchConnectivityBridge

    var body: some View {
        VStack(spacing: 16) {
            Text(bridge.isRecording
                 ? String(localized: "trip.recording")
                 : String(localized: "tab.trips"))
                .font(.headline)
            Button {
                bridge.sendStartTrip()
            } label: {
                Label(String(localized: "trip.recording"), systemImage: "play.fill")
            }
            .tint(.green)
            Button {
                bridge.sendStopTrip()
            } label: {
                Label(String(localized: "trip.stop"), systemImage: "stop.fill")
            }
            .tint(.red)
        }
        .padding()
    }
}
