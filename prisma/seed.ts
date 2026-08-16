 
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash as argonHash } from "@node-rs/argon2";
import { prisma } from "../src/server/db";
import { env } from "../src/server/config";
import { uuidv7 } from "../src/server/lib/ids";
import { SIM_SEEDS } from "../src/server/engines/defaultConfigs";
import { importBundle } from "../src/server/services/contentImport";
import { z } from "zod";
import { blockSchema, localeSchema, slugSchema } from "../src/server/schemas/content";
import type { Prisma } from "@prisma/client";

// Idempotent seed - safe to re-run (upserts everywhere). Doc 02 §seed requirements.

/**
 * Library articles are authored in content/vi/articles.json and validated here
 * with the same block schema the admin CMS enforces, so a malformed seed fails
 * loudly instead of writing blocks the renderer cannot draw.
 */
const articleSeedSchema = z.object({
  slug: slugSchema,
  category: z.enum(["GUIDE", "EXPLAINER", "NEWS", "STORY"]),
  readMinutes: z.number().int().min(1).max(60),
  authorName: z.string().min(1).max(80),
  relatedCourseSlug: slugSchema.optional(),
  publishedDaysAgo: z.number().int().min(0).max(3650),
  i18n: z.record(
    localeSchema,
    z.object({
      title: z.string().min(1).max(200),
      summary: z.string().max(500),
      seoTitle: z.string().max(70),
      seoDescription: z.string().max(160),
      blocks: z.array(blockSchema).min(1).max(60),
    }),
  ),
});
type ArticleSeed = z.infer<typeof articleSeedSchema>;

