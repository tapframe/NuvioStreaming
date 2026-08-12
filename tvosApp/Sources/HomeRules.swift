import Foundation

struct HomeReleaseFilter {
    static func releasedItems(
        _ items: [MetaSummary],
        enabled: Bool,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [MetaSummary] {
        guard enabled else { return items }
        let currentYear = calendar.component(.year, from: now)
        return items.filter { item in
            if let released = item.released,
               let date = parseDate(released), date > now { return false }
            guard let releaseInfo = item.releaseInfo,
                  let year = firstYear(in: releaseInfo) else { return true }
            return year <= currentYear
        }
    }

    private static func parseDate(_ value: String) -> Date? {
        let formats = ["yyyy-MM-dd'T'HH:mm:ss.SSSXXXXX", "yyyy-MM-dd'T'HH:mm:ssXXXXX", "yyyy-MM-dd"]
        for format in formats {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = format
            if let result = formatter.date(from: value) { return result }
        }
        return nil
    }

    private static func firstYear(in value: String) -> Int? {
        let digits = Array(value)
        guard digits.count >= 4 else { return nil }
        for index in 0...(digits.count - 4) {
            let candidate = String(digits[index..<(index + 4)])
            if let year = Int(candidate), (1900...2100).contains(year) { return year }
        }
        return nil
    }
}

struct HomeUpcomingResolver {
    static func nextEpisode(after record: WatchProgressRecord, videos: [StremioVideo]) -> StremioVideo? {
        guard let season = record.season, let episode = record.episode else { return nil }
        return videos
            .filter { ($0.season ?? -1) > 0 && $0.episode != nil }
            .sorted {
                let left = ($0.season ?? 0, $0.episode ?? 0)
                let right = ($1.season ?? 0, $1.episode ?? 0)
                return left.0 == right.0 ? left.1 < right.1 : left.0 < right.0
            }
            .first { video in
                guard let candidateSeason = video.season, let candidateEpisode = video.episode else { return false }
                return candidateSeason > season || (candidateSeason == season && candidateEpisode > episode)
            }
    }
}
