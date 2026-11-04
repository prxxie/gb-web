---

SRS: Game Bắn Súng Đạn Đạo Theo Lượt (PWA Mobile)

1. Giới thiệu

1.1 Mục đích

Tài liệu này đặc tả các yêu cầu chức năng và phi chức năng cho một trò chơi điện tử nhiều người chơi, thể loại bắn súng đạn đạo theo lượt (turn-based artillery), chạy trực tiếp trên trình duyệt di động dưới dạng Ứng dụng Web Tiến bộ (PWA). Trò chơi lấy cảm hứng từ cơ chế điều khiển và vật lý của Gunbound nhưng sử dụng đồ họa, bản đồ và nội dung hoàn toàn mới.

1.2 Phạm vi

Hệ thống bao gồm:

· Một ứng dụng PWA phía client chạy trên trình duyệt di động (iOS Safari, Android Chrome).
· Logic trò chơi (mô phỏng đạn đạo, điều khiển cảm ứng, render) chạy hoàn toàn trên client.
· Một backend signaling mỏng trên Cloudflare Workers + Durable Objects để quản lý phòng và bắt tay WebRTC.
· Giao tiếp trạng thái trò chơi giữa những người chơi qua WebRTC DataChannel (P2P), với một người chơi đóng vai trò host có thẩm quyền.
· Dịch vụ TURN của Cloudflare làm phương án dự phòng khi kết nối P2P trực tiếp thất bại.

1.3 Định nghĩa và từ viết tắt

Thuật ngữ Định nghĩa
PWA Progressive Web App – ứng dụng web có thể cài đặt, hỗ trợ offline
Host Người chơi (trình duyệt) chạy mô phỏng vật lý có thẩm quyền trong một trận đấu
Peer Người chơi khác trong phòng, gửi input đến Host và nhận snapshot từ Host
DO Durable Object – đối tượng có trạng thái, duy nhất theo phòng, chạy trên Cloudflare
DataChannel Kênh truyền dữ liệu hai chiều qua WebRTC
TURN Traversal Using Relays around NAT – relay dự phòng khi P2P thất bại
Snapshot Gói dữ liệu chứa trạng thái trò chơi tại một thời điểm
Tick Một bước cập nhật vật lý trong vòng lặp trò chơi

---

2. Mô tả tổng thể

2.1 Bối cảnh sản phẩm

Trò chơi là một PWA độc lập, không phụ thuộc vào cửa hàng ứng dụng. Người dùng truy cập qua URL, có thể "Thêm vào màn hình chính" để chạy toàn màn hình. Trải nghiệm hướng đến các trận đấu turn-based 1v1 hoặc 2v2, thời lượng ngắn (3–10 phút), phù hợp với các phiên chơi trên di động.

2.2 Chức năng chính

· Sảnh chờ và tạo phòng: Người chơi tạo phòng với mã 6 ký tự hoặc tham gia bằng mã.
· Bắt tay WebRTC: Durable Object làm trung gian signaling để thiết lập kết nối P2P giữa Host và các Peer.
· Điều khiển cảm ứng: Kéo-thả để ngắm và điều chỉnh lực bắn; joystick ảo để di chuyển nhân vật (nếu có).
· Mô phỏng đạn đạo: Tính toán quỹ đạo đạn dựa trên góc, lực, gió và trọng lực; hiển thị vòng cung ngắm.
· Đồng bộ trạng thái P2P: Host gửi snapshot đến các Peer; Peer gửi input đến Host qua DataChannel.
· Host migration: DO bầu Host mới nếu Host hiện tại mất kết nối.
· Chơi offline (single-player): Chế độ luyện tập với AI hoặc màn chơi tĩnh, không cần mạng.

2.3 Môi trường hoạt động

· Client: Trình duyệt di động (iOS 16+, Android 12+), hỗ trợ WebGL/WebGPU (Phaser 4 tự động chọn renderer phù hợp).
· Backend: Cloudflare Workers (free tier: 100.000 request/ngày), Durable Objects (free tier: 1 triệu request/tháng).
· Mạng: WebRTC DataChannel; STUN miễn phí không giới hạn; TURN free tier 1.000 GB/tháng (dùng chung với SFU nếu có).

