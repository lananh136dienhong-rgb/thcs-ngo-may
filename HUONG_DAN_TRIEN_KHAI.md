# Hướng dẫn triển khai – Hệ thống quản lý nhiệm vụ THCS Ngô Mây

Kiến trúc: **thuần Google + Cloudflare Pages**, đăng nhập bằng Google.

```
Trình duyệt (website trên Cloudflare Pages)
   │  index.html nạp: config.js → api.js → app.js
   │  app.js gọi API.call('tên hành động', dữ liệu)
   ▼
POST https://script.google.com/macros/s/.../exec          (Apps Script web app, chạy dưới quyền chủ sở hữu)
   │  Code.gs  doPost()  ─ nhận yêu cầu, khóa khi ghi
   │  Auth.gs            ─ xác minh đăng nhập Google, kiểm tra phiên
   │  Api.gs / Docs.gs   ─ xử lý nghiệp vụ, kiểm tra quyền từng thao tác
   │  Db.gs              ─ đọc/ghi theo tên cột
   ▼
Google Sheets (dữ liệu)      Google Drive (văn bản, tài liệu giao, file nộp)
 – chỉ chủ sở hữu mở được     – chỉ chủ sở hữu mở được
```

## 0. Cấu trúc thư mục

```
thcs-ngo-may/
├─ backend/                 ← dán vào Google Apps Script
│   ├─ appsscript.json      cấu hình: múi giờ, quyền, kiểu triển khai
│   ├─ Code.gs              điểm vào doPost, hằng số, hàm tiện ích
│   ├─ Auth.gs              đăng nhập Google, token phiên
│   ├─ Db.gs                lớp đọc/ghi Google Sheets + định nghĩa các cột
│   ├─ Api.gs               nhiệm vụ: tạo, sửa, tiếp nhận, nộp, duyệt, gia hạn, thêm người, chat
│   ├─ Docs.gs              văn bản, xác nhận phân loại, thẻ, hồ sơ cá nhân
│   ├─ Ai.gs                ★ trợ lý AI Gemini: đọc văn bản, gợi ý phân loại và nhiệm vụ
│   └─ Setup.gs             setup(), upgrade(), aiSelfTest(), installAiTrigger(), checkUsers(), sao lưu
├─ frontend/                ← đưa lên Cloudflare Pages
│   ├─ index.html           khung trang + màn hình đăng nhập
│   ├─ config.js            ★ file DUY NHẤT cần sửa: địa chỉ API + Client ID
│   ├─ api.js               hàm gọi backend
│   ├─ app.js               toàn bộ giao diện và xử lý sự kiện
│   ├─ style.css            giao diện
│   └─ _headers             tiêu đề bảo mật cho Cloudflare
├─ kiem-thu/                bộ kiểm thử backend chạy bằng Node.js
└─ HUONG_DAN_TRIEN_KHAI.md  file này
```

**Các file liên kết với nhau thế nào**
- `index.html` nạp theo thứ tự `config.js` → `api.js` → `app.js` (có `?v=3` để ép trình duyệt tải bản mới).
- `config.js` đặt biến `CONFIG`; `api.js` đọc `CONFIG.API_URL`; `app.js` dùng `API.call(...)` và `CONFIG`.
- Mỗi tên hành động trong `app.js` (ví dụ `'submitTask'`) khớp một hàm trong `routes_()` ở `Api.gs` (ví dụ `apiSubmit_`).
- `Db.gs` có danh sách cột `SCHEMA`; `Setup.gs → setup()` dùng nó để tạo các sheet đúng cột.
- Hằng số dung lượng tệp có ở **hai nơi** và phải khớp: `CFG.MAX_FILE_MB` (Code.gs) và `MAX_FILE_MB` (config.js).

## 1. Chuẩn bị

| Cần có | Ghi chú |
|---|---|
| Tài khoản Google làm **chủ sở hữu** hệ thống | Khuyến nghị tạo một Gmail riêng của trường thay vì Gmail cá nhân của Hiệu trưởng. Bật xác minh hai bước. |
| Tài khoản GitHub | Để lưu mã và tự động xuất bản |
| Tài khoản Cloudflare | Miễn phí |
| Danh sách nhân viên + Gmail | Dạng Excel: họ tên, Gmail, năm sinh, chức vụ, tổ, cơ sở |

Toàn bộ phần dưới đây làm khi đăng nhập bằng tài khoản chủ sở hữu.

## 2. Bước 1 – Tạo "Client ID" để đăng nhập bằng Google

1. Vào <https://console.cloud.google.com>, tạo **dự án mới** (tên tùy ý, ví dụ `thcs-ngo-may`).
2. Mở mục **Google Auth Platform** (hoặc **APIs & Services → OAuth consent screen**) và cấu hình:
   - Loại người dùng: **External**.
   - Tên ứng dụng: `THCS Ngô Mây – Quản lý nhiệm vụ`; email hỗ trợ: email của bạn.
   - Phạm vi (scopes): chỉ để mặc định (email, profile, openid).
3. Chuyển trạng thái ứng dụng sang **In production** (Publish app). Nếu để *Testing*, chỉ những Gmail được thêm vào "Test users" mới đăng nhập được. Với các phạm vi cơ bản này Google thường không yêu cầu xác minh, nhưng hãy đọc thông báo hiển thị trên màn hình.
4. Mở **Clients → Create client** (hoặc **Credentials → Create credentials → OAuth client ID**):
   - Loại: **Web application**.
   - **Authorized JavaScript origins**: thêm `http://localhost:8000` (để thử trên máy). Địa chỉ Cloudflare sẽ thêm ở bước 6.
   - Không cần điền "Redirect URIs".
