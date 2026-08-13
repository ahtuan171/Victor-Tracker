# REDESIGN DIRECTION — SPIDEY TRACKER

**Received from the owner 2026-08-11, verbatim.** The first pass against this brief (2026-08-11b,
`tasks.md`) only had a distilled summary to work from — this file is the full text, so a future
session never has to re-derive it from a summary again. See `tasks.md`'s "comic-tech" entries for
what has actually landed and what is still open, and `.claude/rules/design.md` for the constitutional
constraint this all sits inside: a token-layer redesign is only permitted in the iteration whose
entire subject is the redesign (`002-pixel-arcade-skin`), so everything below is scoped to this
iteration's Phase 7, not a future feature module.

**Non-negotiable, from the brief's own section 13, and already the reason two of its literal
suggestions were not built as written**: this is a *Spider-Verse-inspired* productivity tracker, not
a Spider-Man fan site. Nothing here may copy the Marvel/Spider-Man IP directly — logo, character,
web-covered backgrounds, Marvel branding, New York setting. "SPIDEY TRACKER" as literal branding text
was flagged and deferred for exactly this reason (it names the product after the IP, which is the one
thing section 13 rules out); a non-infringing name that keeps the comic-book personality is still
owed.

---

Mục tiêu:
Giữ nguyên cấu trúc UX/dashboard hiện tại nhưng redesign visual theo phong cách:
"Spider-Verse Comic-Tech / Spidey Tracker"

Cảm giác tổng thể:
- Modern, aesthetic, cool, slightly animated
- Comic book + Spider-Verse inspiration
- Không biến thành fan website Spider-Man
- Ưu tiên identity riêng: "Nếu Spider-Verse thiết kế một productivity/content tracker"

## 1. COLOR SYSTEM

- Black là màu nền chủ đạo (~70%)
- Off-white / light gray (~15%)
- Spider red (~10%)
- Electric blue / purple chỉ làm accent nhỏ (~5%)
- Không dùng đỏ quá nhiều để tránh cảm giác gaming dashboard

Suggested palette:
- Background: #09090B
- Surface: #111114
- Surface 2: #17171C
- Primary Red: #FF1744
- Deep Red: #B00020
- Comic White: #F5F5F5
- Accent Blue: #2563EB

## 2. VISUAL LANGUAGE

Thay "dark SaaS dashboard" bằng "comic-tech dashboard".

Sử dụng:
- Comic panels
- Halftone / dot patterns
- Ink strokes
- Broken / double borders
- Diagonal elements
- Red offset layers / red shadow
- Subtle glitch
- Slightly asymmetric composition
- Small web-line details
- Layered elements

Không sử dụng quá nhiều:
- Spider-Man logo
- Spider-Man character
- Spider web everywhere
- Marvel branding
- New York background

=> Chỉ lấy cảm hứng từ visual language của Spider-Verse.

## 3. CALENDAR

Đây là khu vực cần redesign mạnh nhất.

Hiện tại calendar quá giống Excel/SaaS grid.
Biến mỗi ngày/content thành comic panel.

Card nên có:
- Broken/offset border
- Red shadow/offset layer
- Slightly asymmetric shape
- Small comic accent
- Hover animation

Ví dụ hover:
- translate 2–4px
- scale nhẹ
- red offset shadow xuất hiện
- border shift
- web line xuất hiện từ một góc card

Calendar vẫn phải rõ ràng và usable, không hy sinh UX chỉ để làm đẹp.

## 4. TYPOGRAPHY

Không dùng pixel/comic font cho toàn bộ UI.

Phân cấp:
- Heading: bold comic/display font
- UI text: clean sans-serif
- Small labels/status: monospace hoặc pixel/comic accent

Ví dụ:
SPIDEY TRACKER
AUGUST
2026
ISSUE #08

Các label như:
NEW / DUE / POSTED / ISSUE #08
có thể dùng font comic/pixel.

## 5. BRANDING

Thay "CONTENT CALENDAR" bằng branding có personality hơn:

SPIDEY TRACKER