2.4 Ràng buộc thiết kế

· Không chạy mô phỏng vật lý trên Worker: Giới hạn 10ms CPU/lần gọi của Workers free tier không đủ cho tính toán đạn đạo. Toàn bộ vật lý chạy trên trình duyệt của Host.
· Không dùng WebSocket cho gameplay: Workers free tier không hỗ trợ WebSocket. Gameplay đi qua WebRTC DataChannel; signaling có thể dùng WebSocket qua Durable Object nếu cần, nhưng ưu tiên HTTP/HTTPS đơn giản.
· PWA trên iOS: Để WebRTC hoạt động ổn định trong PWA, không thêm thẻ meta apple-mobile-web-app-capable. Chấp nhận mở trong tab Safari thay vì chế độ standalone toàn màn hình.
· Kích thước vùng chạm: Tối thiểu 44×44 pixel logic (theo chuẩn Apple), khuyến nghị 60×60+ cho các nút điều khiển chính.

2.5 Giả định và phụ thuộc

· Người chơi có kết nối internet ổn định để tải game lần đầu và tham gia multiplayer.
· Trình duyệt hỗ trợ WebRTC (tất cả trình duyệt di động hiện đại).
· Tài khoản Cloudflare đã bật dịch vụ Realtime TURN (yêu cầu phương thức thanh toán, nhưng 1.000 GB đầu tiên miễn phí).

---

3. Yêu cầu chức năng

FR-01: Tạo và tham gia phòng

· Mô tả: Người chơi có thể tạo phòng mới hoặc tham gia phòng hiện có bằng mã 6 ký tự.
· Xử lý: Yêu cầu được gửi đến Worker; Worker định tuyến đến Durable Object tương ứng với mã phòng. DO duy trì danh sách người chơi, trạng thái phòng (đang chờ, đang chơi, kết thúc).
· Đầu ra: Người chơi nhận được thông tin phòng và bắt đầu quá trình signaling.

FR-02: Signaling WebRTC và bầu Host

· Mô tả: DO làm trung gian trao đổi SDP offer/answer và ICE candidate giữa Host và các Peer. DO bầu một người chơi làm Host (người tạo phòng hoặc người đầu tiên tham gia).
· Xử lý: DO chuyển tiếp các gói signaling giữa các bên. Sau khi kết nối P2P được thiết lập, dữ liệu trò chơi đi trực tiếp, không qua DO.
· Ngoại lệ: Nếu Host rời phòng, DO bầu Host mới và thông báo đến tất cả Peer.

FR-03: Điều khiển cảm ứng

· Mô tả: Người chơi điều khiển nhân vật và vũ khí bằng thao tác chạm.
· Cơ chế:
  · Kéo-thả để ngắm: Kéo từ nhân vật theo hướng ngược lại để điều chỉnh góc và lực; vòng cung quỹ đạo dự kiến hiển thị theo thời gian thực.
  · Thanh trượt lực (tùy chọn): Một thanh trượt dọc hoặc ngang để tinh chỉnh lực bắn.
  · Joystick ảo (nếu có di chuyển): Sử dụng thư viện nipplejs hoặc cơ chế addPointer(2) của Phaser để hỗ trợ đa điểm chạm.
· Phản hồi: Nút và vùng chạm phải có phản hồi hình ảnh (thay đổi màu, scale) ngay khi chạm.

FR-04: Mô phỏng đạn đạo

· Mô tả: Khi người chơi xác nhận bắn, Host tính toán quỹ đạo đạn theo các tham số: góc bắn, lực bắn, vector gió hiện tại, trọng lực của map.
· Công thức tham khảo (từ cộng đồng Gunbound):
  · Vận tốc ban đầu: vx = trunc(cos(angle) * force * 512) / 100, vy = trunc(sin(angle) * force * 512) / 100.
  · Ảnh hưởng gió: windX = trunc(cos(windAngle) * windPower) * 256 / 100, windY = (gravity - trunc(sin(windAngle) * windPower)) * 256 / 100.
  · Cập nhật mỗi tick: vx += windX, vy += gravity + windY.
