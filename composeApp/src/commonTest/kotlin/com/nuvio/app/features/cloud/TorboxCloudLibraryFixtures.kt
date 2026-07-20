package com.nuvio.app.features.cloud

internal val torboxRealMylistPayload = """
        {
            "success": true,
            "error": null,
            "detail": "Torrent list retrieved successfully.",
            "data": [
                {
                    "id": 123456,
                    "auth_id": "user-uuid",
                    "server": 7,
                    "hash": "2c229180e129280a36ba7f3a22e2f5135a02a766",
                    "name": "Show.S01.1080p.WEB-DL",
                    "magnet": "magnet:?xt=urn:btih:2c229180e129280a36ba7f3a22e2f5135a02a766",
                    "size": 4294967296,
                    "active": false,
                    "created_at": "2026-03-08T21:21:28Z",
                    "updated_at": "2026-03-08T21:21:41Z",
                    "download_state": "completed",
                    "seeds": 12,
                    "peers": 3,
                    "ratio": 1.5,
                    "progress": 1,
                    "download_speed": 0,
                    "upload_speed": 0,
                    "eta": 0,
                    "torrent_file": true,
                    "expires_at": "2026-04-07T21:21:41Z",
                    "download_present": true,
                    "files": [
                        {
                            "id": 0,
                            "md5": null,
                            "hash": "2c229180e129280a36ba7f3a22e2f5135a02a766",
                            "name": "Show.S01.1080p.WEB-DL/Show.S01E01.1080p.WEB-DL.mkv",
                            "size": 2147483648,
                            "zipped": false,
                            "s3_path": "buckets/123456/Show.S01E01.1080p.WEB-DL.mkv",
                            "infected": false,
                            "mimetype": "video/x-matroska",
                            "short_name": "Show.S01E01.1080p.WEB-DL.mkv",
                            "absolute_path": "/completed/Show.S01.1080p.WEB-DL/Show.S01E01.1080p.WEB-DL.mkv",
                            "opensubtitles_hash": "abc"
                        },
                        {
                            "id": 1,
                            "md5": null,
                            "hash": "2c229180e129280a36ba7f3a22e2f5135a02a766",
                            "name": "Show.S01.1080p.WEB-DL/sample.txt",
                            "size": 1024,
                            "zipped": false,
                            "s3_path": "buckets/123456/sample.txt",
                            "infected": false,
                            "mimetype": "text/plain",
                            "short_name": "sample.txt",
                            "absolute_path": "/completed/Show.S01.1080p.WEB-DL/sample.txt",
                            "opensubtitles_hash": null
                        }
                    ],
                    "download_path": "123456",
                    "availability": 1,
                    "download_finished": true,
                    "tracker": null,
                    "total_uploaded": 0,
                    "total_downloaded": 4294967296,
                    "cached": true,
                    "owner": "user-uuid",
                    "seed_torrent": false,
                    "allow_zipped": true,
                    "long_term_seeding": false,
                    "tracker_message": null,
                    "cached_at": "2026-04-07T21:21:41Z",
                    "private": false,
                    "alternative_hashes": [],
                    "tags": []
                }
            ]
        }
    """.trimIndent()
