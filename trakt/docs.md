Scrobble / Start / Start watching in a media center POSThttps://api.trakt.tv/scrobble/startRequestStart watching a movie by sending a standard movie object.
HEADERS
Content-Type:application/json
Authorization:Bearer [access_token]
trakt-api-version:2
trakt-api-key:[client_id]
BODY
{
  "movie": {
    "title": "Guardians of the Galaxy",
    "year": 2014,
    "ids": {
      "trakt": 28,
      "slug": "guardians-of-the-galaxy-2014",
      "imdb": "tt2015381",
      "tmdb": 118340
    }
  },
  "progress": 1.25
}
Response
201
HEADERS
Content-Type:application/json
BODY
{
  "id": 0,
  "action": "start",
  "progress": 1.25,
  "sharing": {
    "twitter": true,
    "mastodon": true,
    "tumblr": false
  },
  "movie": {
    "title": "Guardians of the Galaxy",
    "year": 2014,
    "ids": {
      "trakt": 28,
      "slug": "guardians-of-the-galaxy-2014",
      "imdb": "tt2015381",
      "tmdb": 118340
    }
  }
}
RequestStart watching an episode by sending a standard episode object.
HEADERS
Content-Type:application/json
Authorization:Bearer [access_token]
trakt-api-version:2
trakt-api-key:[client_id]
BODY
{
  "episode": {
    "ids": {
      "trakt": 16
    }
  },
  "progress": 10
}
Response
201
HEADERS
Content-Type:application/json
BODY
{
  "id": 0,
  "action": "start",
  "progress": 10,
  "sharing": {
    "twitter": true,
    "mastodon": true,
    "tumblr": false
  },
  "episode": {
    "season": 1,
    "number": 1,
    "title": "Pilot",
    "ids": {
      "trakt": 16,
      "tvdb": 349232,
      "imdb": "tt0959621",
      "tmdb": 62085
    }
  },
  "show": {
    "title": "Breaking Bad",
    "year": 2008,
    "ids": {
      "trakt": 1,
      "slug": "breaking-bad",
      "tvdb": 81189,
      "imdb": "tt0903747",
      "tmdb": 1396
    }
  }
}
RequestStart watching an episode if you don't have episode ids, but have show info. Send show and episode objects.
HEADERS
Content-Type:application/json
Authorization:Bearer [access_token]
trakt-api-version:2
trakt-api-key:[client_id]
BODY
{
  "show": {
    "title": "Breaking Bad",
    "year": 2008,
    "ids": {
      "trakt": 1,
      "tvdb": 81189
    }
  },
  "episode": {
    "season": 1,
    "number": 1
  },
  "progress": 10
}
Response
201
HEADERS
Content-Type:application/json
BODY
{
  "id": 0,
  "action": "start",
  "progress": 10,
  "sharing": {
    "twitter": true,
    "mastodon": true,
    "tumblr": false
  },
  "episode": {
    "season": 1,
    "number": 1,
    "title": "Pilot",
    "ids": {
      "trakt": 16,
      "tvdb": 349232,
      "imdb": "tt0959621",
      "tmdb": 62085
    }
  },
  "show": {
    "title": "Breaking Bad",
    "year": 2008,
    "ids": {
      "trakt": 1,
      "slug": "breaking-bad",
      "tvdb": 81189,
      "imdb": "tt0903747",
      "tmdb": 1396
    }
  }
}
RequestStart watching an episode using absolute numbering (useful for Anime and Donghua). Send show and episode objects.
HEADERS
Content-Type:application/json
Authorization:Bearer [access_token]
trakt-api-version:2
trakt-api-key:[client_id]
BODY
{
  "show": {
    "title": "One Piece",
    "year": 1999,
    "ids": {
      "trakt": 37696
    }
  },
  "episode": {
    "number_abs": 164
  },
  "sharing": {
    "twitter": true,
    "mastodon": true,
    "tumblr": false
  },
  "progress": 10
}
Response
201
HEADERS
Content-Type:application/json
BODY
{
  "id": 0,
  "action": "start",
  "progress": 10,
  "sharing": {
    "twitter": true,
    "mastodon": true,
    "tumblr": false
  },
  "episode": {
    "season": 9,
    "number": 21,
    "title": "Light the Fire of Shandia! Wiper the Warrior",
    "ids": {
      "trakt": 856373,
      "tvdb": 362082,
      "imdb": null,
      "tmdb": null
    }
  },
  "show": {
    "title": "One Piece",
    "year": 1999,
    "ids": {
      "trakt": 37696,
      "slug": "one-piece",
      "tvdb": 81797,
      "imdb": "tt0388629",
      "tmdb": 37854
    }
  }
}


Scrobble / Pause / Pause watching in a media center POSThttps://api.trakt.tv/scrobble/pauseRequest
HEADERS
Content-Type:application/json
Authorization:Bearer [access_token]
trakt-api-version:2
trakt-api-key:[client_id]
BODY
{
  "movie": {
    "title": "Guardians of the Galaxy",
    "year": 2014,
    "ids": {
      "trakt": 28,
      "slug": "guardians-of-the-galaxy-2014",
      "imdb": "tt2015381",
      "tmdb": 118340
    }
  },
  "progress": 75
}
Response
201
HEADERS
Content-Type:application/json
BODY
{
  "id": 1337,
  "action": "pause",
  "progress": 75,
  "sharing": {
    "twitter": false,
    "mastodon": false,
    "tumblr": false
  },
  "movie": {
    "title": "Guardians of the Galaxy",
    "year": 2014,
    "ids": {
      "trakt": 28,
      "slug": "guardians-of-the-galaxy-2014",
      "imdb": "tt2015381",
      "tmdb": 118340
    }
  }
}