· Xử lý va chạm: Kiểm tra va chạm với địa hình và nhân vật; kết thúc đường bay khi trúng mục tiêu hoặc ra khỏi biên bản đồ.
· Hiệu ứng: Particle cho vụ nổ, trail cho đạn (sử dụng hệ thống particle của Phaser, hạn chế filter nặng trên mobile).

FR-05: Đồng bộ trạng thái P2P

· Mô tả: Host gửi snapshot trạng thái trò chơi (vị trí, máu, lượt đi, trạng thái đạn) đến tất cả Peer qua DataChannel. Peer gửi input (góc, lực, hành động) đến Host.
· Kênh truyền:
  · Control channel: Reliable, ordered – dùng cho sự kiện quan trọng (bắt đầu trận, kết thúc lượt, chat).
  · State channel: Unreliable, unordered (maxRetransmits: 0) – dùng cho snapshot và input.
· Tần suất: Snapshot gửi ở 10–20 Hz (đủ mượt cho turn-based); input gửi ngay khi người chơi thao tác.
· Kích thước gói: Snapshot nhỏ (< 500 bytes) nhờ lược bỏ dữ liệu không cần thiết và lượng tử hóa vị trí.

FR-06: Host Migration

· Mô tả: Nếu Host mất kết nối (đóng tab, mất mạng), DO phát hiện và bầu một Peer làm Host mới.
· Xử lý: DO thông báo đến tất cả Peer; Peer mới nhận trách nhiệm mô phỏng vật lý. Trạng thái trò chơi được khôi phục từ snapshot gần nhất (có thể lưu tạm trong bộ nhớ DO hoặc Peer).
· Ràng buộc: Host migration chỉ áp dụng cho trận đấu đang diễn ra; không ảnh hưởng đến phòng đang chờ.

FR-07: Chế độ offline (PWA)

· Mô tả: Người chơi có thể tải và chơi chế độ single-player (luyện tập với AI hoặc màn chơi tĩnh) mà không cần kết nối mạng sau lần tải đầu.
· Cơ chế: Service Worker cache các asset cần thiết (HTML, JS, hình ảnh, âm thanh, map). Khi offline, game khởi động ở chế độ local; multiplayer bị vô hiệu hóa.
· Chiến lược cache: Ưu tiên cache theo manifest có hash; entry HTML và manifest dùng network-first hoặc stale-while-revalidate để đảm bảo cập nhật.

---

4. Yêu cầu phi chức năng

NFR-01: Hiệu năng

· Render: Đạt 60 FPS ổn định trên thiết bị tầm trung (ví dụ: iPhone 12, Samsung Galaxy A52) với canvas 2D đơn giản, ít particle. Phaser tự động chọn WebGL/WebGPU khi có sẵn.
· Độ trễ input: Phản hồi chạm < 100ms (cảm nhận).
· Bộ nhớ: Dung lượng RAM sử dụng < 200MB trên mobile.
· Kích thước gói tải: < 5MB cho lần tải đầu (không tính asset tùy chọn).

NFR-02: Khả năng mở rộng và giới hạn free tier

· Workers: < 100.000 request/ngày. Signaling chỉ dùng khi tạo phòng/bắt tay; gameplay không tốn request.
· Durable Objects: < 1 triệu request/tháng. Mỗi phòng hoạt động trong thời gian ngắn, DO tự động giải phóng khi không còn người.
· TURN: < 1.000 GB/tháng. Game turn-based tiêu thụ rất ít băng thông TURN (chỉ gói input/snapshot nhỏ), nên giới hạn này rất thoải mái.

NFR-03: Độ tin cậy và khả dụng

· Kết nối P2P: Ưu tiên kết nối trực tiếp; TURN chỉ dùng khi P2P thất bại (khoảng 8–15% trường hợp).
· Host migration: Hoàn tất trong < 5 giây kể từ khi phát hiện Host mất kết nối.
· Uptime: Phụ thuộc vào Cloudflare; không có server tự vận hành.

NFR-04: Bảo mật