5. Sao chép **Client ID** (dạng `1234-abcd.apps.googleusercontent.com`). Client ID không phải bí mật. 761801522322-mbeq2l5cp6j55er0ej15c7u79qe983d5.apps.googleusercontent.com

## 3. Bước 2 – Tạo backend trên Google Apps Script

1. Vào <https://script.google.com> → **New project**, đặt tên `thcs-ngo-may-api`.
2. **Project Settings** (biểu tượng bánh răng) → bật **Show "appsscript.json" manifest file in editor**.
3. Quay lại **Editor**:
   - Mở `appsscript.json`, xóa nội dung, dán nội dung file `backend/appsscript.json`.
   - Mở file `Code.gs` mặc định, xóa nội dung, dán nội dung `backend/Code.gs`.
   - Bấm **+ → Script** để tạo thêm 5 file tên `Auth`, `Db`, `Api`, `Docs`, `Setup` và dán nội dung tương ứng (Apps Script tự thêm đuôi `.gs`).
4. **Project Settings → Script properties → Add script property**, thêm 3 dòng:

   | Property | Giá trị |
   |---|---|
   | `GOOGLE_CLIENT_ID` | Client ID ở bước 1 |
   | `ADMIN_EMAIL` | Gmail của Hiệu trưởng (đúng email dùng đăng nhập Google) |
   | `ADMIN_NAME` | Họ tên Hiệu trưởng, ví dụ `Nguyễn Thị Lan Anh` |

5. Ở trình soạn thảo, chọn hàm **`setup`** trong danh sách hàm → **Run**. Lần đầu Google hỏi cấp quyền: **Review permissions** → chọn tài khoản → **Advanced → Go to ... (unsafe)** → **Allow**. (Cảnh báo này là bình thường vì đây là script do chính bạn viết.)
6. Xem **Execution log**. Nếu thành công bạn sẽ thấy đường dẫn tới Google Sheet và thư mục Drive vừa được tạo:
   - Google Sheet `QuanLyNhiemVu – THCS Ngô Mây` với 12 sheet đúng cột, có sẵn tài khoản Hiệu trưởng (`U001`, quyền `admin`) và 5 thẻ phân loại văn bản.
   - Thư mục Drive `QuanLyNhiemVu – THCS Ngô Mây` gồm `VanBan`, `TaiLieuGiao`, `NopBai`.
7. (Khuyến nghị) Chạy hàm **`installWeeklyBackup`** để bật sao lưu Sheet mỗi Chủ nhật 2 giờ sáng (giữ 8 bản gần nhất, nằm trong thư mục `Backups` của Drive).

> **Không chia sẻ** Google Sheet và thư mục Drive cho bất kỳ ai. Nhân viên chỉ truy cập qua website; mọi thứ đi qua script nên quyền được kiểm soát ở backend.

### Nhập danh sách nhân viên (sheet `Users`)

Mở Google Sheet vừa tạo → sheet **Users**. Mỗi nhân viên một dòng (dòng 2 là Hiệu trưởng):

| Cột | Ý nghĩa | Quy tắc |
|---|---|---|
| `user_id` | Mã duy nhất | `U002`, `U003`, … không trùng |
| `full_name` | Họ tên hiển thị | **Không được trùng nhau** (hệ thống nhận diện người trong nhiệm vụ theo tên) |
| `email` | Gmail đăng nhập | Viết thường, đúng địa chỉ Google nhận diện; mỗi email một dòng |
| `birth_year`, `address` | Hồ sơ | Có thể để trống |
| `position` | Chức vụ | `Phó hiệu trưởng`, `Tổ trưởng chuyên môn`, `Giáo viên`, `Nhân viên` |
| `app_role` | Quyền trong hệ thống | `admin` (Hiệu trưởng), `leader` (Phó hiệu trưởng và Tổ trưởng), `staff` (còn lại) |
| `department` | Tổ chuyên môn | Đúng một trong 8 tổ (xem `LISTS.dept` trong Code.gs) |
| `campus` | Cơ sở | `Trường chính` hoặc `Phân hiệu` |
| `active` | Còn làm việc | `TRUE` hoặc `FALSE` |
| `created_at` | Ngày tạo | Dạng `2026-09-01T08:00:00` |

Sau khi nhập, quay lại Apps Script chạy hàm **`checkUsers`**. Nó báo email trùng, họ tên trùng, giá trị sai danh mục, hoặc người có chức vụ leader nhưng `app_role` đang là `staff`.

**Quan trọng khi sửa sheet bằng tay:** không xóa hoặc đổi tên dòng tiêu đề (dòng 1), không chèn dòng trống giữa dữ liệu, không để trống cột đầu của một dòng có dữ liệu. Các sheet khác (Tasks, Documents…) do hệ thống tự ghi, hạn chế sửa tay.

## 4. Bước 3 – Triển khai backend thành web app

1. **Deploy → New deployment** → biểu tượng bánh răng → chọn **Web app**.
2. Cấu hình:
   - **Execute as: Me** (tài khoản chủ sở hữu).
   - **Who has access: Anyone**.
3. **Deploy** → sao chép **Web app URL** (kết thúc bằng `/exec`).
4. Kiểm tra: dán URL vào trình duyệt. Thấy chuỗi `{"ok":true,"data":"THCS Ngô Mây API đang chạy"}` là backend đã chạy.

Vì sao chọn "Anyone"? Website ở tên miền khác nên không mang theo đăng nhập Google; việc xác thực do mã trong `Auth.gs` đảm nhiệm (kiểm tra token Google và danh sách `Users`). Không chọn "Execute as the user accessing", vì khi đó Sheet và Drive phải chia sẻ cho cả trường.

