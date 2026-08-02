"""UUIDv7 generation.

Time-sortable primary keys: rows inserted together land together in the index,
which keeps the `(user_id, date DESC)` reads that dominate this app on warm
pages. `uuid.uuid7` only arrives in Python 3.14, so it is implemented here
rather than pulling in a dependency for 20 lines.

Layout per RFC 9562:
    48 bits  unix timestamp in milliseconds
     4 bits  version (7)
    12 bits  random
     2 bits  variant (0b10)
    62 bits  random
"""

import os
import time
from uuid import UUID


def uuid7() -> UUID:
    timestamp_ms = int(time.time() * 1000)
    rand = int.from_bytes(os.urandom(10), "big")

    # 74 random bits total; take them from the top of the 80 we drew.
    rand_a = (rand >> 62) & 0xFFF
    rand_b = rand & 0x3FFFFFFFFFFFFFFF

    value = (timestamp_ms & 0xFFFFFFFFFFFF) << 80
    value |= 0x7 << 76
    value |= rand_a << 64
    value |= 0b10 << 62
    value |= rand_b

    return UUID(int=value)