const SCAM_TEXT_BUNDLE = {
  // Recognition cues only - no reusable perpetration detail (doc 05 §7 checklist).
  msg_bank_otp: { sender: "TB-NGANHANG", text: "Tai khoan cua ban se bi KHOA trong 2h. Xac minh ngay tai vn-bank-verify.top va nhap ma OTP de mo khoa." },
  msg_real_promo: { sender: "shop@thegioididong.com", text: "Chương trình khuyến mãi tháng 8: giảm đến 20% phụ kiện. Xem chi tiết tại website chính thức hoặc cửa hàng gần nhất." },
  msg_invest_30pct: { sender: "Nhóm Đầu Tư VIP 888", text: "Cam kết lợi nhuận 30%/tháng, CHẮC CHẮN thắng. Rủ thêm 2 bạn vào nhóm để được nâng hạng VIP nhận thưởng." },
  msg_parcel_fee: { sender: "GiaoHang24", text: "Buu kien cua ban dang giu tai kho. Thanh toan phi luu kho 20.000d qua lien ket sau de nhan hang trong hom nay." },
  msg_real_bank_notice: { sender: "Vietcombank", text: "Quy khach vua thanh toan 150.000 VND tai CIRCLE K. So du: 1.250.000 VND. Neu khong phai ban, lien he tong dai in tren mat sau the." },
  msg_fake_police: { sender: "So dien thoai la", text: "Toi la can bo cong an. Ban lien quan den mot vu an. Tuyet doi giu bi mat va chuyen tien vao tai khoan tam giu de phuc vu dieu tra NGAY." },
  msg_job_like_video: { sender: "Tuyen dung online", text: "Viec nhe luong cao: like video nhan 50k/video. Nap truoc 200k phi kich hoat tai khoan de bat dau nhan nhiem vu." },
  msg_real_school_fee: { sender: "phongtaivu@truong.edu.vn", text: "Thông báo: học phí học kỳ 1 nộp qua cổng thanh toán chính thức của trường trước ngày 15/9. Chi tiết trong sổ liên lạc điện tử." },
  msg_lottery_win: { sender: "GIAI-THUONG", text: "Chuc mung! So dien thoai cua ban TRUNG THUONG xe SH 150i. Dong phi nhan thuong 1.500.000d de hoan tat ho so." },
  msg_real_delivery: { sender: "GHN", text: "Don hang GHN123456 se giao trong hom nay boi tai xe Minh (09xx). Vui long chu y dien thoai. Khong thu them phi ngoai COD da bao." },
  msg_bank_upgrade_link: { sender: "TB-BANK", text: "He thong nang cap the tu. Bam vao lien ket bank-vn-update.xyz de cap nhat thong tin trong 24h, neu khong the se bi vo hieu." },
  msg_friend_borrow_fb: { sender: "Tài khoản FB bạn thân", text: "Ê cậu, mình đang kẹt chút, chuyển giúp mình 2 triệu vào số tài khoản NÀY nhé (số mới của mình), tối mình gửi lại liền." },
  msg_real_promo_momo: { sender: "MoMo", text: "Hoàn 10% tối đa 20k khi thanh toán hóa đơn điện nước lần đầu trên MoMo. Ưu đãi tự động áp dụng, không cần nhập mã." },
  msg_crypto_double: { sender: "Telegram Signal Pro", text: "Sự kiện x2 tài sản trong 48h! Chuyển coin vào ví chương trình, nhận lại GẤP ĐÔI. Chỉ còn 30 suất cuối." },
  msg_real_bill_reminder: { sender: "EVN HCMC", text: "Nhac nho: hoa don tien dien thang 7 cua quy khach den han 25/8. Thanh toan qua app ngan hang hoac diem thu ho." },
  msg_hui_invite: { sender: "Dì Tư (Zalo)", text: "Con vô dây hụi với dì nha, góp 2 triệu/tháng, hốt chót lời chắc 15%, dì làm chủ hụi uy tín mấy chục năm." },
  msg_visa_lottery: { sender: "us-visa-winner@mail.ru", text: "Congratulations! You won US Green Card lottery. Pay processing fee $200 to claim. Reply urgent." },
  msg_real_2fa_notice: { sender: "no-reply@google.com", text: "Mã xác minh Google của bạn là 683 205. Không chia sẻ mã này với bất kỳ ai, kể cả người tự xưng là Google." },
  msg_loan_instant: { sender: "VayNhanh247", text: "Vay 10 trieu KHONG can giay to, giai ngan 15 phut. Lai chi 3.000d/trieu/ngay. Ket ban Zalo de nhan tien ngay." },
  msg_real_survey: { sender: "khaosat@moneylab.vn", text: "Cảm ơn bạn đã học tại MoneyLab! Dành 2 phút cho khảo sát trải nghiệm (không yêu cầu thông tin cá nhân hay thanh toán)." },
  msg_sim_swap: { sender: "Tong dai la", text: "Chao anh/chi, em goi tu nha mang. Sim cua minh sap bi khoa do loi he thong, anh/chi doc giup em ma OTP vua gui de giu so." },
  msg_real_refund: { sender: "Shopee", text: "Yêu cầu hoàn tiền đơn #SPE998 đã được chấp nhận. Tiền sẽ về ShopeePay trong 24h. Không cần thao tác thêm." },
  msg_gov_subsidy: { sender: "TB-CHINHPHU", text: "Ban thuoc dien nhan ho tro 2.400.000d. Truy cap chinh-phu-hotro.site va dien so CCCD + so the ngan hang de nhan tien." },
  msg_real_event_ticket: { sender: "ticketbox@ticketbox.vn", text: "Vé sự kiện 'Ngày hội tài chính trẻ' của bạn đã sẵn sàng. Mã QR đính kèm email - xuất trình khi vào cổng." },
  cue_urgent: "Tạo áp lực thời gian gấp",
  cue_link_odd: "Đường link lạ, không phải tên miền chính thức",
  cue_asks_otp: "Yêu cầu cung cấp mã OTP",
  cue_guaranteed_return: "Cam kết lợi nhuận chắc chắn, cao bất thường",
  cue_pressure_recruit: "Ép rủ thêm người tham gia",
  cue_unexpected_parcel: "Bưu kiện bạn không hề đặt",
  cue_small_fee_first: "Đòi phí nhỏ trước khi nhận thứ lớn",
  cue_authority_pressure: "Giả danh cơ quan quyền lực để đe dọa",
  cue_secrecy: "Bắt giữ bí mật, không cho hỏi ai",
  cue_transfer_now: "Ép chuyển tiền ngay lập tức",
  cue_easy_money: "Việc quá dễ, lương quá cao bất thường",
  cue_deposit_first: "Bắt nạp tiền trước khi được nhận việc/thưởng",
  cue_never_entered: "Trúng thưởng chương trình chưa từng tham gia",
  cue_fee_to_claim: "Đòi đóng phí để nhận thưởng",
  cue_odd_wording: "Giọng văn khác thường so với người quen",
  cue_new_account_number: "Số tài khoản \"mới\" khác mọi lần",
  cue_friend_pressure: "Dựa vào quan hệ thân quen để gây áp lực",
  cue_odd_sender: "Địa chỉ người gửi bất thường",
  cue_no_paperwork: "Không cần giấy tờ - dấu hiệu cho vay phi pháp",
  cue_daily_interest: "Lãi tính theo NGÀY - quy đổi ra năm là mức cắt cổ",
  cue_urgency_network: "Giả danh nhà mạng tạo tình huống khẩn",
  cue_personal_info_ask: "Hỏi CCCD/số thẻ - thông tin không ai được hỏi qua tin nhắn",

  // Lời giải hiện ra sau mỗi lượt, giúp học sinh hiểu vì sao mình đúng hoặc sai.
  expl_msg_bank_otp: "Ngân hàng không bao giờ hỏi mã OTP và không dùng tên miền lạ. Khóa tài khoản trong 2 giờ là chiêu gây hoảng để bạn không kịp kiểm tra.",
  expl_msg_real_promo: "Đây là thư khuyến mãi bình thường: không xin thông tin, không hối thúc, và mọi đường dẫn đều về trang chính thức.",
  expl_msg_invest_30pct: "Không kênh đầu tư hợp pháp nào cam kết 30% mỗi tháng. Việc phải rủ thêm người là dấu hiệu mô hình đa cấp trả lãi bằng tiền người vào sau.",
  expl_msg_parcel_fee: "Bạn không đặt hàng thì không có bưu kiện nào bị giữ. Đóng một khoản phí nhỏ để nhận thứ lớn hơn là mô típ lừa cổ điển.",
  expl_msg_real_bank_notice: "Tin báo biến động số dư thật chỉ thông báo giao dịch và hướng bạn gọi tổng đài in trên thẻ, không kèm đường dẫn nào.",
  expl_msg_fake_police: "Công an làm việc bằng giấy mời tại trụ sở, không gọi điện đòi chuyển tiền và không bắt bạn giữ bí mật với gia đình.",
  expl_msg_job_like_video: "Việc nhẹ lương cao đòi nạp phí kích hoạt là bẫy. Không nơi tuyển dụng hợp pháp nào bắt ứng viên nộp tiền trước.",
  expl_msg_real_school_fee: "Thông báo học phí thật đến từ địa chỉ của trường và chỉ dẫn bạn về cổng thanh toán chính thức, không hối thúc.",
  expl_msg_lottery_win: "Bạn không thể trúng giải của chương trình chưa từng tham gia. Giải thưởng thật không bao giờ yêu cầu đóng phí để nhận.",
  expl_msg_real_delivery: "Thông báo giao hàng thật có mã đơn tra cứu được, tên tài xế, và nói rõ không thu thêm khoản nào ngoài tiền hàng.",
  expl_msg_bank_upgrade_link: "Tên miền lạ và hạn chót 24 giờ là hai dấu hiệu đủ để dừng lại. Ngân hàng nâng cấp hệ thống không cần bạn bấm liên kết trong tin nhắn.",
  expl_msg_friend_borrow_fb: "Tài khoản bạn bè bị chiếm quyền thường xin tiền gấp vào một số tài khoản mới. Hãy gọi điện trực tiếp cho bạn trước khi chuyển.",
  expl_msg_real_promo_momo: "Ưu đãi thật áp dụng tự động, không yêu cầu nhập mã lạ và không dẫn bạn ra khỏi ứng dụng.",
  expl_msg_crypto_double: "Không ai nhân đôi tài sản cho người lạ. Chuyển tiền mã hóa đi là mất, vì giao dịch không thể đảo ngược.",
  expl_msg_real_bill_reminder: "Nhắc hóa đơn điện thật nêu kỳ, hạn thanh toán và các kênh thu hộ quen thuộc, không kèm liên kết lạ.",
  expl_msg_hui_invite: "Hụi hứa lời chắc chắn là rủi ro cao và không được pháp luật bảo vệ như gửi tiết kiệm. Quan hệ thân quen không thay thế được hợp đồng.",
  expl_msg_visa_lottery: "Chương trình visa không thu phí qua email và không dùng hộp thư cá nhân. Ngôn ngữ hối thúc là dấu hiệu rõ.",
  expl_msg_real_2fa_notice: "Đây là mã xác minh bạn tự yêu cầu, kèm lời nhắc không chia sẻ. Bản thân tin nhắn không đòi bạn làm gì thêm.",
  expl_msg_loan_instant: "Lãi 3.000 đồng mỗi triệu mỗi ngày tương đương hơn 100% một năm. Cho vay không giấy tờ qua Zalo là tín dụng đen.",
  expl_msg_real_survey: "Khảo sát thật nói rõ mục đích, không hỏi thông tin cá nhân và không liên quan đến thanh toán.",
  expl_msg_sim_swap: "Nhà mạng không bao giờ hỏi mã OTP. Đọc mã cho người lạ là trao quyền chiếm số điện thoại và mọi tài khoản gắn với nó.",
  expl_msg_real_refund: "Thông báo hoàn tiền thật gắn với đơn hàng có thật và không yêu cầu bạn thao tác thêm.",
  expl_msg_gov_subsidy: "Cơ quan nhà nước không phát tiền qua trang web lạ và không thu thập số thẻ ngân hàng qua tin nhắn.",
  expl_msg_real_event_ticket: "Vé thật gửi từ đơn vị bán vé chính thức, đính kèm mã QR và không yêu cầu thanh toán thêm.",
};