**Khi sửa mã backend sau này:** lưu file → **Deploy → Manage deployments** → bút chì → **Version: New version** → **Deploy**. Địa chỉ `/exec` giữ nguyên. Nếu chỉ lưu mà không tạo version mới, website vẫn chạy mã cũ.

## 5. Bước 4 – Cấu hình và thử website trên máy

1. Mở `frontend/config.js`, thay hai giá trị:
   ```js
   API_URL: 'https://script.google.com/macros/s/xxxxxxxx/exec',
   GOOGLE_CLIENT_ID: '1234-abcd.apps.googleusercontent.com',
   ```
2. Trong thư mục `frontend`, chạy một máy chủ tĩnh (cần Python 3):
   ```
   python3 -m http.server 8000
   ```
3. Mở <http://localhost:8000>, bấm **Đăng nhập với Google** bằng Gmail Hiệu trưởng. Vào được màn hình "Tổng quan điều hành" là kết nối thành công.

Nếu nút Google không hiện hoặc báo lỗi `origin_mismatch`, xem mục 11.

## 6. Bước 5 – Xuất bản trên Cloudflare Pages

**Cách A – qua GitHub (khuyên dùng, tự cập nhật khi đẩy mã):**
1. Tạo kho GitHub (có thể để **Private**), đưa toàn bộ thư mục `thcs-ngo-may` lên.
   Trước khi đưa lên, đảm bảo `config.js` đã có API URL và Client ID đúng (cả hai đều không phải bí mật).
2. <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git**, chọn kho.
3. Cấu hình build (tên ô có thể khác chút tùy giao diện hiện tại):
   - Framework preset: **None**
   - Build command: *để trống*
   - Build output directory: **`frontend`**
4. **Save and Deploy**. Sau vài chục giây bạn có địa chỉ dạng `https://ten-du-an.pages.dev`.

**Cách B – không dùng GitHub:** Pages → **Create → Pages → Upload assets**, kéo thả thư mục `frontend`.

(Tùy chọn) Gắn tên miền riêng của trường ở tab **Custom domains** của dự án Pages.

## 7. Bước 6 – Cho phép địa chỉ Cloudflare đăng nhập

Quay lại Google Cloud Console → **Clients** → client đã tạo → thêm vào **Authorized JavaScript origins**:
- `https://ten-du-an.pages.dev` (và tên miền riêng nếu có).

Lưu, chờ 1–5 phút để áp dụng, rồi mở địa chỉ Cloudflare và đăng nhập thử.

## 8. Quy trình vận hành hằng ngày

| Việc | Cách làm |
|---|---|
| Thêm nhân viên mới | Thêm một dòng vào sheet `Users` (`active = TRUE`), chạy `checkUsers`. Có hiệu lực ngay. |
| Nhân viên thôi việc | Đổi `active` thành `FALSE` trong sheet `Users`. Mất quyền trong tối đa **90 giây** (độ trễ của bộ nhớ đệm, xem mục 13), không cần chờ hết phiên. Muốn có hiệu lực ngay, chạy hàm `clearCache` trong Apps Script. |
| Đổi chức vụ, tổ, cơ sở | Hiệu trưởng sửa trong hồ sơ cá nhân (chỉ Hiệu trưởng sửa được), hoặc sửa trực tiếp trong sheet `Users`. Nếu lên Tổ trưởng/Phó hiệu trưởng nhớ đổi `app_role` thành `leader`. |
| Nhân viên không đăng nhập được | Xem thông báo lỗi trên màn hình đăng nhập (có ghi email Google nhận diện) và đối chiếu với cột `email` trong sheet `Users`. |
| Xem dung lượng Drive | Vào <https://drive.google.com/settings/storage>. Tài khoản cá nhân có 15 GB dùng chung với Gmail. Nên kiểm tra mỗi học kỳ; khi gần đầy, lưu trữ thư mục `NopBai` của năm cũ về máy rồi xóa. |
| Sao lưu | Tự động mỗi tuần nếu đã chạy `installWeeklyBackup`. Có thể chạy `backup` bất kỳ lúc nào. Google Sheets cũng có lịch sử phiên bản (File → Version history). |
| Chuyển giao cho Hiệu trưởng mới | Tốt nhất dùng Gmail riêng của trường làm chủ sở hữu rồi chuyển mật khẩu. Nếu chủ sở hữu thay đổi, phải sao chép project sang tài khoản mới và chạy lại từ bước 2 (có thể trỏ `SHEET_ID`, `FOLDER_*` tới dữ liệu cũ sau khi chuyển quyền sở hữu). |
| Sửa giao diện | Sửa file trong `frontend`, đẩy lên GitHub, Cloudflare tự cập nhật. Tăng `?v=1` thành `?v=2` trong `index.html` để người dùng nhận bản mới. |

## 9. Danh sách kiểm tra khi chạy thật (những điều chưa thể thử trước)

Mã đã được kiểm thử ở hai mức: toàn bộ logic backend trên môi trường Google **giả lập** (92 tình huống, xem `kiem-thu/`), và giao diện trên Chromium thật nối với backend giả lập. **Chưa** thử trên Google thật, nên hãy kiểm tra theo thứ tự sau ngay sau khi triển khai:

