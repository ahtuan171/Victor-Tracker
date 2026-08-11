# Travel Tracker — input draft (not a spec)

Captured verbatim from the owner on 2026-08-11, as raw input for the eventual `spec.md` this
material feeds — the same role `content-calendar.spec.draft.md` played for 001. **This is not a
spec**: it has no clarification pass, no FR/SC numbering, and two of its sections conflict with the
constitution as ratified (see below). Do not build against this file directly; run it through
`/speckit-specify` (or the `new-feature` skill) once the trigger below is met.

## Status

- **2026-08-11**: captured, deliberately not started. `002-pixel-arcade-skin` (the presentation-layer
  re-skin) is mid-iteration — Phase 4 of 7 closed, Phase 5 (theme) through Phase 7 (polish/retro/tag)
  still open. Constitution IV and `.claude/rules/design.md` both treat "a feature riding along inside
  an unrelated branch" as the failure mode this project is structured to avoid, and this draft is
  unambiguously its own iteration, not a 002 task.
- **Trigger to pick this up**: `002-pixel-arcade-skin` reaches T047 (tag + retro) and closes. Then:
  1. Run `/speckit-constitution` to amend 2.0.0 → the next version, explicitly permitting **route
     planning** and **budget/cost tracking** — both currently named exclusions (see below). The owner
     has already decided this amendment should happen (2026-08-11), so the constitution step is a
     formality that records the decision and its reasoning, not a re-litigation.
  2. Run the `new-feature` skill / `/speckit-specify` against this file as input, producing
     `specs/<NNN>-travel-tracker/spec.md` (or whatever the section-16 naming settles on) through the
     project's normal 8-stage workflow — clarify, plan, tasks, the lot. This draft has not been
     through `/speckit-clarify`; expect real ambiguities to surface (e.g. "Location phải lưu cả tọa
     độ" implies a geocoding step this draft never names a provider for).

## The constitutional conflict, stated so the amendment has something concrete to point at

CLAUDE.md's "What this is" section names the failure mode this product's structure exists to avoid:
*"the adjacent travel feature that is always one small step away — **route planning, budgets**, a
public sharing page, and above all automatic location capture from the phone."* Two sections of this
draft ask for exactly the first two named exclusions:

- **§8 ROUTE** — a "SHOW TRIP ROUTE" map option connecting destinations in order, i.e. route planning.
- **§1/§9/§10/§13 Budget and cost fields** — Trip-level budget, per-activity cost, transportation
  cost, accommodation cost, i.e. budget tracking.

Automatic location capture is **not** requested here — every location entry in this draft is a manual
search/input ("Location: [Search location...]"), which is the one exclusion this draft does not
collide with. The owner's 2026-08-11 decision was to amend the constitution to permit route and
budget rather than strip them from the draft — recorded here so `/speckit-constitution` has the
question already answered rather than reopened cold.

## The draft itself, verbatim

```
TRAVEL TRACKER — PRODUCT / INPUT SPEC
=====================================

Mục tiêu:
Xây dựng một Travel Tracker tương tự Spidey Tracker, dùng để:
- Theo dõi những nơi đã từng đi
- Lưu những nơi muốn đi
- Lên kế hoạch cho chuyến đi
- Theo dõi lịch trình qua Calendar
- Theo dõi địa điểm và hành trình qua Map
- Liên kết Map ↔ Calendar ↔ Trip

CORE CONCEPT
------------
MAP = nơi khám phá và theo dõi địa điểm
CALENDAR = nơi lập lịch và theo dõi thời gian
TRIP = nơi gom toàn bộ thông tin của một chuyến đi

Data structure:

TRAVEL TRACKER
│
├── MAP
│   ├── Visited
│   ├── Planned
│   ├── Wishlist
│   └── Currently Traveling
│
├── CALENDAR
│   ├── Trip
│   ├── Destination
│   ├── Activity
│   └── Reservation
│
└── TRIP
    ├── Destinations
    ├── Activities
    ├── Transportation
    ├── Accommodation
    ├── Budget
    └── Notes / Photos


1. CREATE TRIP
--------------
Button:
+ NEW TRIP

Required:
- Trip name
- Start date
- End date
- Status

Optional:
- Cover image
- Description
- Tags
- Budget
- Travel companions
- Notes

Example:

Trip name:
[ Japan Adventure ]

Start date:
[ 15/09/2026 ]

End date:
[ 25/09/2026 ]

Status:
[ Planned ▼ ]

Cover image:
[ + Add image ]

Tags:
[ Food ] [ Culture ] [ Nature ]

Notes:
[ ... ]

[ CREATE TRIP ]


2. TRIP STATUS
--------------
Status flow:

WISHLIST
   ↓
PLANNED
   ↓
BOOKED
   ↓
UPCOMING
   ↓
TRAVELING
   ↓
COMPLETED

Map status:
- Visited = ●
- Planned = ○
- Wishlist = ◇
- Currently traveling = ◎


3. ADD DESTINATION
------------------
Một Trip có thể có nhiều Destination.

Example:

JAPAN TRIP
├── Tokyo
├── Kyoto
├── Osaka
└── Nara

Input:

Destination:
[ Kyoto ]

Location:
[ Search location... ]

Start date:
[ 18/09/2026 ]

End date:
[ 21/09/2026 ]

Status:
[ Planned ]

Category:
[ City ▼ ]

Priority:
[ ★★★☆☆ ]

Notes:
[ ... ]


IMPORTANT:
Location phải lưu cả tọa độ, không chỉ tên.

Example:

name: Kyoto
address: Kyoto, Japan
latitude: 35.0116
longitude: 135.7681


4. DESTINATION CATEGORY
-----------------------
Có thể chọn:

🏙️ City
🏖️ Beach
⛰️ Nature
🏛️ Historical
🍜 Food
🎨 Culture
🛍️ Shopping
☕ Cafe
🎢 Entertainment
🏨 Accommodation
📍 Other

Map có thể filter theo category.


5. ADD ACTIVITY
---------------
Activity là đơn vị quan trọng để Calendar hoạt động.

Example:

KYOTO
├── 09:00 — Fushimi Inari
├── 12:30 — Lunch
├── 14:00 — Kiyomizu-dera
└── 19:00 — Gion walk

Input:

Title:
[ Visit Fushimi Inari ]

Date:
[ 19/09/2026 ]

Start time:
[ 09:00 ]

End time:
[ 11:00 ]

Location:
[ Fushimi Inari ]

Type:
[ Sightseeing ▼ ]

Priority:
[ ★★★☆☆ ]

Notes:
[ ... ]

Optional:
- Cost
- Reservation
- Link
- Photos


6. CALENDAR
-----------
Calendar hiển thị Trip / Destination / Activity.

Example:

SEPTEMBER 2026

14    15    16    17    18    19    20
                         ✈️    🏯    🍜

21    22    23    24    25
🏯    🚄    🍜              ✈️

Click vào ngày:

19 SEPTEMBER

09:00
📍 Fushimi Inari

12:30
🍜 Lunch

14:00
🏯 Kiyomizu-dera

19:00
🌙 Gion


7. MAP
-------
Map có 3 loại marker chính:

VISITED
● Tokyo
● Kyoto
● Da Nang

PLANNED
○ Paris
○ Seoul
○ Bali

WISHLIST
◇ Iceland
◇ Switzerland
◇ New Zealand

Map filters:

[ ALL ]
[ VISITED ]
[ PLANNED ]
[ WISHLIST ]

Có thể filter thêm theo category:

[ CITY ]
[ FOOD ]
[ NATURE ]
[ CULTURE ]


8. ROUTE
--------
Một Trip có thể có route.

Example:

Tokyo
  │
  │ 🚄
  ↓
Kyoto
  │
  │ 🚄
  ↓
Osaka

Map có option:

[ SHOW TRIP ROUTE ]

Khi bật:
- Hiển thị các destination theo thứ tự
- Nối các destination bằng route line
- Hiển thị thứ tự hành trình


9. TRANSPORTATION
-----------------
V2 có thể thêm:

From:
[ Tokyo ]

To:
[ Kyoto ]

Date:
[ 18/09/2026 ]

Time:
[ 08:30 ]

Transport:
[ 🚄 Train ]

Duration:
[ 2h 15m ]

Cost:
[ ¥13,000 ]

Booking:
[ Add reservation ]


10. ACCOMMODATION
-----------------
V2 có thể thêm:

Hotel:
[ Kyoto Hotel ]

Check-in:
[ 18/09 ]

Check-out:
[ 21/09 ]

Address:
[ ... ]

Cost:
[ ¥30,000 ]

Booking reference:
[ ... ]


11. QUICK ADD
-------------
Không bắt user mở form dài mỗi lần.

Khi click một location trên Map:

┌──────────────────────┐
│ 📍 KYOTO             │
│                      │
│ ★★★★★               │
│                      │
│ [ + PLAN ]           │
│ [ + VISITED ]        │
│ [ + WISHLIST ]       │
└──────────────────────┘

Click + PLAN:

When?

○ This trip
○ Future trip
○ No date yet

Nếu chọn This trip:
→ tự động thêm Destination vào Trip hiện tại.


12. MVP — REQUIRED INPUTS
-------------------------
Chỉ cần những field sau để xây phiên bản đầu tiên:

TRIP
├── Name
├── Start date
├── End date
└── Status

DESTINATION
├── Name
├── Location
├── Latitude
├── Longitude
├── Start date
├── End date
└── Status

ACTIVITY
├── Title
├── Date
├── Start time
└── Location

Chỉ với các field này đã có thể xây:

MAP
+
CALENDAR
+
TRIP TIMELINE


13. V2 — OPTIONAL INPUTS
------------------------
DESTINATION
├── Category
├── Priority
├── Notes
└── Photos

ACTIVITY
├── End time
├── Category
├── Cost
├── Priority
├── Notes
└── Reservation

TRIP
├── Cover image
├── Description
├── Tags
└── Budget

Additional:
- Transportation
- Accommodation
- Expenses
- Photos
- Travel companions
- Reviews
- Checklists
- Packing list


14. V3 — ADVANCED
-----------------
- Google Maps integration
- Route optimization
- Weather
- AI itinerary
- Expense tracking
- Statistics
- Travel history
- Photo timeline
- Travel companions
- Packing list
- Reservation management


15. MAIN DASHBOARD
-----------------
Thiết kế tổng thể:

┌──────────────────────────────────────────────┐
│                                              │
│  ✦ TRAVEL // TRACKER             + NEW TRIP │
│                                              │
│  AUGUST 2026                                 │
│  ISSUE #08                                   │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│                    MAP                       │
│                                              │
│        ● Tokyo                               │
│             ╲                                │
│              ╲                               │
│               ● Kyoto                        │
│                    ╲                         │
│                     ● Osaka                  │
│                                              │
│   ● VISITED   ○ PLANNED   ◇ WISHLIST        │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│  📅 CALENDAR                                 │
│                                              │
│  18      19      20      21      22          │
│  🚄      🏯      🍜      🏨      🚄          │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│  CURRENT TRIP                                │
│  🇯🇵 JAPAN — 15 → 25 SEP                    │
│                                              │
│  Tokyo → Kyoto → Osaka                       │
│                                              │
└──────────────────────────────────────────────┘


16. PRODUCT PRINCIPLE
---------------------
MAP:
→ "Where have I been / Where do I want to go?"

CALENDAR:
→ "When am I going?"

TRIP:
→ "What am I doing during this trip?"

DESTINATION:
→ "Where exactly am I going?"

ACTIVITY:
→ "What am I doing at that place?"

Mối liên kết quan trọng:

TRIP
 ↓
DESTINATION
 ↓
ACTIVITY
 ↓
CALENDAR

DESTINATION
 ↓
LATITUDE + LONGITUDE
 ↓
MAP

Vì vậy khi user tạo một Activity/Destination trên Calendar,
nó cũng phải xuất hiện trên Map.

Ngược lại, khi user click một địa điểm trên Map,
có thể thêm nó vào Trip hoặc Calendar.


17. VISUAL DIRECTION
--------------------
Giữ tinh thần Spidey Tracker nhưng chuyển sang Travel.

Concept:
"Spider-Verse inspired travel intelligence dashboard"

Style:
- Black dominant
- Red primary accent
- Off-white typography
- Tiny blue/purple accent
- Comic panels
- Halftone
- Offset layers
- Diagonal elements
- Ink strokes
- Subtle web-like lines
- Micro animations
- Slight glitch
- Modern dashboard

Không copy trực tiếp Spider-Man/Marvel.

Mục tiêu:
"Travel tracker được thiết kế như một comic-tech interface."

Core experience:
MAP = EXPLORE
CALENDAR = PLAN
TRIP = ORGANIZE
DESTINATION = PLACE
ACTIVITY = EXPERIENCE
```

## Things `/speckit-clarify` will need to resolve that this draft leaves open

Noted here so the clarify pass has a head start rather than discovering these cold:

- **§3's "Location phải lưu cả tọa độ"** names no geocoding provider. `002-pixel-arcade-skin`'s own
  `tech-defaults.md` picked MapLibre + a dark raster basemap specifically because it needs no API key;
  forward geocoding (turning a typed search string into lat/long) is a separate service question this
  draft doesn't answer.
- **§14's "Google Maps integration"** is V3/advanced and would need its own review against principle
  II — a third-party request carrying trip data is a bigger disclosure than the tile-viewport-only
  request `tech-defaults.md` already accepted for the basemap.
- **§17's visual direction** duplicates ground `002-pixel-arcade-skin` is already covering (comic
  panels, halftone, offset layers) — once that iteration's token layer and interaction language land,
  this feature should **consume** them (per `.claude/rules/design.md`'s "the token layer may change; a
  feature module may not") rather than re-derive a second comic-tech language of its own.
- **Relationship to `content_item`**: this draft's `Activity` (title, date, start time, location) looks
  close enough to today's `content_item` that the clarify pass should explicitly settle whether this is
  the "retarget the calendar to trips" migration `.claude/memory.md`'s existing Deferred entry already
  describes, or a genuinely separate table. Don't assume either answer.