/**
 * Text bundles for the other four sims. The engine configs carry only machine
 * keys, so every label a learner reads comes from here (doc 04 §2).
 */
const BUDGET_TEXT_BUNDLE = {
  bill_rent: "Tiền trọ",
  bill_phone: "Điện thoại và internet",
  cat_food: "Ăn uống",
  cat_transport: "Đi lại",
  cat_fun: "Giải trí",
  cat_clothes: "Quần áo",
  cat_savings: "Tiết kiệm",
  evt_motorbike_repair: "Xe máy hỏng, cần sửa gấp",
  evt_bonus: "Được thưởng thêm cuối tháng",
  evt_friend_borrow: "Bạn thân hỏi vay tiền",
  ch_pay_now: "Sửa ngay, trả đủ",
  ch_delay: "Sửa tạm, tháng sau trả nốt",
  ch_lend: "Cho bạn vay",
  ch_decline: "Từ chối khéo",
};

const BUDGET_TEXT_BUNDLE_EN = {
  bill_rent: "Rent",
  bill_phone: "Phone and internet",
  cat_food: "Food",
  cat_transport: "Transport",
  cat_fun: "Fun",
  cat_clothes: "Clothes",
  cat_savings: "Savings",
  evt_motorbike_repair: "Motorbike broke down — needs urgent repair",
  evt_bonus: "Extra bonus at month end",
  evt_friend_borrow: "A close friend asks to borrow money",
  ch_pay_now: "Fix it now, pay in full",
  ch_delay: "Temporary fix, pay the rest next month",
  ch_lend: "Lend to your friend",
  ch_decline: "Decline politely",
};