BODY
{
  "id": 3373536622,
  "action": "scrobble",
  "progress": 99.9,
  "sharing": {
    "twitter": true,
    "mastodon": true,
    "tumblr": false
  },
  "movie": {
    "title": "Guardians of the Galaxy",
    "year": 2014,
    "ids": {
      "trakt": 28,
      "slug": "guardians-of-the-galaxy-2014",
      "imdb": "tt2015381",
      "tmdb": 118340
    }
  }
}
RequestScrobble an episode by sending a standard episode object.
HEADERS
Content-Type:application/json
Authorization:Bearer [access_token]
trakt-api-version:2
trakt-api-key:[client_id]
BODY
{
  "episode": {
    "ids": {
      "trakt": 16
    }
  },
  "progress": 85
}
Response
201
HEADERS
Content-Type:application/json
BODY
{
  "id": 3373536623,
  "action": "scrobble",
  "progress": 85,
  "sharing": {
    "twitter": true,
    "mastodon": true,
    "tumblr": false
  },
  "episode": {
    "season": 1,
    "number": 1,
    "title": "Pilot",
    "ids": {
      "trakt": 16,
      "tvdb": 349232,
      "imdb": "tt0959621",
      "tmdb": 62085
    }
  },
  "show": {
    "title": "Breaking Bad",
    "year": 2008,
    "ids": {
      "trakt": 1,
      "slug": "breaking-bad",
      "tvdb": 81189,
      "imdb": "tt0903747",
      "tmdb": 1396
    }
  }
}
RequestScrobble an episode if you don't have episode ids, but have show info. Send show and episode objects.
HEADERS
Content-Type:application/json
Authorization:Bearer [access_token]
trakt-api-version:2
trakt-api-key:[client_id]
BODY
{
  "show": {
    "title": "Breaking Bad",
    "year": 2008,
    "ids": {
      "trakt": 1,
      "tvdb": 81189
    }
  },
  "episode": {
    "season": 1,
    "number": 1
  },
  "progress": 85
}
Response
201
HEADERS
Content-Type:application/json
BODY
{
  "id": 3373536623,
  "action": "scrobble",
  "progress": 85,
  "sharing": {
    "twitter": true,
    "mastodon": true,
    "tumblr": false
  },
  "episode": {
    "season": 1,
    "number": 1,
    "title": "Pilot",
    "ids": {
      "trakt": 16,
      "tvdb": 349232,
      "imdb": "tt0959621",
      "tmdb": 62085
    }
  },
  "show": {
    "title": "Breaking Bad",
    "year": 2008,
    "ids": {
      "trakt": 1,
      "slug": "breaking-bad",
      "tvdb": 81189,
      "imdb": "tt0903747",
      "tmdb": 1396
    }
  }
}
RequestScrobble an episode using absolute numbering (useful for Anime and Donghua). Send show and episode objects.
HEADERS
Content-Type:application/json
Authorization:Bearer [access_token]
trakt-api-version:2
trakt-api-key:[client_id]
BODY
{
  "show": {
    "title": "One Piece",
    "year": 1999,
    "ids": {
      "trakt": 37696
    }
  },
  "episode": {
    "number_abs": 164
  },
  "sharing": {
    "twitter": true,
    "mastodon": true,
    "tumblr": false
  },
  "progress": 90
}
Response
201
HEADERS
Content-Type:application/json
BODY
{
  "id": 3373536624,
  "action": "scrobble",
  "progress": 90,
  "sharing": {
    "twitter": true,
    "mastodon": true,
    "tumblr": false
  },
  "episode": {
    "season": 9,
    "number": 21,
    "title": "Light the Fire of Shandia! Wiper the Warrior",
    "ids": {
      "trakt": 856373,
      "tvdb": 362082,
      "imdb": null,
      "tmdb": null
    }
  },
  "show": {
    "title": "One Piece",
    "year": 1999,
    "ids": {
      "trakt": 37696,
      "slug": "one-piece",
      "tvdb": 81797,
      "imdb": "tt0388629",
      "tmdb": 37854
    }
  }
}
RequestIf the progress is < 80%, the video will be treated a a pause and the playback position will be saved.
HEADERS
Content-Type:application/json
Authorization:Bearer [access_token]
trakt-api-version:2
trakt-api-key:[client_id]
BODY
{
  "movie": {
    "title": "Guardians of the Galaxy",
    "year": 2014,
    "ids": {
      "trakt": 28,
      "slug": "guardians-of-the-galaxy-2014",
      "imdb": "tt2015381",
      "tmdb": 118340
    }
  },
  "progress": 75
}
Response
201
HEADERS
Content-Type:application/json
BODY
{
  "id": 1337,
  "action": "pause",
  "progress": 75,
  "sharing": {
    "twitter": false,
    "mastodon": true,
    "tumblr": false
  },
  "movie": {
    "title": "Guardians of the Galaxy",
    "year": 2014,
    "ids": {
      "trakt": 28,
      "slug": "guardians-of-the-galaxy-2014",
      "imdb": "tt2015381",
      "tmdb": 118340
    }
  }
}
ResponseThe same item was recently scrobbled.
409
HEADERS
Content-Type:application/json
BODY
{
  "watched_at": "2014-10-15T22:21:29.000Z",
  "expires_at": "2014-10-15T23:21:29.000Z"
}