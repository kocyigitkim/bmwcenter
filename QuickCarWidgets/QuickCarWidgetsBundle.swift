import WidgetKit
import SwiftUI

@main
struct QuickCarWidgetsBundle: WidgetBundle {
    var body: some Widget {
        FuelLevelWidget()
        LastTripWidget()
        TripLiveActivityWidget()
    }
}