const LOANS_TEXT_BUNDLE = {
  goal_laptop: "Máy tính xách tay để học",
  offer_bank: "Vay ngân hàng",
  offer_retail: "Trả góp tại cửa hàng",
  offer_app: "Vay nhanh qua ứng dụng",
  mk_zero_percent: "Quảng cáo lãi suất 0%",
  rf_no_license: "Không có giấy phép hoạt động cho vay",
  rf_contact_access: "Đòi quyền đọc danh bạ trên điện thoại",
  rf_daily_calls: "Gọi điện đòi nợ mỗi ngày, kể cả người thân",
  evt_overtime: "Tháng này bạn có thêm ca làm thêm",
  evt_income_drop: "Thu nhập tháng này giảm",
};

const LOANS_TEXT_BUNDLE_EN = {
  goal_laptop: "Laptop for school",
  offer_bank: "Bank loan",
  offer_retail: "Store installment plan",
  offer_app: "Quick loan via an app",
  mk_zero_percent: "Advertised 0% interest",
  rf_no_license: "No license to lend money",
  rf_contact_access: "Demands access to your phone contacts",
  rf_daily_calls: "Calls every day to collect, including relatives",
  evt_overtime: "You get extra overtime this month",
  evt_income_drop: "Income drops this month",
};

const BUSINESS_TEXT_BUNDLE = {
  prod_tra_chanh: "Trà chanh",
  up_sign: "Biển hiệu mới",
  up_fridge: "Tủ mát giữ lạnh",
  w_sunny: "Trời nắng",
  w_cloudy: "Trời nhiều mây",
  w_rain: "Trời mưa",
  evt_inspection: "Đoàn kiểm tra vệ sinh ghé quán",
};

const BUSINESS_TEXT_BUNDLE_EN = {
  prod_tra_chanh: "Lemon tea",
  up_sign: "New shop sign",
  up_fridge: "Cold fridge",
  w_sunny: "Sunny",
  w_cloudy: "Cloudy",
  w_rain: "Rainy",
  evt_inspection: "Hygiene inspectors visit the stall",
};

const INVEST_TEXT_BUNDLE = {
  quarter: "Quý",
  as_savings: "Gửi tiết kiệm",
  as_bond: "Trái phiếu",
  as_bluechip: "Cổ phiếu công ty lớn",
  as_hotcoin: "Tiền mã hóa",
  news_hotcoin_hype: "Tiền mã hóa đang được thổi giá mạnh",
  news_rate_cut: "Lãi suất giảm, trái phiếu được lợi",
  news_market_calm: "Thị trường không có tin đáng chú ý",
  news_bluechip_earnings: "Nhóm cổ phiếu lớn báo lãi tốt",
};

const INVEST_TEXT_BUNDLE_EN = {
  quarter: "Quarter",
  as_savings: "Savings account",
  as_bond: "Bonds",
  as_bluechip: "Large-company stocks",
  as_hotcoin: "Crypto",
  news_hotcoin_hype: "Crypto is being hyped hard",
  news_rate_cut: "Rates fall; bonds benefit",
  news_market_calm: "No notable market news",
  news_bluechip_earnings: "Large stocks report strong earnings",
};