1. Đăng nhập bằng Gmail Hiệu trưởng → vào được trang admin.
2. Đăng nhập bằng một Gmail **không** có trong sheet `Users` → thấy thông báo "chưa được cấp quyền".
3. Tạo nhiệm vụ có đính một tệp, giao cho một tài khoản staff; đăng nhập staff (trình duyệt khác hoặc cửa sổ ẩn danh) → thấy nhiệm vụ, tải được tài liệu.
4. Staff nộp kết quả kèm tệp **gần mức giới hạn** (ví dụ 9 MB). Nếu lỗi hoặc rất chậm, hạ `MAX_FILE_MB` ở **cả** `Code.gs` và `config.js` (ví dụ còn 5), rồi tạo version mới.
5. Mở nhiệm vụ trên hai thiết bị, gửi tin nhắn từ một bên, bên kia thấy sau tối đa vài chục giây.
6. Admin bấm **Tải PDF thống kê**, mở được file.
7. Mở bảng điều khiển trình duyệt (F12 → Console) khi tải trang trên Cloudflare, không có lỗi liên quan `Content-Security-Policy`.
8. Thử trên điện thoại thật.
9. Để phiên quá 8 giờ (hoặc xóa token trong `sessionStorage`), thao tác tiếp theo phải đưa người dùng về màn hình đăng nhập.

## 10. Bảo mật – các điểm đã làm và việc bạn cần giữ

Đã làm trong mã:
- Mọi thao tác kiểm tra quyền ở backend; nhân viên chỉ thấy nhiệm vụ được giao; chỉ admin duyệt, xóa, phân loại.
- Chỉ email trong sheet `Users` đang `active` mới đăng nhập được; khóa tài khoản có hiệu lực trong tối đa 90 giây (hoặc ngay nếu chạy `clearCache`).
- Token phiên ký HMAC, hết hạn sau 8 giờ, lưu trong `sessionStorage` (đóng tab là mất).
- Chặn "công thức độc hại" khi người dùng nhập văn bản bắt đầu bằng `=`, `+`, `-`, `@`.
- Giới hạn định dạng, dung lượng và số lượng tệp; chặn văn bản trùng tên + dung lượng.
- Nhân viên không tự nâng quyền được (không tự sửa chức vụ, tổ, cơ sở, `app_role`).
- Tiêu đề bảo mật và CSP trong `_headers`.

Việc bạn cần giữ:
- Bật **xác minh hai bước** cho tài khoản chủ sở hữu, đây là điểm yếu duy nhất của toàn hệ thống.
- Không chia sẻ Sheet, thư mục Drive, và quyền chỉnh sửa Apps Script cho người khác.
- Không công khai `TOKEN_SECRET`. Nếu nghi ngờ lộ: xóa property `TOKEN_SECRET`, chạy lại `setup()`; mọi người sẽ phải đăng nhập lại.

## 11. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Không thấy nút "Đăng nhập với Google" | CSP chặn, hoặc mất mạng, hoặc chưa tải script Google | Mở Console, tìm lỗi. Kiểm tra `_headers` còn nguyên và đã triển khai |
| `Error 400: origin_mismatch` | Địa chỉ website chưa nằm trong Authorized JavaScript origins | Bước 7; chú ý đúng `https://`, không có dấu `/` ở cuối |
| `Access blocked: app not verified` / chỉ vài người đăng nhập được | Ứng dụng OAuth đang ở chế độ Testing | Bước 1.3: chuyển sang In production |
| "Máy chủ trả về dữ liệu không hợp lệ" | `API_URL` sai, hoặc web app chưa triển khai "Anyone" | Mở `API_URL` trên trình duyệt phải thấy `{"ok":true...}`; kiểm tra bước 4.2 |
| Lỗi `CORS` / `Failed to fetch` | Triển khai sai kiểu truy cập, hoặc dùng địa chỉ `/dev` | Dùng đúng địa chỉ `/exec` của bản triển khai; kiểm tra "Who has access: Anyone" |
| Sửa mã rồi nhưng website vẫn như cũ | Chưa tạo New version | Mục 4, "Khi sửa mã backend" |
| "Email … chưa được cấp quyền" | Email không khớp sheet `Users` | So sánh chính xác từng ký tự (chú ý dấu chấm trong Gmail), `active = TRUE` |
| "Hệ thống đang bận" | Nhiều người ghi cùng lúc | Thử lại sau vài giây |
| Vừa sửa sheet bằng tay nhưng website chưa thấy | Bộ nhớ đệm giữ dữ liệu tối đa 90 giây | Chờ 90 giây hoặc chạy hàm `clearCache` trong Apps Script |
| `Exceeded maximum execution time` hoặc tải rất chậm | Tệp quá lớn hoặc sheet quá nhiều dòng | Hạ `MAX_FILE_MB`; lưu trữ dữ liệu cũ |
| "Thiếu sheet: …" | Chưa chạy `setup()`, hoặc đổi tên sheet | Chạy `setup()` (an toàn khi chạy lại, không ghi đè dữ liệu) |
| `Service invoked too many times` | Vượt hạn mức hằng ngày của Apps Script | Chờ sang ngày; tăng `POLL_DETAIL_MS` và `POLL_LIST_MS` trong `config.js` để giảm số lần gọi |

## 12. Giới hạn đã biết

