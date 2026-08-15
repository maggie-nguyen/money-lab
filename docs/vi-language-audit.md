# Audit ngôn ngữ tiếng Việt của MoneyLab

## Phạm vi

Đã rà soát toàn bộ chuỗi tiếng Việt được hiển thị trong:

- 850 chuỗi nội dung trong `content/vi/` (bài viết, khóa học, bài học, ví dụ và câu hỏi kiểm tra).
- Giao diện công khai, đăng nhập, onboarding, thư viện, bài học, mô phỏng, công cụ, trợ giảng và cửa hàng trong `src/app/` và `src/components/`.
- Thông báo lỗi, thông báo trạng thái và nhãn quản trị được trả về từ `src/server/`.

Không rà soát comment kỹ thuật, tên biến, slug, URL hoặc tiêu đề video bên thứ ba, trừ khi chúng được hiển thị cho người học.

## Kết luận ngắn

Nội dung hiện có nhiều đoạn viết tốt: câu ngắn, ví dụ gần với đời sống học sinh và cách xưng hô “bạn” nhất quán. Vấn đề chính là giọng điệu chưa đồng nhất. Một số đoạn giống bài biên tập dành cho học sinh; một số khác giống slogan quảng cáo hoặc lời bình mạng xã hội. Ngoài ra còn có các câu tuyệt đối hóa trong chủ đề tài chính và lừa đảo, có thể làm giảm độ tin cậy hoặc gây hiểu nhầm.

Mức độ ưu tiên:

1. **Cao:** câu khẳng định tuyệt đối về ngân hàng, lừa đảo, thu hồi tiền và lãi suất; cần sửa để chính xác, có trách nhiệm.
2. **Cao:** các câu mang giọng văn “đanh”, ẩn dụ dày hoặc hơi giật tít; cần đưa về giọng người hướng dẫn bình tĩnh.
3. **Vừa:** thuật ngữ giao diện, CTA và nhãn bảng chưa tự nhiên hoặc chưa nhất quán.
4. **Thấp:** chuẩn hóa chính tả, dấu câu, cách viết tỷ lệ, cách dùng “mỗi tháng/hằng tháng” và “app/ứng dụng”.

## Các lỗi và đề xuất sửa tiêu biểu

### Nội dung khóa học và bài viết

| Vị trí | Hiện tại | Đề xuất |
|---|---|---|
| `content/vi/.../vay-no-va-lua-dao.json` – mục tiêu khóa học | `Nhận ra sáu dấu hiệu chung của mọi trò lừa` | `Nhận diện sáu dấu hiệu thường gặp trong các vụ lừa đảo` |
| Cùng file | `Biết đúng thứ tự việc cần làm trong giờ đầu sau khi lỡ chuyển tiền` | `Biết cần làm gì trong giờ đầu sau khi chuyển tiền nhầm` |
| `articles.json` – bài tin nhắn lừa đảo | `Năm dấu hiệu của một tin nhắn lừa đảo` | `Năm dấu hiệu nhận biết tin nhắn lừa đảo` |
| Cùng bài | `Kẻ lừa đảo không cần bạn thiếu hiểu biết, chúng chỉ cần bạn vội.` | `Kẻ lừa đảo không cần bạn thiếu hiểu biết; chúng chỉ cần bạn mất cảnh giác.` |
| Cùng bài | `Đây là năm dấu hiệu nhận ra trước khi kịp bấm vào liên kết.` | `Dưới đây là năm dấu hiệu giúp bạn nhận ra rủi ro trước khi bấm vào liên kết.` |
| Cùng bài | `Khi tim đập nhanh, khả năng đối chiếu và kiểm chứng gần như ngừng hoạt động.` | `Khi hoảng hốt, chúng ta thường khó kiểm tra và đối chiếu thông tin.` |
| Cùng bài | `Phần thưởng không có nguồn gốc` | `Phần thưởng không rõ nguồn gốc` |
| Cùng bài | `Ngân hàng nhắn qua Zalo cá nhân, công an gọi video...` | `Người gọi tự xưng là ngân hàng hoặc công an qua kênh cá nhân...` |
| Bài trả góp 0% | `Trả góp 0% có thật sự 0 đồng không?` | `Trả góp 0% có thật sự miễn phí không?` |
| Cùng bài | `những khoản còn lại thường không được in to như vậy` | `những khoản còn lại thường không được quảng cáo nổi bật như vậy` |
| Cùng bài | `con số này quanh mức 25% một năm` | `con số này xấp xỉ 25% một năm` |
| Bài tiết kiệm | `Ý chí thì có lúc cạn, còn một hệ thống đã cài đặt sẵn thì cứ thế chạy đều.` | `Đừng chỉ dựa vào ý chí. Hãy cài đặt một hệ thống tự động để việc tiết kiệm diễn ra đều đặn.` |
| Bài lãi kép | `Ai cũng từng nghe câu lãi kép là kỳ quan thứ tám của thế giới.` | `Bạn có thể đã nghe lãi kép được ví như “kỳ quan thứ tám”. Điều quan trọng là xem nó tác động thế nào đến khoản tiền của bạn.` |
| Bài thẻ tín dụng | `đó là phần duy nhất miễn phí trong cả câu chuyện` | `đó là khoảng thời gian duy nhất không bị tính lãi` |
| Bài app vay | `Quảng cáo vay nhanh gần như không bao giờ nói...` | `Quảng cáo vay nhanh thường không nêu...` |
| Bài nhận diện lừa đảo | `Mọi trò lừa đều sống nhờ việc bạn quyết định trong lúc mất bình tĩnh.` | `Nhiều vụ lừa đảo dựa vào việc bạn phải quyết định khi đang mất bình tĩnh.` |
| Bài sau khi bị lừa | `Sau một ngày, cơ hội gần như không còn.` | `Sau một ngày, khả năng thu hồi thường giảm đáng kể.` |
| Bài sau khi bị lừa | `Ngoài ngân hàng và cơ quan công an thì không ai lấy lại được tiền cho bạn.` | `Hãy chỉ làm việc với ngân hàng và cơ quan công an; đừng chuyển phí cho dịch vụ tự xưng hỗ trợ thu hồi tiền.` |