/** English labels for scam cues/explanations; message bodies stay Vietnamese (realistic bait). */
const SCAM_TEXT_BUNDLE_EN: Record<string, unknown> = {
  ...SCAM_TEXT_BUNDLE,
  cue_urgent: "Creates urgent time pressure",
  cue_link_odd: "Odd link, not an official domain",
  cue_asks_otp: "Asks for an OTP code",
  cue_guaranteed_return: "Promises a sure, unusually high return",
  cue_pressure_recruit: "Pressures you to recruit others",
  cue_unexpected_parcel: "A parcel you never ordered",
  cue_small_fee_first: "Asks for a small fee before a big payoff",
  cue_authority_pressure: "Impersonates an authority to intimidate",
  cue_secrecy: "Demands secrecy — tell no one",
  cue_transfer_now: "Pressures an immediate transfer",
  cue_easy_money: "Work that is too easy and pays too much",
  cue_deposit_first: "Requires a deposit before pay or a job",
  cue_never_entered: "Prize for a contest you never joined",
  cue_fee_to_claim: "Fee required to claim a prize",
  cue_odd_wording: "Wording unlike the person you know",
  cue_new_account_number: "A \"new\" account number unlike before",
  cue_friend_pressure: "Uses a personal relationship as pressure",
  cue_odd_sender: "Unusual sender address",
  cue_no_paperwork: "No paperwork — a sign of illegal lending",
  cue_daily_interest: "Daily interest that is usurious yearly",
  cue_urgency_network: "Fake carrier creating an emergency",
  cue_personal_info_ask: "Asks for ID/card numbers nobody should request by message",
  expl_msg_bank_otp: "Banks never ask for OTP codes or use odd domains. A two-hour lock threat is meant to panic you.",
  expl_msg_real_promo: "A normal promo: no data request, no rush, and links go to the official site.",
  expl_msg_invest_30pct: "No legal investment promises 30% a month. Recruiting others is a classic pyramid signal.",
  expl_msg_parcel_fee: "If you did not order it, there is no held parcel. A small fee for a big prize is a classic scam.",
  expl_msg_real_bank_notice: "Real balance alerts only report a transaction and point you to the printed hotline — no links.",
  expl_msg_fake_police: "Police use written summonses at stations; they do not call for money transfers or demand secrecy from family.",
  expl_msg_job_like_video: "Easy high pay that requires an activation fee is a trap. Real employers do not charge applicants first.",
  expl_msg_real_school_fee: "Real tuition notices come from the school domain and send you to the official payment portal.",
  expl_msg_lottery_win: "You cannot win a contest you never entered. Real prizes never charge a fee to claim.",
  expl_msg_real_delivery: "Real delivery notices have a trackable order id, a driver name, and no extra fee beyond COD.",
  expl_msg_bank_upgrade_link: "An odd domain and a 24-hour deadline are enough to stop. Banks do not upgrade cards via SMS links.",
  expl_msg_friend_borrow_fb: "Hijacked friend accounts often ask for urgent money to a new account. Call your friend before sending.",
  expl_msg_real_promo_momo: "Real offers apply automatically, need no odd codes, and keep you inside the app.",
  expl_msg_crypto_double: "Nobody doubles assets for strangers. Crypto transfers are irreversible.",
  expl_msg_real_bill_reminder: "Real utility reminders name the period, due date, and familiar payment channels — no odd links.",
  expl_msg_hui_invite: "Informal rotating savings with guaranteed profit is high risk and not protected like bank deposits.",
  expl_msg_visa_lottery: "Visa programs do not collect fees by email or use personal mailboxes. Urgent wording is a red flag.",
  expl_msg_real_2fa_notice: "This is a verification code you requested, with a reminder not to share it. The message asks for nothing else.",
  expl_msg_loan_instant: "Interest of 3,000 đồng per million per day is over 100% a year. Paperless Zalo loans are illegal lending.",
  expl_msg_real_survey: "A real survey states its purpose, asks for no personal data, and involves no payment.",
  expl_msg_sim_swap: "Carriers never ask for OTP. Reading a code to a stranger hands over your number and linked accounts.",
  expl_msg_real_refund: "Real refund notices tie to a real order and ask you to do nothing more.",
  expl_msg_gov_subsidy: "Government agencies do not pay via odd websites or collect card numbers over SMS.",
  expl_msg_real_event_ticket: "Real tickets come from the official seller with a QR code and no extra payment demand.",
};

const TEXT_BUNDLES: Record<string, object> = {
  SCAM: SCAM_TEXT_BUNDLE,
  BUDGET: BUDGET_TEXT_BUNDLE,
  LOANS: LOANS_TEXT_BUNDLE,
  BUSINESS: BUSINESS_TEXT_BUNDLE,
  INVEST: INVEST_TEXT_BUNDLE,
};

const TEXT_BUNDLES_EN: Record<string, object> = {
  SCAM: SCAM_TEXT_BUNDLE_EN,
  BUDGET: BUDGET_TEXT_BUNDLE_EN,
  LOANS: LOANS_TEXT_BUNDLE_EN,
  BUSINESS: BUSINESS_TEXT_BUNDLE_EN,
  INVEST: INVEST_TEXT_BUNDLE_EN,
};