- **Tốc độ:** mỗi thao tác phải qua Apps Script, thường chậm hơn một cơ sở dữ liệu chuyên dụng. Chat không phải thời gian thực mà được làm mới định kỳ: 12 giây khi đang mở một nhiệm vụ (`POLL_DETAIL_MS`) và 45 giây ở các trang danh sách (`POLL_LIST_MS`). Tab bị ẩn thì không làm mới.
- **Hạn mức Apps Script** (thời gian chạy mỗi lần, số lần chạy đồng thời, số lần gọi mỗi ngày) tính chung cho tài khoản chủ sở hữu. Với vài chục đến vài trăm nhân viên thường đủ, nhưng nên theo dõi trong vài tuần đầu.
- **Kích thước tệp:** tệp được gửi dưới dạng base64 trong một yêu cầu, nên giới hạn thực tế nhỏ hơn nhiều so với giới hạn lý thuyết của Apps Script. Mặc định 10 MB mỗi tệp; hãy kiểm tra ở mục 9.4.
- **Họ tên phải duy nhất:** hệ thống hiển thị và đối chiếu người theo họ tên. Nếu hai người trùng tên, hãy thêm ký hiệu phân biệt (ví dụ "Nguyễn Văn An (Toán)").
- **Xác minh token Google** dùng điểm cuối `tokeninfo` của Google. Phù hợp với quy mô nhỏ vì chỉ gọi lúc đăng nhập (một lần mỗi 8 giờ).
- **Điểm lỗi duy nhất:** nếu tài khoản chủ sở hữu bị khóa, cả hệ thống ngừng hoạt động. Hãy giữ cách khôi phục tài khoản cập nhật và sao lưu định kỳ.
- **Đăng nhập chỉ bằng Google.** Phương án mật khẩu 6 số không được cài đặt vì mô hình thuần Google không có nơi lưu mật khẩu an toàn.

Khi trường phát triển (nhiều người dùng, nhiều tệp, cần chat tức thời), có thể thay `Db.gs` và `saveDrive_` bằng Supabase và Cloudflare R2 mà giao diện và các hàm nghiệp vụ gần như không đổi.

## 13. Tốc độ và bộ nhớ đệm

**Vì sao chậm:** mỗi lần gọi, Apps Script phải khởi chạy rồi đọc lại hàng chục sheet từ Google Sheets. Đo thực tế (F12 → Network → lọc `exec`) trước khi tối ưu cho thấy mỗi lần gọi mất khoảng 4,5–5,6 giây. Dòng trạng thái `302` là bước chuyển hướng bình thường của Apps Script, thời gian hiển thị chính là lúc script đang chạy.

**Đã tối ưu trong mã:**
- **Bộ nhớ đệm** (`Db.gs`): dữ liệu các sheet được giữ tối đa 90 giây và dùng chung cho mọi người dùng. Bảng nào vừa được ghi sẽ tự bị xóa khỏi đệm, nên dữ liệu qua ứng dụng luôn mới. Khi chạy kiểm thử, lần đọc thứ hai từ đệm không phải đọc sheet nào.
- **Một lần gọi thay vì hai**: sau mỗi thao tác ghi, và sau khi đăng nhập, backend trả kèm luôn dữ liệu mới nhất.
- **Làm mới thưa hơn**: khi chuyển trang chỉ tải lại nếu dữ liệu cũ hơn `NAV_REFRESH_MS` (mặc định 15 giây); trang danh sách làm mới mỗi 45 giây.
- **Báo đang xử lý**: thanh tiến trình trên cùng và dòng "Đang tải dữ liệu…" khi mở trang.
- **Đánh thức backend** bằng một yêu cầu nhẹ khi mở màn hình đăng nhập.

**Đánh đổi bạn cần biết:** nếu bạn sửa Google Sheet **bằng tay** (thêm nhân viên, khóa tài khoản...), website thấy thay đổi sau tối đa 90 giây. Muốn thấy ngay, chạy hàm `clearCache` trong Apps Script. Sửa qua website thì luôn cập nhật ngay.

**Cách cập nhật khi đã triển khai:**
1. Apps Script: dán lại các file `Db.gs`, `Code.gs`, `Setup.gs`, rồi **Deploy → Manage deployments → bút chì → New version → Deploy**.
2. Giao diện: đẩy thư mục `frontend` lên GitHub (Cloudflare tự cập nhật). Không cần đổi `config.js` nếu bạn đã điền đúng; chỉ thêm dòng `NAV_REFRESH_MS: 15000` nếu file của bạn chưa có.
3. Mở website bằng Ctrl+F5 để tải bản mới (chúng tôi đã đổi `?v=1` thành `?v=2`).

**Đo lại để so sánh:** F12 → Network → lọc `exec` → xem cột **Time**. Lần gọi đầu sau thời gian không dùng vẫn có thể chậm (backend khởi động lại); hãy so các lần gọi từ thứ hai trở đi.

**Chỉnh số liệu trong `config.js`:** `POLL_DETAIL_MS` (chu kỳ làm mới khi đang mở nhiệm vụ), `POLL_LIST_MS` (chu kỳ làm mới trang danh sách), `NAV_REFRESH_MS` (độ cũ tối đa khi chuyển trang). Tăng các số này để giảm số lần gọi backend, đổi lại dữ liệu của người khác hiện chậm hơn.

**Nếu vẫn chậm:** Apps Script có độ trễ vốn có mỗi lần gọi nên không thể nhanh bằng website dùng cơ sở dữ liệu chuyên dụng. Khi đó cân nhắc thay Google Sheets bằng Supabase hoặc Cloudflare D1 (giữ nguyên giao diện, thay `Db.gs` và `saveDrive_`).

## 14. Trợ lý AI (Gemini): đọc văn bản, gợi ý phân loại và nhiệm vụ

