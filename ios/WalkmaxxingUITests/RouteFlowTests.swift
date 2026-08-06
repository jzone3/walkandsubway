import XCTest

final class RouteFlowTests: XCTestCase {
    func testSearchShowsItineraries() throws {
        let app = XCUIApplication()
        app.launch()

        let from = app.textFields["From (e.g. home address)"]
        XCTAssertTrue(from.waitForExistence(timeout: 10))
        from.tap()
        from.typeText("Union Square")

        let firstSuggestion = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] 'Union Square'")
        ).firstMatch
        XCTAssertTrue(firstSuggestion.waitForExistence(timeout: 15))
        firstSuggestion.tap()

        let to = app.textFields["To (e.g. office address)"]
        to.tap()
        to.typeText("Grand Central")
        let toSuggestion = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] 'Grand Central'")
        ).firstMatch
        XCTAssertTrue(toSuggestion.waitForExistence(timeout: 15))
        toSuggestion.tap()

        // routing kicks off automatically once both endpoints are set
        let transferLabel = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS 'transfer'")
        ).firstMatch
        XCTAssertTrue(transferLabel.waitForExistence(timeout: 60))

        let shot = XCUIScreen.main.screenshot()
        let att = XCTAttachment(screenshot: shot)
        att.lifetime = .keepAlways
        add(att)

        // slider re-ranks without a new network call
        let slider = app.sliders.firstMatch
        XCTAssertTrue(slider.exists)
        slider.adjust(toNormalizedSliderPosition: 1.0)
        XCTAssertTrue(transferLabel.waitForExistence(timeout: 5))

        let shot2 = XCUIScreen.main.screenshot()
        let att2 = XCTAttachment(screenshot: shot2)
        att2.lifetime = .keepAlways
        add(att2)
    }
}