const BADGES: Array<{
  code: string;
  kind: "PROGRESS" | "STREAK" | "MASTERY" | "SIM" | "SPECIAL";
  coinReward: number;
  criteria: object;
  vi: { title: string; description: string };
  en: { title: string; description: string };
}> = [
  { code: "FIRST_LESSON", kind: "PROGRESS", coinReward: 10, criteria: { lessonsCompleted: 1 }, vi: { title: "Bước chân đầu tiên", description: "Hoàn thành bài học đầu tiên" }, en: { title: "First steps", description: "Complete your first lesson" } },
  { code: "TEN_LESSONS", kind: "PROGRESS", coinReward: 30, criteria: { lessonsCompleted: 10 }, vi: { title: "Học sinh chăm chỉ", description: "Hoàn thành 10 bài học" }, en: { title: "Diligent learner", description: "Complete 10 lessons" } },
  { code: "FIRST_COURSE", kind: "PROGRESS", coinReward: 50, criteria: { coursesCompleted: 1 }, vi: { title: "Tốt nghiệp khóa đầu", description: "Hoàn thành trọn vẹn một khóa học" }, en: { title: "First course graduate", description: "Fully complete a course" } },
  { code: "STREAK_7", kind: "STREAK", coinReward: 20, criteria: { streak: 7 }, vi: { title: "Tuần lễ vàng", description: "Chuỗi 7 ngày học liên tiếp" }, en: { title: "Golden week", description: "A 7-day learning streak" } },
  { code: "STREAK_30", kind: "STREAK", coinReward: 100, criteria: { streak: 30 }, vi: { title: "Thói quen thép", description: "Chuỗi 30 ngày học liên tiếp" }, en: { title: "Iron habit", description: "A 30-day learning streak" } },
  { code: "QUIZ_PERFECT", kind: "MASTERY", coinReward: 15, criteria: { quizPerfect: 1 }, vi: { title: "Điểm tuyệt đối", description: "Đạt 100% một bài kiểm tra" }, en: { title: "Perfect score", description: "Score 100% on a quiz" } },
  { code: "SIM_BUDGET_SURPLUS", kind: "SIM", coinReward: 25, criteria: { sim: "BUDGET", savingsRatePctGte: 20 }, vi: { title: "Vua tiết kiệm", description: "Hoàn thành mô phỏng ngân sách với tỷ lệ tiết kiệm ≥ 20%" }, en: { title: "Savings champion", description: "Finish the budget sim with a savings rate ≥ 20%" } },
  { code: "SIM_LOANS_SAVER", kind: "SIM", coinReward: 25, criteria: { sim: "LOANS", withinPctOfBest: 5 }, vi: { title: "Người vay khôn ngoan", description: "Trả nợ với tổng chi phí sát phương án tối ưu" }, en: { title: "Wise borrower", description: "Repay near the optimal total cost" } },
  { code: "SIM_SCAM_DETECTIVE", kind: "SIM", coinReward: 25, criteria: { sim: "SCAM", accuracyPctGte: 90 }, vi: { title: "Thám tử chống lừa đảo", description: "Độ chính xác ≥ 90% trong Nhận diện lừa đảo" }, en: { title: "Scam detective", description: "≥ 90% accuracy in Spot the scam" } },
  { code: "SIM_BUSINESS_PROFIT", kind: "SIM", coinReward: 25, criteria: { sim: "BUSINESS", profitGt: 0 }, vi: { title: "Doanh nhân nhí", description: "Kết thúc kinh doanh có lãi" }, en: { title: "Junior entrepreneur", description: "End the business sim in profit" } },
  { code: "SIM_INVEST_DIVERSIFIED", kind: "SIM", coinReward: 25, criteria: { sim: "INVEST", hhiLte: 4000 }, vi: { title: "Nhà đầu tư đa dạng", description: "Danh mục đa dạng hóa suốt trò chơi" }, en: { title: "Diversified investor", description: "Keep a diversified portfolio throughout" } },
  { code: "LEADERBOARD_TOP10", kind: "SPECIAL", coinReward: 0, criteria: { leaderboardRankLte: 10 }, vi: { title: "Top 10 tuần", description: "Lọt vào top 10 bảng xếp hạng tuần" }, en: { title: "Weekly top 10", description: "Reach the weekly top 10" } },
];

const SHOP_ITEMS: Array<{ code: string; kind: string; priceCoins: number; vi: string; en: string }> = [
  { code: "STREAK_FREEZE", kind: "STREAK_FREEZE", priceCoins: 50, vi: "Đóng băng chuỗi (1 ngày)", en: "Streak freeze (1 day)" },
  { code: "AVATAR_PACK_ANIMALS", kind: "AVATAR", priceCoins: 80, vi: "Bộ avatar Thú cưng", en: "Pet avatar pack" },
  { code: "AVATAR_PACK_HEROES", kind: "AVATAR", priceCoins: 120, vi: "Bộ avatar Siêu anh hùng", en: "Hero avatar pack" },
];