### 14.1 AI làm gì
1. Hiệu trưởng (hoặc nhân viên) **tải văn bản** lên website. Tệp nằm ở thư mục tạm `VanBan/_Cho_xac_nhan` trong Drive.
2. **Gemini đọc** văn bản và gợi ý: loại văn bản, cơ quan ban hành, số ký hiệu, trích yếu và các việc nhà trường phải làm (tên, nội dung, hạn).
3. Ở mục **Tải văn bản**, mỗi văn bản chờ phân loại có sẵn hai ô **Loại văn bản** và **Cơ quan ban hành** (AI điền sẵn nếu bật; AI tắt thì để trống để chọn tay), kèm độ tin cậy và dòng "Sẽ lưu vào: Drive › ...". Hiệu trưởng giữ hoặc đổi lựa chọn rồi bấm **Lưu và đồng ý**. **Bắt buộc chọn đủ cả hai** thì tệp mới được chuyển vào thư mục `VanBan/<cơ quan>/<loại>` và hiện trong **Kho văn bản**. Cuối trang có hai khu vực **Thẻ phân loại theo loại văn bản** và **Thẻ phân loại theo cơ quan ban hành** để thêm, đổi tên, xóa (cơ quan mới tự có thư mục `10_...`, `11_...` trên Drive; chỉ xóa được cơ quan chưa có văn bản).
4. Các việc AI tìm thấy xuất hiện ở mục **Đề xuất nhiệm vụ từ AI**. Hiệu trưởng xem lại, chọn người được giao và bổ sung rồi mới giao. AI chỉ điền tên, nội dung, thời hạn.

AI chỉ **gợi ý**. Không có thao tác thật nào (đưa tệp vào thư mục, tạo nhiệm vụ) xảy ra khi chưa có người bấm xác nhận.

**Cách tính hạn:** nếu văn bản nêu ngày cụ thể, hạn nội bộ sớm hơn 2 ngày (lùi về ngày làm việc). Nếu nêu hạn kiểu "trong 05 ngày làm việc kể từ ngày nhận", **chương trình** tự cộng ngày (bỏ thứ Bảy, Chủ nhật; chưa trừ ngày lễ), không để AI tự tính. Không có hạn hoặc hạn đã qua thì để trống. Mỗi đề xuất có dòng giải thích cách tính. Muốn đổi số ngày sớm hơn, sửa `BUFFER_DAYS` trong `Ai.gs`.

### 14.2 Chi phí và quyền riêng tư
- Dùng **Gemini API bản trả phí (bật thanh toán)**. Ở bản trả phí, Google nêu rõ dữ liệu gửi qua API không dùng để huấn luyện mô hình. Bản miễn phí thì có thể bị dùng, **không dùng bản miễn phí cho văn bản của trường**.
- Chi phí mô hình "flash" rất thấp: một văn bản vài trang thường chỉ vài trăm đồng. Hãy đặt **ngân sách hằng tháng** trong Google Cloud (mục 14.3, bước 5).
- Văn bản có dấu **Mật / Tối mật / Tuyệt mật**: không nên tải lên hệ thống này. Nếu lỡ tải, AI không gợi ý nhiệm vụ cho văn bản đó, nhưng nội dung vẫn đã gửi tới Google.
- Chỉ Hiệu trưởng thấy kết quả AI. Nhân viên chỉ thấy văn bản của mình đang "chờ phân loại".

### 14.3 Triển khai từng bước

**Bước 1. Cập nhật mã nguồn trong máy** (phần này đã được cập nhật sẵn trong thư mục dự án). Kiểm tra bằng:

    cd kiem-thu
    node run.js        (kết quả cuối: 0 lỗi)

**Bước 2. Đẩy giao diện lên GitHub** (Cloudflare tự cập nhật sau 1 đến 2 phút):

    git add -A
    git commit -m "Them tro ly AI Gemini"
    git push origin master

**Bước 3. Cập nhật backend trong Apps Script** (làm TRƯỚC khi mở website bản mới, hoặc ngay sau; ít nhất phải làm xong trước khi dùng):
1. Mở dự án Apps Script. Dán lại **toàn bộ** các file: `Code.gs`, `Db.gs`, `Api.gs`, `Docs.gs`, `Setup.gs`. **Tạo file mới `Ai.gs`** (dấu + cạnh "Files" → Script) và dán nội dung `backend/Ai.gs`. `Auth.gs` và `appsscript.json` không đổi.
2. Nhấn **Lưu**. Chọn hàm **`upgrade`** → **Chạy**. Hàm này thêm các cột/sheet còn thiếu (`Agencies` chứa danh sách cơ quan, `AiSuggestions`, `AiFeedback`, các cột `ai_*` của `Documents`, cột `src_doc` của `Tasks`), thêm 11 thẻ loại văn bản mặc định còn thiếu và tạo thư mục `_Cho_xac_nhan`. Chạy lại nhiều lần vẫn an toàn.
3. Lần chạy đầu Google hỏi cấp quyền thêm (kết nối dịch vụ bên ngoài để gọi Gemini): chọn **Review permissions → Allow**. Nếu thấy "chưa xác minh", chọn Advanced → Go to ... (unsafe) → Allow (vì đây là dự án của chính bạn).

**Bước 4. Tạo khóa Gemini API**
1. Vào https://aistudio.google.com bằng tài khoản Google của trường, chọn **Get API key → Create API key**. Nên tạo trong một dự án Google Cloud riêng cho nhà trường.
2. Bật **thanh toán** cho dự án đó (Billing, gắn thẻ thanh toán). Đây là điều kiện để dùng bản trả phí.
3. Sao chép khóa (bắt đầu bằng `AIza...`). **Không gửi khóa qua tin nhắn, email hay dán vào mã nguồn.**

**Bước 5. Đặt ngân sách**: Google Cloud Console → Billing → Budgets & alerts → tạo ngân sách (ví dụ 100.000 đ/tháng) kèm cảnh báo email ở 50% và 90%. Đồng thời có thể đặt hạn mức yêu cầu (quota) thấp cho Gemini API.

**Bước 6. Nhập cấu hình vào Apps Script**: Project Settings (bánh răng) → **Script properties** → Add:

