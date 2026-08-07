import Foundation

struct RingBuffer<Element>: Sendable where Element: Sendable {
    private var storage: [Element?]
    private var head = 0
    private(set) var count = 0
    let capacity: Int

    init(capacity: Int) {
        self.capacity = max(1, capacity)
        storage = Array(repeating: nil, count: self.capacity)
    }

    mutating func append(_ element: Element) {
        storage[head] = element
        head = (head + 1) % capacity
        count = min(count + 1, capacity)
    }

    func elements() -> [Element] {
        guard count > 0 else { return [] }
        var result: [Element] = []
        result.reserveCapacity(count)
        let start = (head - count + capacity) % capacity
        for i in 0..<count {
            if let value = storage[(start + i) % capacity] {
                result.append(value)
            }
        }
        return result
    }

    mutating func removeAll() {
        storage = Array(repeating: nil, count: capacity)
        head = 0
        count = 0
    }
}