AUGUST
2026
ISSUE #08

Hoặc:
SPIDEY // TRACKER

Có thể dùng "ISSUE #08" để tạo cảm giác comic book.

## 6. WEB ELEMENT

Không rải spider web khắp giao diện.

Web phải trở thành interaction language.

Ví dụ:
- Hover card → web line xuất hiện
- Drag content → web line nối tới vị trí mới
- Page transition → web line chạy ngang màn hình
- Một vài góc UI có web detail rất nhỏ

Web chỉ là accent, không phải background chính.

## 7. HALFTONE

Thêm halftone/dot pattern rất nhẹ (~3–8% opacity).

Đặt ở:
- Góc calendar
- Sau heading
- Card hover
- Empty state
- Modal / panel

Không để halftone phủ toàn bộ background.

## 8. ANIMATION

Thêm micro-interactions để tạo cảm giác animated Spider-Verse.

Nên có:
- Card hover
- Button press
- Red offset movement
- Slight glitch
- Web-line animation
- Page transition ngắn 200–300ms
- Subtle panel movement

Animation phải nhanh, nhẹ và functional, không gây rối.

## 9. PLATFORM FILTER

Các filter:
ALL / TIKTOK / INSTAGRAM / YOUTUBE

nên được thiết kế như comic tabs/panels.

Active tab:
- Red background
- Dark/black text
- Slight red offset/shadow
- Có thể có diagonal/comic corner

## 10. BACKLOG

Đoạn "BACKLOG / Empty. Everything you capture starts here." hiện tại hơi business/SaaS.

Đổi wording có personality hơn, ví dụ:

╱ BACKLOG

NO MISSIONS YET.

Everything you capture starts here.

+ CAPTURE

Hoặc:
SIDE QUESTS

NO MISSIONS YET.

## 11. EMPTY STATE

Empty state nên giống một comic panel thay vì text thông thường.

Có thể có:
- Halftone
- Small web line
- Comic border
- Abstract spider/ink detail
- "+ CAPTURE CONTENT"

## 12. MENU

MENU button nên có personality hơn.

Ví dụ:
[ + ] MENU

Menu mở ra như một comic panel:
- CALENDAR
- CONTENT
- ANALYTICS
- SETTINGS

Có border/offset layer nhẹ.

**Deviation, already recorded and standing**: `CONTENT` and `ANALYTICS` are not being added. Today
there is exactly one real screen, and the content-analytics module was explicitly *cancelled* (not
deferred) at the 2.0.0 pivot — adding menu entries that go nowhere, or resurrecting a cancelled
module as a side effect of a visual pass, is exactly what constitution IV and this project's own
non-negotiables forbid. `FR-015`'s list stays at one entry until a `spec.md` amendment says otherwise.

## 13. IMPORTANT DESIGN PRINCIPLE

Không biến giao diện thành:
"Spider-Man fan website"

Mà phải giống:
"Spider-Verse-inspired productivity/content tracker"

Tỷ lệ visual nên hướng tới:

60% Modern Dashboard
25% Comic / Spider-Verse
15% Animated / Glitch / Playful

## 14. OVERALL RESULT

Giữ khoảng 70% layout/UX hiện tại.
Redesign khoảng 30% visual system.

Ưu tiên redesign theo thứ tự:
1. Calendar
2. Typography / Branding
3. Content cards
4. Color system
5. Platform tabs
6. Backlog / Empty state
7. Micro-animation
8. Web / Halftone details

Key words:
SPIDEY TRACKER
COMIC-TECH
SPIDER-VERSE INSPIRED
BLACK / RED
HALFTONE
OFFSET LAYERS
INK
COMIC PANELS
DIAGONAL
WEB INTERACTION
MICRO-ANIMATION
MODERN
AESTHETIC
COOL
MINIMAL BUT DISTINCTIVE

Quan trọng: Không copy trực tiếp Spider-Man/Marvel. Hãy tạo một visual identity riêng nhưng khiến
người dùng liên tưởng đến Spider-Verse ngay từ lần đầu nhìn.