| Tên | Giá trị | Ghi chú |
|---|---|---|
| `GEMINI_API_KEY` | khóa `AIza...` | **Bắt buộc** để bật AI |
| `GEMINI_MODEL` | tùy chọn | Mặc định `gemini-3.6-flash`. Muốn rẻ hơn: `gemini-3.5-flash-lite`. Tên mô hình do Google đổi theo thời gian, xem danh sách tại ai.google.dev, thấy báo lỗi 404 thì đổi tên này, không cần sửa mã |
| `AI_ENABLED` | `false` | Chỉ dùng khi muốn **tắt tạm** AI (xóa dòng này để bật lại) |
| `AI_GUIDE` | tùy chọn | Vài đoạn nói về cách Hiệu trưởng phân loại và giao việc (xem 14.5) |
| `FOLDER_VANBAN` | tùy chọn | Mã thư mục Drive để lưu văn bản. Chỉ đổi khi muốn dùng kho văn bản **có sẵn** của Hiệu trưởng (xem 14.4) |

**Bước 7. Chạy thử AI**: chọn hàm **`aiSelfTest`** → Chạy → xem **Nhật ký thực thi**. Kết quả đúng: loại `Công văn`, cơ quan `03`, có 2 nhiệm vụ và hạn gần 30/11/2026 (sớm hơn 2 ngày, lùi về ngày làm việc). Nếu lỗi, xem 14.6.

**Bước 8. Bật bộ hẹn giờ dự phòng**: chạy hàm **`installAiTrigger`**. Cứ 5 phút hệ thống tự xử lý các văn bản AI chưa đọc xong (ví dụ người dùng đóng trang sớm hoặc Gemini báo bận).

**Bước 9. Triển khai phiên bản mới**: **Deploy → Manage deployments → biểu tượng bút chì → Version: New version → Deploy**. Địa chỉ `/exec` giữ nguyên nên không cần sửa `config.js`.

**Bước 10. Dọn nhiệm vụ đã xóa từ trước (không bắt buộc)**: chạy hàm **`purgeDeletedTasks`**. Hàm xóa chat, lịch sử... của các nhiệm vụ đã "xóa" trước đây, chỉ trong Google Sheets, không đụng tới Drive.

**Bước 11. Thử trên website** (mở bằng Ctrl+F5, đăng nhập bằng tài khoản Hiệu trưởng):
1. **Tải văn bản** → chọn một công văn thật (không mật) → Tải lên → sau 10 đến 30 giây dòng văn bản hiện gợi ý AI.
2. Bấm **Lưu và đồng ý** (đổi ô loại/cơ quan trước nếu AI chọn chưa đúng) → vào Drive kiểm tra tệp đã nằm đúng thư mục `<cơ quan>/<loại>` → mục **Kho văn bản** có văn bản.
3. **Đề xuất nhiệm vụ từ AI** → Xem và giao việc → chọn người → Giao. Mở nhiệm vụ: có dòng **Văn bản nguồn** và nút **Tìm trong kho**.
4. Đăng nhập bằng tài khoản nhân viên: **Kho văn bản** có bộ lọc mã, tên, loại, cơ quan; thử tải một văn bản lên và xem dòng "chờ phân loại".
5. Xóa một nhiệm vụ thử: kiểm tra các sheet `Messages`, `History`, `Submissions`... không còn dòng của nhiệm vụ đó, còn tệp trong Drive vẫn nguyên.

### 14.4 Kho văn bản có sẵn trên Drive của Hiệu trưởng
Hiệu trưởng đang có các thư mục `01_BO_GIAO_DUC_VA_DAO_TAO` ... `09_CHO_PHAN_LOAI`. Hệ thống nhận ra thư mục cơ quan theo **hai chữ số đầu** (01 đến 09) nên dùng được thư mục có sẵn; bên trong tự tạo/dùng thư mục loại (`Cong_van`, `Quyet_dinh`...). Để dùng kho có sẵn:
1. Mở thư mục chứa 9 thư mục đó trong Drive, sao chép mã ở cuối địa chỉ (`.../folders/<MÃ>`).
2. Đặt Script property `FOLDER_VANBAN` = mã đó. Tài khoản chạy Apps Script phải có quyền **chỉnh sửa** thư mục.
3. Văn bản cũ đã nằm sẵn trong kho vẫn ở nguyên chỗ; hệ thống chỉ quản lý văn bản tải qua website.
Nếu thư mục cơ quan chưa có, hệ thống tự tạo theo tên chuẩn (xem `AGENCIES` trong `Code.gs`).

### 14.5 Giúp AI phân loại đúng hơn
- **Tự học từ sửa của Hiệu trưởng:** mỗi lần bạn sửa gợi ý của AI, hệ thống ghi vào sheet `AiFeedback`; 8 lần sửa gần nhất được đưa vào lời nhắc ở các văn bản sau.
- **`AI_GUIDE`:** có thể nhờ ChatGPT tóm tắt cách phân loại/giao việc của Hiệu trưởng thành vài đoạn ngắn (ví dụ "Công văn của Sở về thi đua luôn giao Tổ trưởng; văn bản về tài chính chỉ để biết") rồi dán vào đây (tối đa khoảng 6.000 ký tự).
- Danh sách thẻ do Hiệu trưởng quản lý ở trang **Tải văn bản** (cuối trang). AI chỉ chọn trong các thẻ đang có. Thẻ cũ không dùng (Nghị định, Tài liệu giảng dạy, Hình ảnh / video) có thể xóa nếu không cần.
- Tệp hỗ trợ đọc: PDF, ảnh (PNG/JPG), DOCX, XLSX, PPTX, TXT, CSV. Tệp khác (ví dụ MP4) cần phân loại thủ công. PDF scan (ảnh chụp) vẫn đọc được vì Gemini đọc trực tiếp tệp.

