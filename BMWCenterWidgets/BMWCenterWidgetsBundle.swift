import WidgetKit
import SwiftUI

@main
struct BMWCenterWidgetsBundle: WidgetBundle {
    var body: some Widget {
        FuelLevelWidget()
        LastTripWidget()
        TripLiveActivityWidget()
    }
}
