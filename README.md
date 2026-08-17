# Victor Tracker

File này dùng để **chạy sản phẩm trên máy bạn, nhìn nó, và góp ý**. Nếu bạn muốn *sửa code*, đọc
[`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md) và
[`CLAUDE.md`](CLAUDE.md).

> **Đã đổi tên thương hiệu hai lần, hạ tầng đang chạy thì chưa theo kịp cả hai lần.** Lần một:
> CreatorHub → VictorHub trong văn bản và giao diện (2026-08-08). Lần hai: VictorHub → **Victor
> Tracker** (2026-08-14), cùng phạm vi — văn bản, comment, UI, không đụng hạ tầng. Đường dẫn repo,
> project GitLab, hai target deploy và GitHub mirror vẫn còn ghi "creator-hub" — đổi những chỗ đó
> nghĩa là phải trỏ lại hai deployment đang chạy và một mirror, nên phần đó tách thành một lượt
> riêng, làm thủ công (xem `.claude/memory.md`).

## Hiện đang có gì

| | Trạng thái |
|---|---|
| **Travel map** (003) | **Đã xây xong, đã test, gắn tag `v0.3.0`** (2026-08-17). Đây là tính năng cốt lõi của sản phẩm. Xem mục 7 bên dưới. **Một chỗ chưa kiểm chứng được: tải ảnh lên** — chưa cấp phát bucket R2 nào, nên đường đi đó chưa từng chạy thật ở bất kỳ môi trường nào. |
| **Pixel-arcade re-skin** (002) | **Đã merge và gắn tag `v0.2.0`.** Toàn bộ giao diện hiện ở phong cách pixel-arcade/comic-tech, nút là `+ New`, có nav drawer (theme sáng/tối, âm thanh, đăng xuất). |
| **Content Calendar** (001) | **Đã xây, đã test, đã deploy** (`v0.1.0`). Giờ là bề mặt phụ, nằm sau nav drawer. Mục 6 bên dưới là về nó. |

`main`: **413 test backend + 572 test frontend**, xanh hết, không skip cái nào.

---

## 1. Chuẩn bị (làm một lần)

1. **Bật Docker Desktop.** Daemon không sống qua lần reboot; thiếu nó thì lỗi trông giống bug ở
   trang login chứ không giống thiếu database.
2. **Tạo `.env` ở thư mục gốc** bằng cách copy `.env.example`. Hai giá trị quan trọng:
   - `JWT_SECRET` — có **độ dài tối thiểu**; ngắn quá thì backend không boot.
   - `SEED_CREATOR_EMAIL` / `SEED_CREATOR_PASSWORD` — tài khoản bạn sẽ đăng nhập. **Đừng dùng đuôi
     `.local`**, email validator từ chối thẳng.
   `.env` đã gitignore, không rời khỏi máy bạn.
3. **Cần có**: Docker, `uv`, `pnpm`, Node 24.

---

## 2. Chạy back-end

```bash
docker compose up -d db backend
curl http://127.0.0.1:8000/health          # đợi tới khi trả {"status":"ok"}
docker compose exec backend uv run python -m app.scripts.seed_user   # tạo tài khoản, chạy 1 lần
```

Lần khởi động `backend` đầu tiên mất khoảng **70 giây** vì `uv sync` chạy — không phải treo.

Chạy lại `seed_user` chỉ **đổi mật khẩu** của tài khoản đang có. Một email *khác* bị từ chối có chủ
đích: content item không có cột chủ sở hữu, nên hai tài khoản sẽ dùng chung mọi item.

---

## 3. Kiểm tra back-end (không cần giao diện)

### Swagger UI — cách nhanh nhất để thấy toàn bộ tính năng back-end

Mở <http://127.0.0.1:8000/docs>. Đây là tài liệu API sinh từ chính code đang chạy, và **bấm thử được
ngay trong trình duyệt**. Toàn bộ back-end chỉ có 8 thao tác:

| Thao tác | Làm gì |
|---|---|
| `GET /health` | Sống hay chết. **Không** chạm database — cố ý, để một cú nấc của DB không giết service. |
| `POST /auth/login` | Đổi email + mật khẩu lấy access token. Sai email hay sai mật khẩu đều trả **cùng một** thông báo 401 — không tiết lộ nửa nào sai. |
| `POST /auth/logout` | Kết thúc phiên. Token hết hạn vẫn logout được; chỉ khi *không* gửi token nào mới 401. |
| `POST /content-items` | Tạo ý tưởng. **Chỉ cần title.** |
| `GET /content-items` | Liệt kê. Lọc được theo `date_from`/`date_to`, `scheduled=none` (backlog), `platform`. |
| `GET /content-items/{id}` | Đọc một item. |
| `PATCH /content-items/{id}` | Sửa từng phần. |
| `DELETE /content-items/{id}` | Xoá. |

**Cách dùng /docs**: bấm `POST /auth/login` → `Try it out` → điền email/mật khẩu trong `.env` →
`Execute` → copy `access_token` → bấm nút **Authorize** ở góc trên phải → dán token. Từ đó mọi
endpoint `/content-items` đều gọi thử được.

### Nếu thích dòng lệnh

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"...","password":"..."}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -X POST http://127.0.0.1:8000/content-items \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Thử một ý tưởng"}'

curl -s "http://127.0.0.1:8000/content-items?scheduled=none" -H "authorization: Bearer $TOKEN"
```

### Vài quy tắc nghiệp vụ đáng thử phá

Đây là chỗ back-end *phải* từ chối. Nếu nó không từ chối, đó là bug thật:

- Tạo item với `title` là `"   "` (toàn khoảng trắng) → phải **422**.
- `PATCH` một item sang `status: "draft"` khi nó chưa có `platform` → phải **409**, kèm
  `code: "platform_required"`.
- Xoá `platform` của một item đang ở `draft`/`posted` → phải **409**, `code: "platform_locked"`.
- Gọi bất kỳ endpoint `/content-items` nào mà không kèm token → phải **401** (không phải 403).

### Chạy bộ test back-end

```bash
cd backend && uv run pytest        # cần docker compose up -d db
```

---

## 4. Chạy front-end

```bash
cd frontend
pnpm install
```

Rồi chọn **có chủ đích**:

| | Lệnh | Dùng khi |
|---|---|---|
| Dev | `pnpm dev` | Bạn đang sửa code và muốn hot reload. |
| **Production** | `pnpm build`, rồi `API_BASE_URL=http://127.0.0.1:8000 SESSION_COOKIE_SECURE=false pnpm start` | **Bạn đang xem sản phẩm để góp ý.** |

Cả hai đều ở <http://localhost:3000>.

**Vì sao phải dùng bản production để review** — nút nổi "N" (dev overlay của Next) nằm **đúng** trên
nút chuyển `MONTH` / `WEEK` ở 375px và nuốt cú chạm. Dưới `pnpm dev`, nút chuyển view trông như
hỏng mà thực ra không hỏng.

Hai biến môi trường đều chịu lực. Thiếu `SESSION_COOKIE_SECURE=false` thì proxy set cookie `Secure`,
trình duyệt từ chối lưu qua `http://`, và một lần đăng nhập **đúng** vẫn bị đá về trang login.

---

## 5. Xem ở 375px — đây là ràng buộc, không phải sở thích

Sản phẩm được thiết kế theo chiều rộng điện thoại; desktop chỉ là phần mở rộng. **Góp ý từ cửa sổ
desktop phóng to là góp ý về một layout không ai thiết kế cả.**

Chrome/Edge: `F12` → biểu tượng device toolbar (`Ctrl+Shift+M`) → đặt **375 × 667** (hoặc chọn
iPhone SE). Giữ nguyên suốt cả lượt đi.

---

## 6. Đi qua sản phẩm

Theo đúng thứ tự này. Mỗi bước ghi rõ điều *đáng lẽ* phải xảy ra, để "chỗ này thấy sai sai" gắn được
vào một thứ cụ thể.

1. **Đăng nhập** bằng email/mật khẩu trong `.env`.
2. **Lần đầu.** Chưa có item nào thì lịch tự giải thích chính nó thay vì hiện lưới trống — và lưới
   vẫn nhìn thấy được phía sau lời giải thích.
3. **Ghi một ý tưởng.** Chạm `+ CAPTURE`, gõ tiêu đề, lưu. Đó là **đúng ba thao tác** — có ngân sách
   đo được, nên nếu bạn thấy nó giống bốn thao tác thì nói ra. Chỉ hỏi tiêu đề; hỏi platform hay
   ngày ở khoảnh khắc này là ma sát.
4. **Ngăn backlog.** Ý tưởng vừa tạo nằm ở đó, dưới đáy. Có trạng thái thu gọn và trạng thái mở. Nó
   là ngăn kéo *trên* trang lịch, cố ý không phải một trang riêng.
5. **Tháng và tuần.** Chuyển qua lại. Lưới tháng luôn sáu hàng, nên không có gì dịch chuyển dưới
   ngón cái khi bạn điều hướng. Tuần là bảy khối xếp dọc, không phải bảy cột.
6. **Chuyển kỳ.** Mũi tên đi tới/lui một tháng hoặc một tuần. Nhìn tiêu đề và dòng nhãn phía trên.
7. **Đọc trạng thái mà không đọc chữ.** Trạng thái là hình dạng và độ đặc — viền rỗng, nửa đặc, đặc
   có dấu tích — không bao giờ chỉ bằng màu. **Nheo mắt, hoặc chụp màn hình rồi chuyển sang trắng
   đen.** Nếu không phân biệt được ba trạng thái, đó là lỗi thật.
8. **Kéo một item vào một ngày.** Rồi kéo ngược về backlog. Một cú vuốt bắt đầu từ item phải là
   cuộn trang, không được nhấc item lên.
9. **Mở một item.** Đổi title, hook, platform, status, ngày. Một lần lưu gửi một request.
10. **Thử phá luật.** Chuyển item khỏi `idea` khi chưa có platform — nó phải từ chối và chỉ thẳng
    vào ô cần sửa, không bắt bạn rời màn hình.
11. **Lọc theo platform.** Phải thấy tức thì. Lọc sang platform không có item nào — màn hình phải
    nói rõ đang lọc gì, thay vì trắng trơn.
12. **Link đã đăng.** Dán URL vào một item rồi mở nó từ lịch. Đưa item ngược về `draft` — **link
    phải còn**, vì bài đăng nó trỏ tới vẫn đang sống.
13. **Quá hạn.** Đặt lịch một item vào quá khứ. Nó có viền trái nét đứt và header đếm nó. Quá hạn là
    một *điều kiện*, không phải trạng thái thứ tư.
14. **Xoá.** Item → `DELETE ITEM` → `DELETE PERMANENTLY`. Ba chạm có chủ đích, và `KEEP ITEM` là thứ
    `Enter` với `Escape` chọn.
15. **Tab qua mọi thứ** bằng bàn phím. Mọi control phải hiện viền focus nhìn thấy được.
16. **Không thứ gì được ra khỏi màn hình.** Không cuộn ngang, không control nào bị cắt ở mép phải,
    trên mọi màn hình và mọi panel.
17. **Đăng xuất** từ header.

### Xoá sạch dữ liệu giữa hai lượt

```bash
docker compose exec -T db psql -U creatorhub -d creatorhub -c "delete from content_item;"
```

---

## 7. Đi qua bản đồ (`/map`) — tính năng cốt lõi

Vẫn ở **375 × 667**. Mở <http://localhost:3000/map>, hoặc vào từ nav drawer.

1. **Bản đồ phải vẽ ra thật.** Đường, nước, nhãn địa danh, và dòng ghi công
   `MapLibre | © CARTO, © OpenStreetMap contributors` ở góc. **Nếu nền đen kịt mà pin vẫn hiện, đó
   là bug thật** — không phải bản đồ đang tải. Đó chính là lỗi worker đã có lần lọt qua hai phase
   vì mọi test đều xanh.
2. **Đọc trạng thái mà không chạm.** Pin hình khiên, ba mức: viền rỗng / nửa đặc / đặc. **Nheo mắt
   hoặc chuyển ảnh sang trắng đen** — nếu không phân biệt được Visited / Planned / Wishlist thì đó
   là lỗi thật, vì màu không được phép là tín hiệu duy nhất.
3. **Thêm một nơi thật nhanh.** Quick Add → gõ tên một thành phố có thật → chọn một kết quả → chọn
   trạng thái. **Đúng ba thao tác**, không chuyển trang, pin hiện ra ngay. Nếu bạn đếm ra bốn, nói
   ra.
4. **Tìm một chỗ không có thật** (gõ bừa vài ký tự). Phải nói rõ "không tìm thấy" — và điều đó phải
   **khác** với thông báo khi tìm kiếm *hỏng*. Hai chuyện khác nhau, không được gộp.
5. **Chạm một pin Visited.** Sheet mở ra với ghi chú và ảnh. Chạm một pin Planned hoặc Wishlist —
   **không** được có ghi chú hay thư viện ảnh. Nơi chưa đi thì chưa có gì để lưu.
6. **Đổi trạng thái theo bất kỳ hướng nào.** Visited → Wishlist → Planned → Visited. Không có thứ
   tự bắt buộc; đánh dấu nhầm phải sửa lại được.
7. **Currently Traveling.** Một nơi Planned có khoảng ngày chứa hôm nay sẽ có thêm lớp phủ nhấp
   nháy. Nó được **tính ra**, không lưu — nên nó tự hết khi qua ngày, không cần ai nhớ tắt.
8. **Tạo một Trip** với tên và khoảng ngày, thêm Destination vào. Cho một Destination khoảng ngày
   **nằm ngoài** khoảng ngày của Trip — hệ thống phải **đánh dấu** chứ không từ chối lưu.
9. **Xoá Trip.** Xác nhận phải nói rõ những gì sẽ mất theo.
10. **Lọc theo trạng thái**, rồi xoá bộ lọc. Phải tức thì — không có request nào đi ra sau mỗi lần
    bấm.
11. **Không thứ gì được ra khỏi màn hình**, kể cả sau khi kéo bản đồ đi.

**Chưa kiểm chứng được: tải ảnh lên.** Chưa có bucket Cloudflare R2 nào được cấp phát, nên bốn biến
`R2_*` đều rỗng và đường tải ảnh chưa từng chạy thật. Nếu bạn thử, nó sẽ báo lỗi nói rõ thiếu bốn
biến nào. Đây là khoảng trống đã biết và đã ghi lại, không phải bug mới.

### Xoá sạch dữ liệu bản đồ giữa hai lượt

```bash
docker compose exec -T db psql -U creatorhub -d creatorhub -c "delete from trip; delete from destination;"
```

---

## Bản đã deploy

- Front-end: <https://creator-hub-hazel.vercel.app>
- Back-end: <https://creator-hub-1dgs.onrender.com> (Swagger ở `/docs`)

**Lần truy cập đầu tiên trong ngày mất khoảng 45 giây, và điều này đã biết.** Request đầu đi qua
**hai** tầng free tier đang ngủ chồng lên nhau — Render tắt service và Neon tự treo database. Khi đã
ấm, cùng trang đó dưới 2 giây. Đừng báo cold start như một bug; cách chữa là trả tiền hoặc ping giữ
ấm, và đó là quyết định hoãn có chủ đích.

---

## Khi thấy có vẻ hỏng

| Triệu chứng | Thực ra là gì |
|---|---|
| Trang login treo, không request nào tới API | Docker daemon đã tắt. Bật Docker Desktop rồi `docker compose up -d db backend`. |
| Nút `MONTH` / `WEEK` không ăn ở 375px | Dev overlay của Next đè lên. Dùng bản production. |
| Đăng nhập đúng nhưng bị đá về `/login` | Thiếu `SESSION_COOKIE_SECURE=false` trong lệnh `pnpm start`. |
| Backend không boot, kêu về một setting | `JWT_SECRET` quá ngắn, hoặc một biến bị set thành chuỗi **rỗng** — giá trị rỗng ghi đè default rồi tự vi phạm ràng buộc của chính nó. |
| `pnpm typecheck` đỏ ngay sau khi đổi nhánh | Route type sinh ra đã cũ. `rm -rf .next` rồi chạy lại. CI không bao giờ gặp. |
| `playwright test` không khởi động (`EADDRINUSE`) | Còn server cũ giữ cổng 3100. Kill nó. |
| Một panel render trong suốt hoặc mất style | Sai chính tả một class Tailwind. Nó hỏng **im lặng** — không lỗi build, lint hay test. |

---

## Đọc thêm

- [`CLAUDE.md`](CLAUDE.md) — trạng thái hiện tại, các quyết định, và việc tiếp theo
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — nguyên tắc mọi thay đổi bị soi chiếu vào
- [`specs/003-travel-map/`](specs/003-travel-map/) — bản đồ được đặc tả để làm gì, **và những gì cố ý không xây**
- [`specs/001-content-calendar/`](specs/001-content-calendar/) — Content Calendar được đặc tả để làm gì
- [`CHANGELOG.md`](CHANGELOG.md) — đã ship những gì, gồm cả tiêu chí nghiệm thu duy nhất bị trượt khi lạnh
- [`docs/retro-01.md`](docs/retro-01.md), [`docs/retro-02.md`](docs/retro-02.md),
  [`docs/retro-03.md`](docs/retro-03.md) — retro của ba iteration