· Signaling: DO xác thực người chơi qua token phiên ngắn hạn; không lưu trữ lâu dài.
· TURN credentials: DO cấp ICE server credentials tạm thời (lease 1 giờ) cho từng Peer khi được yêu cầu, không cache, không log.
· Dữ liệu P2P: WebRTC mã hóa end-to-end bằng DTLS; Cloudflare TURN không thể đọc nội dung.

NFR-05: Khả năng sử dụng trên di động

· Vùng chạm: Tối thiểu 44×44 pixel logic; khoảng cách giữa các vùng chạm ≥ 8px.
· Định hướng: Hỗ trợ cả dọc và ngang; Scale Manager cấu hình Phaser.Scale.FIT để giữ tỉ lệ khung hình.
· Ngăn chặn cử chỉ trình duyệt: Vô hiệu hóa pinch-zoom, double-tap zoom, kéo trang trên canvas game.

NFR-06: Khả năng bảo trì

· Tách biệt logic: Logic mô phỏng vật lý và logic mạng độc lập với Phaser scene; có thể unit test riêng.
· Cấu hình: Các tham số vật lý (gravity, wind strength, damage) được định nghĩa trong file cấu hình JSON, dễ điều chỉnh mà không sửa code.

---

5. Kiến trúc hệ thống

5.1 Sơ đồ thành phần

```
┌─────────────────────────────────────────────────────────┐
│  Trình duyệt di động (PWA)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Phaser 4    │  │ Touch Input │  │ Local Storage   │  │
│  │ (Render)    │◄─┤ Handler     │  │ (IndexedDB)     │  │
│  └──────┬──────┘  └─────────────┘  └─────────────────┘  │
│         │                                                │
│  ┌──────▼──────────────────────────────────────────────┐ │
│  │ Game Logic Layer                                   │ │
│  │  - Ballistics Simulator                            │ │
│  │  - Turn Manager                                    │ │
│  │  - State Machine (Host / Peer)                     │ │
│  └──────┬──────────────────────────────────────────────┘ │
│         │                                                │
│  ┌──────▼──────────────┐  ┌───────────────────────────┐  │
│  │ WebRTC DataChannel  │  │ Service Worker (PWA)      │  │
│  │ (Control + State)   │  │ - Cache assets            │  │
│  └──────┬──────────────┘  │ - Offline fallback        │  │
│         │                 └───────────────────────────┘  │
└─────────┼────────────────────────────────────────────────┘
          │ (P2P, direct or via TURN)
          │
┌─────────▼────────────────────────────────────────────────┐
│  Cloudflare Edge                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Worker (Signaling Router)                          │  │
│  │  - Room create/join                                │  │
│  │  - Route to Durable Object                         │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                    │
│  ┌──────────────────▼─────────────────────────────────┐  │
│  │ Durable Object (per Room)                          │  │
│  │  - Player membership                               │  │
│  │  - WebRTC signaling relay                          │  │
│  │  - Host election & migration                       │  │
│  │  - TURN credential minting                         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Cloudflare Realtime TURN (fallback)                │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

5.2 Luồng signaling

1. Client A tạo phòng → Worker → DO khởi tạo.
2. Client B tham gia → Worker → DO thêm vào danh sách.
3. DO bầu Client A làm Host, gửi thông báo.
4. Host và Peer trao đổi SDP/ICE qua DO.
5. Kết nối P2P được thiết lập; DO không còn tham gia vào gameplay.
6. Host gửi snapshot; Peer gửi input qua DataChannel.

5.3 Luồng host migration

1. DO phát hiện Host mất kết nối (timeout WebSocket/HTTP).
2. DO chọn Peer có thời gian kết nối lâu nhất làm Host mới.
3. DO gửi thông báo host_migrated đến tất cả Peer.
4. Peer mới khôi phục trạng thái từ snapshot gần nhất (nếu có) và tiếp tục mô phỏng.

---

6. Thiết kế dữ liệu

6.1 Cấu trúc phòng (trong Durable Object)

```typescript
interface RoomState {
  code: string;                    // 6 ký tự
  hostId: string | null;           // ID người chơi là host
  players: PlayerInfo[];           // tối đa 4 người
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
  lastActivityAt: number;
}