### 14.6 Xử lý sự cố AI
| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Dòng văn bản ghi "AI đang tắt" | Chưa có `GEMINI_API_KEY` hoặc `AI_ENABLED=false` | Kiểm tra Script properties; chạy `aiSelfTest` |
| "Gemini báo lỗi 400" kèm "API key" | Khóa sai | Tạo lại khóa, dán lại |
| "Gemini báo lỗi 404" | Tên mô hình đã đổi | Đặt `GEMINI_MODEL` theo tên mới trong tài liệu Gemini |
| "Gemini đang giới hạn tần suất" (429) | Hết hạn mức / chưa bật thanh toán | Kiểm tra Billing và quota; hệ thống tự thử lại |
| "AI không đọc được" (failed) | Lỗi tạm thời 3 lần liên tiếp | Bấm **Chạy AI**, hoặc tự chọn loại và cơ quan rồi **Lưu và đồng ý** |
| "Hệ thống đang bận" | Nhiều người thao tác cùng lúc | Thử lại sau vài giây |
| Không có nhiệm vụ nào được gợi ý | Văn bản chỉ để biết, hoặc là văn bản Mật | Bình thường |
| Sai loại/cơ quan | AI không chắc (độ tin cậy thấp được ghi chú "nên kiểm tra kỹ") | Đổi ô loại/cơ quan rồi **Lưu và đồng ý**; hệ thống ghi nhớ để lần sau tốt hơn |

Xem lỗi chi tiết: Apps Script → **Executions** (Nhật ký thực thi).

### 14.7 Xóa nhiệm vụ: dữ liệu nào mất, dữ liệu nào giữ
- **Xóa trong Google Sheets:** người được giao, danh sách tệp, kết quả nộp, báo cáo tiến độ, gia hạn, tin nhắn, lịch sử, thông báo của nhiệm vụ.
- **Giữ nguyên trong Drive:** tài liệu giao và mọi tệp nhân viên đã nộp (thư mục `TaiLieuGiao/<mã>` và `NopBai/<mã>`). Muốn dọn Drive, hãy xóa thủ công khi cần.
- **Dòng trong sheet `Tasks`** chỉ còn mã nhiệm vụ (tên và nội dung bị xóa, đánh dấu đã xóa) để **mã không bao giờ cấp lại**; nếu cấp lại, tệp của nhiệm vụ mới sẽ lẫn vào thư mục Drive của nhiệm vụ cũ. Mỗi dòng như vậy rất nhỏ.
- Thao tác **không thể khôi phục** (ngoài bản sao lưu hằng tuần của Sheet).
- Nếu xóa **văn bản**, tệp được chuyển vào thùng rác Drive; các nhiệm vụ đã tạo từ văn bản đó vẫn còn và ghi "văn bản đã bị xóa khỏi kho".

### 14.8 Quay lại nếu có sự cố
- Tắt AI ngay: đặt `AI_ENABLED` = `false`. Website vẫn chạy, mọi văn bản phân loại thủ công.
- Quay về bản cũ: Apps Script → Deploy → Manage deployments → chọn phiên bản cũ. Các cột và sheet mới thêm vào không làm hỏng bản cũ.

### 14.9 Bản ai-6: tài liệu từ kho, xóa văn bản hoàn toàn, tải lên nhanh hơn

1. Dán lại các file `.gs` đã đổi (Api.gs, Code.gs, Db.gs, Docs.gs, Setup.gs), chạy hàm `upgrade` một lần (tạo sheet `TaskDocs`), rồi **Deploy → Manage deployments → bút chì → New version**. Mở địa chỉ `/exec` phải thấy `ai-6`.
2. Giao hoặc sửa nhiệm vụ: ngoài việc tải tệp lên, ô “Hoặc đính kèm văn bản có sẵn trong Kho văn bản” cho tìm theo mã, tên, số ký hiệu và chọn nhiều văn bản (tối đa 10, chỉ văn bản đã phân loại). Người được giao thấy và tải được các văn bản này ở chi tiết nhiệm vụ.
3. Xóa văn bản trong kho: xóa hẳn dòng trong Google Sheets (văn bản, đề xuất AI, liên kết với nhiệm vụ, thông báo, ghi nhận sửa phân loại) và chuyển tệp trong Drive vào thùng rác (khôi phục được 30 ngày). Nhiệm vụ đã giao từ văn bản đó vẫn còn, chỉ mất liên kết. Mã văn bản đã xóa không được cấp lại.
4. Các văn bản đã xóa từ bản cũ (chỉ bị đánh dấu): chạy hàm `purgeDeletedDocs` một lần để xóa hẳn.
5. Tải lên nhanh hơn: tệp được ghi vào Drive ngoài khóa, hệ thống không còn tải lại toàn bộ dữ liệu sau mỗi lần tải lên, trình duyệt đọc tệp bằng cách nhanh hơn. Thời gian còn lại chủ yếu là đường truyền (tệp gửi dạng base64 nên nặng hơn tệp gốc khoảng 1/3) và Apps Script ghi vào Drive.

### 14.10 Bản ai-7: tự dọn dữ liệu cho nhẹ

- Bấm “Bỏ qua” một đề xuất AI: dòng đó bị xóa luôn khỏi sheet `AiSuggestions`.
- Thông báo quá 30 ngày bị xóa hẳn khỏi sheet `Notifications`.
- Chạy hàm `installCleanupTrigger` một lần để mỗi ngày (khoảng 2 giờ sáng) hệ thống tự dọn. Hàm `dailyCleanup` chạy tay được, và cũng dọn luôn các đề xuất “skipped” còn sót từ bản cũ.
- Triển khai: dán lại `Ai.gs`, `Code.gs`, `Setup.gs`, New version, `/exec` phải thấy `ai-7`.