async function main() {
  const e = env();

  // 1) Admin user
  const adminEmail = e.SEED_ADMIN_EMAIL ?? "admin@moneylab.local";
  const adminPassword = e.SEED_ADMIN_PASSWORD ?? "admin12345";
  const existingAdmin = await prisma.user.findFirst({
    where: { email: { equals: adminEmail, mode: "insensitive" } },
  });
  if (!existingAdmin) {
    const admin = await prisma.user.create({
      data: {
        id: uuidv7(),
        email: adminEmail,
        emailVerifiedAt: new Date(),
        passwordHash: await argonHash(adminPassword, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
        displayName: "MoneyLab Admin",
        role: "ADMIN",
      },
    });
    await prisma.userStats.create({ data: { userId: admin.id } });
    console.log(`✔ admin user created: ${adminEmail}`);
  } else {
    console.log(`✔ admin user exists: ${adminEmail}`);
  }

  // 1b) Demo learner. Guest mode is gone, so the smoke pass and anyone poking at
  // the app by hand need a real non-admin account to sign in with.
  const learnerEmail = e.SEED_LEARNER_EMAIL ?? "learner@moneylab.local";
  const learnerPassword = e.SEED_LEARNER_PASSWORD ?? "learner12345";
  const existingLearner = await prisma.user.findFirst({
    where: { email: { equals: learnerEmail, mode: "insensitive" } },
  });
  if (!existingLearner) {
    const learner = await prisma.user.create({
      data: {
        id: uuidv7(),
        email: learnerEmail,
        emailVerifiedAt: new Date(),
        passwordHash: await argonHash(learnerPassword, { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
        displayName: "Học sinh demo",
      },
    });
    await prisma.userStats.create({ data: { userId: learner.id } });
    console.log(`✔ demo learner created: ${learnerEmail}`);
  } else {
    console.log(`✔ demo learner exists: ${learnerEmail}`);
  }

  // 2) Sim definitions (PUBLISHED) - must exist before content import (SIM_LAUNCHER cross-ref)
  for (const sim of SIM_SEEDS) {
    const textBundleVi = TEXT_BUNDLES[sim.type] ?? {};
    const textBundleEn = TEXT_BUNDLES_EN[sim.type] ?? textBundleVi;
    const existing = await prisma.simDefinition.findUnique({ where: { slug: sim.slug } });
    const simRow = existing
      ? await prisma.simDefinition.update({
          where: { id: existing.id },
          data: {
            order: sim.order,
            estimatedMinutes: sim.estimatedMinutes,
            config: sim.config as Prisma.InputJsonValue,
            status: "PUBLISHED",
          },
        })
      : await prisma.simDefinition.create({
          data: {
            id: uuidv7(),
            slug: sim.slug,
            type: sim.type,
            status: "PUBLISHED",
            order: sim.order,
            estimatedMinutes: sim.estimatedMinutes,
            xpRewardComplete: 100,
            config: sim.config as Prisma.InputJsonValue,
          },
        });
    for (const [locale, copy, bundle] of [
      ["vi", sim.vi, textBundleVi],
      ["en", sim.en, textBundleEn],
    ] as const) {
      await prisma.simDefinitionTranslation.upsert({
        where: { simId_locale: { simId: simRow.id, locale } },
        create: {
          simId: simRow.id,
          locale,
          title: copy.title,
          subtitle: copy.subtitle,
          description: copy.description,
          textBundle: bundle as Prisma.InputJsonValue,
        },
        update: {
          title: copy.title,
          subtitle: copy.subtitle,
          description: copy.description,
          textBundle: bundle as Prisma.InputJsonValue,
        },
      });
    }
  }
  console.log(`✔ ${SIM_SEEDS.length} sim definitions`);

  // 3) Badges
  for (const b of BADGES) {
    const badge = await prisma.badge.upsert({
      where: { code: b.code },
      create: {
        id: uuidv7(),
        code: b.code,
        kind: b.kind,
        coinReward: b.coinReward,
        criteria: b.criteria as Prisma.InputJsonValue,
      },
      update: { kind: b.kind, coinReward: b.coinReward, criteria: b.criteria as Prisma.InputJsonValue },
    });
    for (const [locale, copy] of [
      ["vi", b.vi],
      ["en", b.en],
    ] as const) {
      await prisma.badgeTranslation.upsert({
        where: { badgeId_locale: { badgeId: badge.id, locale } },
        create: { badgeId: badge.id, locale, title: copy.title, description: copy.description },
        update: { title: copy.title, description: copy.description },
      });
    }
  }
  console.log(`✔ ${BADGES.length} badges`);

  // 4) Shop items
  for (const s of SHOP_ITEMS) {
    const item = await prisma.shopItem.upsert({
      where: { code: s.code },
      create: { id: uuidv7(), code: s.code, kind: s.kind, priceCoins: s.priceCoins, status: "PUBLISHED" },
      update: { kind: s.kind, priceCoins: s.priceCoins, status: "PUBLISHED" },
    });
    for (const [locale, title] of [
      ["vi", s.vi],
      ["en", s.en],
    ] as const) {
      await prisma.shopItemTranslation.upsert({
        where: { itemId_locale: { itemId: item.id, locale } },
        create: { itemId: item.id, locale, title },
        update: { title },
      });
    }
  }
  console.log(`✔ ${SHOP_ITEMS.length} shop items`);

  // 5) Course content bundles, in catalogue order
  const BUNDLES = [
    ["nen-tang-tien-bac", "ngan-sach-va-tiet-kiem"],
    ["nen-tang-tien-bac", "vay-no-va-lua-dao"],
  ] as const;

  for (const [trackSlug, courseSlug] of BUNDLES) {
    const bundlePath = join(__dirname, "..", "content", "vi", trackSlug, `${courseSlug}.json`);
    const raw = JSON.parse(readFileSync(bundlePath, "utf-8"));
    const report = await importBundle(raw, false);
    if (!report.ok) {
      console.error(`✘ content import failed (${courseSlug}):`, JSON.stringify(report.errors, null, 2));
      process.exit(1);
    }
    if (report.warnings.length) {
      console.log(`  import warnings (${courseSlug}):`, JSON.stringify(report.warnings, null, 2));
    }
    console.log(
      `✔ course imported: ${report.summary.courseSlug} (${report.summary.lessons} lessons, ${report.summary.questions} questions)`,
    );

    // 6) Publish what was just imported (import leaves everything DRAFT)
    const course = await prisma.course.findUnique({
      where: { slug: courseSlug },
      include: { lessons: true },
    });
    if (course) {
      await prisma.$transaction([
        prisma.track.update({ where: { slug: trackSlug }, data: { status: "PUBLISHED" } }),
        prisma.course.update({ where: { id: course.id }, data: { status: "PUBLISHED" } }),
        prisma.lesson.updateMany({ where: { courseId: course.id }, data: { status: "PUBLISHED" } }),
        prisma.quiz.updateMany({
          where: {
            OR: [
              { id: course.finalQuizId ?? "" },
              { id: { in: course.lessons.map((l) => l.checkQuizId).filter((x): x is string => !!x) } },
            ],
          },
          data: { status: "PUBLISHED" },
        }),
      ]);
      console.log(`✔ ${courseSlug}: track/course/lessons/quizzes published`);
    }
  }

  // 7) Library articles
  const articlesPath = join(__dirname, "..", "content", "vi", "articles.json");
  const articleFile = JSON.parse(readFileSync(articlesPath, "utf-8")) as { articles: ArticleSeed[] };
  for (const a of articleFile.articles) {
    const parsed = articleSeedSchema.safeParse(a);
    if (!parsed.success) {
      console.error(`✘ article "${a.slug}" invalid:`, JSON.stringify(parsed.error.issues, null, 2));
      process.exit(1);
    }
    for (const tr of Object.values(parsed.data.i18n)) {
      for (const b of tr.blocks) {
        if (b.type === "SIM_LINK" && !SIM_SEEDS.some((s) => s.slug === b.simSlug)) {
          console.error(`✘ article "${a.slug}" links to unknown sim "${b.simSlug}"`);
          process.exit(1);
        }
      }
    }
    const related = a.relatedCourseSlug
      ? await prisma.course.findUnique({ where: { slug: a.relatedCourseSlug }, select: { id: true } })
      : null;
    if (a.relatedCourseSlug && !related) {
      console.error(`✘ article "${a.slug}" points at unknown course "${a.relatedCourseSlug}"`);
      process.exit(1);
    }
    // publishedAt is relative to the seed run so the library always looks alive,
    // and it is only stamped on create so re-seeding does not reshuffle the order.
    const publishedAt = new Date(Date.now() - a.publishedDaysAgo * 86_400_000);
    const common = {
      status: "PUBLISHED" as const,
      category: a.category,
      readMinutes: a.readMinutes,
      authorName: a.authorName,
      relatedCourseId: related?.id ?? null,
    };
    const article = await prisma.article.upsert({
      where: { slug: a.slug },
      create: { id: uuidv7(), slug: a.slug, publishedAt, ...common },
      update: common,
    });
    for (const [locale, tr] of Object.entries(a.i18n)) {
      await prisma.articleTranslation.upsert({
        where: { articleId_locale: { articleId: article.id, locale: locale as "vi" | "en" } },
        create: {
          articleId: article.id,
          locale: locale as "vi" | "en",
          title: tr.title,
          summary: tr.summary,
          seoTitle: tr.seoTitle,
          seoDescription: tr.seoDescription,
          blocks: tr.blocks as unknown as Prisma.InputJsonValue,
        },
        update: {
          title: tr.title,
          summary: tr.summary,
          seoTitle: tr.seoTitle,
          seoDescription: tr.seoDescription,
          blocks: tr.blocks as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
  console.log(`✔ ${articleFile.articles.length} articles published`);

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