interface PlayerInfo {
  id: string;
  displayName: string;
  joinedAt: number;
  isHost: boolean;
  connectionState: 'connected' | 'disconnected';
}
```

6.2 Định dạng gói tin DataChannel

Loại gói Kênh Mô tả Kích thước điển hình
input Control (reliable) Góc, lực, hành động ~16 bytes
snapshot State (unreliable) Vị trí đạn, máu, lượt ~200–400 bytes
event Control (reliable) Bắt đầu trận, kết thúc lượt, chat < 100 bytes
host_migrate Control (reliable) Thông báo host mới < 50 bytes

6.3 Cấu hình vật lý (JSON)

```json
{
  "gravity": 0.35,
  "windMultiplier": 0.08,
  "maxForce": 100,
  "minForce": 0,
  "projectileMass": 1.0,
  "mapBounds": { "width": 2000, "height": 1200 }
}
```

---

7. Giao diện người dùng (tóm tắt)

7.1 Màn hình chính

· Nút "Tạo phòng" và "Tham gia phòng" (nhập mã).
· Nút "Chơi offline" (nếu đã cache).
· Hiển thị trạng thái mạng (online/offline).

7.2 Màn hình trận đấu

· Canvas game: Chiếm phần lớn màn hình, hiển thị bản đồ, nhân vật, đạn, hiệu ứng.
· HUD trên cùng: Máu, lượt đi hiện tại, thông tin gió (hướng và cường độ).
· Vùng điều khiển dưới cùng:
  · Vòng cung ngắm (kéo-thả).
  · Thanh lực (nếu dùng).
  · Nút "Bắn" (xác nhận).
  · Nút "Bỏ lượt" (nếu có).
· Chat (tùy chọn): Icon mở khung chat nhỏ, gửi tin nhắn nhanh.

7.3 Màn hình kết thúc

· Hiển thị người thắng, thống kê (sát thương, số phát bắn).
· Nút "Chơi lại" (tạo phòng mới) và "Về nhà".

---

8. Kế hoạch triển khai (tóm tắt)

Giai đoạn Nội dung chính Thời gian ước tính
P1: Prototype offline Phaser scene, điều khiển cảm ứng, mô phỏng đạn đạo cơ bản, một map tĩnh. Không có mạng. 1–2 tuần
P2: Signaling & P2P Worker + DO cho phòng và signaling; WebRTC DataChannel; Host/Peer logic; host migration. 1–2 tuần
P3: PWA & Mobile polish Service Worker, manifest, cache asset; tối ưu touch; xử lý iOS Safari; kiểm thử trên thiết bị thật. 1 tuần
P4: Nội dung & cân bằng Thêm map, nhân vật, vũ khí; tinh chỉnh tham số vật lý; chế độ offline với AI. 1–2 tuần
P5: Kiểm thử & ra mắt Kiểm thử tải (nhiều phòng đồng thời), kiểm tra giới hạn free tier, deploy lên Cloudflare Pages. 1 tuần

---

9. Rủi ro và biện pháp giảm thiểu

Rủi ro Tác động Giảm thiểu
WebRTC không hoạt động trong PWA standalone trên iOS Người chơi không thể multiplayer Bỏ thẻ meta apple-mobile-web-app-capable; chấp nhận mở trong tab Safari
TURN vượt 1.000 GB Chi phí phát sinh Giám sát usage; tối ưu kích thước gói; ưu tiên P2P trực tiếp
DO vượt 1 triệu request/tháng Phòng không tạo được Signaling chỉ dùng khi cần; giới hạn tần suất tạo phòng; monitor
Host migration thất bại Trận đấu bị treo Lưu snapshot định kỳ trong DO; timeout ngắn (3–5s); fallback kết thúc trận
Hiệu năng render trên thiết bị yếu Giật, lag Hạn chế particle; dùng texture atlas; test trên thiết bị tầm trung; cung cấp tùy chọn giảm hiệu ứng

---

Tài liệu này là cơ sở để bắt tay vào triển khai. Mọi thay đổi về sau cần được cập nhật vào các phần tương ứng.