Các câu ở nhóm cuối cần ưu tiên vì đây là hướng dẫn xử lý sự cố tài chính. Không nên biến một xu hướng thường gặp thành quy luật tuyệt đối.

### Giao diện và CTA

| Vị trí | Hiện tại | Đề xuất |
|---|---|---|
| `src/app/page.tsx` | `Tập ra quyết định trong tình huống giống thật` | `Luyện ra quyết định qua các tình huống mô phỏng` |
| `src/components/AppShell.tsx` | `Sổ cái tài chính` | `Tài chính cá nhân` hoặc chỉ giữ `MoneyLab` |
| `src/components/AppShell.tsx` | `Đổi giao diện sáng tối` | `Chuyển giao diện sáng/tối` |
| `src/components/lesson/Blocks.tsx` | `Trả góp vay` | `Tính khoản trả góp` |
| `src/app/(app)/sims/loans/[sessionId]/page.tsx` | `Phí đầu` | `Phí ban đầu` |
| Cùng file | `Trả/tháng` | `Trả mỗi tháng` |
| Cùng file | `So sánh để xem` | `Bấm “So sánh” để xem` |
| Cùng file | `Chọn vay` | `Chọn khoản vay` |
| `src/app/(app)/admin/page.tsx` | `Đăng ký khóa học đang hoạt động` | `Lượt đăng ký khóa học đang hoạt động` |
| `src/app/(app)/lesson/[slug]/page.tsx` | `Không hoàn thành được bài học, thử lại.` | `Không thể hoàn thành bài học. Vui lòng thử lại.` |

Các CTA nên bắt đầu bằng động từ rõ ràng và dùng một hệ thống nhất quán: `Mở bài học`, `Mở công cụ`, `Mở mô phỏng`, `Xem khóa học`.

## Quy tắc giọng điệu đề xuất

- Xưng hô: dùng `bạn`; người hướng dẫn bình tĩnh, tôn trọng, không phán xét.
- Ưu tiên câu chủ động, một ý mỗi câu; tránh liên tiếp nhiều câu ngắn mang tính khẩu hiệu.
- Dùng ẩn dụ vừa phải. Các câu như “tiền tự tìm được lối ra”, “ở phía phải trả”, “mọi trò lừa đều sống nhờ...” nên chuyển thành giải thích trực tiếp ở các đoạn kiến thức cốt lõi.
- Tránh tuyệt đối hóa: hạn chế `luôn`, `không bao giờ`, `ai cũng`, `chỉ có`, `chắc chắn`, `gần như không còn` nếu không có điều kiện đi kèm.
- Dùng `ứng dụng` trong nội dung hướng dẫn; chỉ dùng `app` khi nói về cách người dùng thường gọi hoặc khi cần giữ đúng ngữ cảnh quảng cáo.
- Dùng `tỷ lệ` thống nhất trong văn bản học thuật; giữ `mỗi tháng` cho nhãn/số liệu ngắn và `hằng tháng` trong câu văn.
- Dùng `tiết kiệm` cho khái niệm tài chính; dùng `để dành` trong ví dụ thân mật, không trộn hai từ trong cùng một định nghĩa.
- Với lãi suất, nói rõ đây là lãi suất danh nghĩa hay mức quy đổi đơn giản; không gọi mọi phép nhân theo tháng là “lãi suất thực”.

## Thứ tự xử lý đề xuất

1. Sửa các câu tuyệt đối và hướng dẫn xử lý lừa đảo/tín dụng.
2. Sửa tiêu đề, mô tả khóa học và bài viết để thống nhất giọng người hướng dẫn.
3. Chuẩn hóa CTA, nhãn bảng và thông báo lỗi trong giao diện.
4. Biên tập lại từng bài theo cùng một mẫu: mở bài trực tiếp, giải thích, ví dụ, câu hỏi, tóm tắt.
5. Sau khi sửa, đọc thử trên giao diện ở cả desktop và mobile; nội dung tự nhiên trong JSON vẫn có thể bị gãy khi hiển thị trong nhãn hoặc nút ngắn.

