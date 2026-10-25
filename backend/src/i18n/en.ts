// English for the server's Korean messages (lib/i18n.ts). A {name} in a
// Korean key stands for any text there, which is translated too when this
// file has it (a field's name, say).
const en: Record<string, string> = {
  // app.ts, store.ts, middleware
  "서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.": "Something went wrong on the server. Please try again in a moment.",
  "요청 형식이 올바르지 않아요.": "The request isn't in the right format.",
  "보낸 내용이 너무 커요. 내용을 줄여서 다시 보내 주세요.": "What you sent is too large. Please shorten it and try again.",
  "없는 API 경로예요.": "There is no such API route.",
  "저장하지 못해서 방금 한 작업을 되돌렸어요. 잠시 후 다시 시도해 주세요.":
    "We couldn't save, so what you just did was undone. Please try again in a moment.",
  "데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.": "We couldn't load the data. Please try again in a moment.",
  "로그인이 필요해요.": "Please log in.",
  "회원 유형을 선택해 주세요.": "Please choose a member type.",

  // Rate limits
  "관리자 인증 실패가 너무 많아요. 15분 뒤에 다시 시도해 주세요.":
    "Too many failed admin sign-ins. Please try again in 15 minutes.",
  "인증번호 요청이 너무 많아요. 15분 뒤에 다시 시도해 주세요.":
    "Too many verification code requests. Please try again in 15 minutes.",
  "이 이메일로 인증번호를 너무 자주 받았어요. 30분 뒤에 다시 시도해 주세요.":
    "Verification codes were sent to this email too often. Please try again in 30 minutes.",
  "인증 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요.": "Too many verification attempts. Please try again in 15 minutes.",
  "로그인 시도가 너무 많아요. 15분 뒤에 다시 시도해 주세요.": "Too many login attempts. Please try again in 15 minutes.",
  "기록 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.": "Too many check-in requests. Please try again in a moment.",
  "직원 PIN을 너무 많이 틀렸어요. 15분 뒤에 다시 시도해 주세요.":
    "Too many wrong staff PINs. Please try again in 15 minutes.",
  "이 행사의 직원 PIN이 너무 많이 틀렸어요. 15분 뒤에 다시 시도해 주세요.":
    "Too many wrong staff PINs for this event. Please try again in 15 minutes.",

  // Accounts (routes/auth.ts, lib/email.ts, lib/mailer.ts)
  "이메일 형식을 확인해 주세요.": "Please check the email format.",
  "학교 이메일(예: name@syu.ac.kr)로 인증해 주세요.": "Please verify with a school email (e.g. name@syu.ac.kr).",
  "개인 메일은 사용할 수 없어요. 회사 이메일로 인증해 주세요.":
    "Personal email addresses can't be used. Please verify with a company email.",
  "학교 이메일은 '협찬 받기'로 가입해 주세요.": "Please sign up with a school email as 'Receive Sponsorship'.",
  "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.":
    "We couldn't send the verification email. Please try again in a moment.",
  "데모 계정은 비밀번호를 바꾸거나 탈퇴할 수 없어요.": "Demo accounts can't change their password or leave.",
  "데모 계정은 탈퇴할 수 없어요.": "Demo accounts can't leave.",
  "인증번호를 먼저 받아 주세요.": "Please get a verification code first.",
  "인증 시간이 지났어요. 인증번호를 다시 받아 주세요.": "The verification time has run out. Please get a new verification code.",
  "인증 시도가 너무 많아요. 30분 뒤에 인증번호를 다시 받아 주세요.":
    "Too many verification attempts. Please get a new verification code in 30 minutes.",
  "인증번호가 일치하지 않아요.": "The verification code doesn't match.",
  "이미 가입된 이메일이에요. 로그인해 주세요.": "This email is already registered. Please log in.",
  "이미 가입된 이메일이에요. 다른 이메일을 입력해 주세요.": "This email is already registered. Please enter another one.",
  "이름은 40자 이하로 입력해 주세요.": "Please keep the name to 40 characters or fewer.",
  "분류를 다시 선택해 주세요.": "Please choose the category again.",
  "학교를 입력해 주세요.": "Please enter your school.",
  "이메일 인증을 완료해 주세요.": "Please complete email verification.",
  "비밀번호는 8자 이상이어야 해요.": "The password must be at least 8 characters.",
  "이용약관에 동의해 주세요.": "Please agree to the Terms of Service.",
  "만 14세 이상만 가입할 수 있어요.": "You must be 14 or older to sign up.",
  "가입한 이메일을 입력해 주세요.": "Please enter the email you signed up with.",
  "가입된 이메일이 아니에요. 이메일을 확인하거나 회원가입해 주세요.":
    "This email isn't registered. Please check the email or sign up.",
  "가입된 이메일이 아니에요.": "This email isn't registered.",
  "이메일 또는 비밀번호가 올바르지 않아요.": "The email or password is incorrect.",
  "비밀번호가 올바르지 않아요.": "The password is incorrect.",
  "새 비밀번호는 8자 이상이어야 해요.": "The new password must be at least 8 characters.",
  "지금 비밀번호가 올바르지 않아요.": "The current password is incorrect.",
  "단체명": "group name",
  "브랜드명": "brand name",
  "'{label}' 회원으로 가입된 계정이에요. 유형을 바꿔 로그인해 주세요.":
    "This account is registered as a '{label}' member. Please switch the type and log in.",
  "협찬 받기": "Receive Sponsorship",
  "협찬 하기": "Give Sponsorship",

  // Admin and questions (routes/admin.ts, routes/inquiries.ts)
  "관리자만 쓸 수 있어요.": "Only administrators can use this.",
  "답변을 적어 주세요.": "Please write an answer.",
  "답변은 2,000자 이하로 적어 주세요.": "Please keep the answer to 2,000 characters or fewer.",
  "질문을 찾을 수 없어요.": "We couldn't find the question.",
  "질문 종류를 골라 주세요.": "Please choose a question type.",
  "질문을 5자 이상 적어 주세요.": "Please write a question of at least 5 characters.",
  "질문은 1,000자 이하로 적어 주세요.": "Please keep the question to 1,000 characters or fewer.",

  // Messages (routes/conversations.ts)
  "메시지를 입력해 주세요.": "Please enter a message.",
  "메시지는 1,000자 이하로 보내 주세요.": "Please keep messages to 1,000 characters or fewer.",
  "대화를 찾을 수 없어요.": "We couldn't find the conversation.",
  "메시지를 찾을 수 없어요.": "We couldn't find the message.",
  "내가 보낸 메시지만 고치거나 지울 수 있어요.": "You can only edit or delete messages you sent.",
  "먼저 내 정보에서 소개를 등록해 주세요.": "Please add your profile in My Info first.",
  "대화할 상대를 찾을 수 없어요.": "We couldn't find who you want to message.",
  "삭제한 메시지는 고칠 수 없어요.": "Deleted messages can't be edited.",

  // Events and campaigns (routes/events.ts)
  "{label}과 일정을 입력해 주세요.": "Please enter the {label} and dates.",
  "{label}은 40자 이하로 적어 주세요.": "Please keep the {label} to 40 characters or fewer.",
  "{label}은 1명부터 {max}명까지 숫자로 적어 주세요.": "Please enter the {label} as a number from 1 to {max}.",
  "행사명": "event name",
  "캠페인명": "campaign name",
  "예상 참여 인원": "expected attendance",
  "목표 도달 인원": "target reach",
  "일정은 달력에서 날짜를 골라 주세요.": "Please pick the dates from the calendar.",
  "끝나는 날은 시작일과 같거나 그 뒤로 골라 주세요.": "Please pick an end date on or after the start date.",
  "기간은 최대 {days}일까지 고를 수 있어요.": "You can pick a period of up to {days} days.",
  "원하는 협찬 유형을 하나 이상 골라 주세요.": "Please choose at least one type of sponsorship you want.",
  "제공할 협찬 형태를 하나 이상 골라 주세요.": "Please choose at least one form of sponsorship you'll offer.",
  "기타 협찬 유형을 적어 주세요.": "Please describe the other sponsorship type.",
  "기타 협찬 유형은 30자 이하로 적어 주세요.": "Please keep the other sponsorship type to 30 characters or fewer.",
  "예산은 0원 이상 숫자로 입력해 주세요.": "Please enter the budget as a number of 0 won or more.",
  "행사를 찾을 수 없어요.": "We couldn't find the event.",
  "협찬이 확정된 행사는 지울 수 없어요. 협찬사와 먼저 이야기해 주세요.":
    "An event with a confirmed sponsorship can't be deleted. Please talk to the sponsor first.",

  // Listings (routes/profile.ts)
  "로고는 PNG, JPG, WebP 이미지를 100KB 이하로 올려 주세요.": "Please upload the logo as a PNG, JPG or WebP image of 100KB or less.",
  "소개는 10자 이상 300자 이하로 적어 주세요.": "Please write an introduction of 10 to 300 characters.",
  "{label}을 60자 이하로 적어 주세요.": "Please keep {label} to 60 characters or fewer.",
  "협찬하면 얻는 것": "what sponsors get",
  "제공하는 협찬": "the sponsorship you offer",
  "태그는 4개까지, 하나에 12자 이하로 적어 주세요.": "Please add up to 4 tags, each 12 characters or fewer.",
  "기본 정보는 항목마다 40자 이하로 적어 주세요.": "Please keep each basic info item to 40 characters or fewer.",
  "SNS는 4개까지 등록할 수 있어요.": "You can add up to 4 social media accounts.",
  "SNS 종류를 골라 주세요.": "Please choose a social media platform.",
  "SNS 계정은 60자, 팔로워는 20자 이하로 적어 주세요.":
    "Please keep social media accounts to 60 characters and followers to 20 characters or fewer.",
  "포트폴리오는 5개까지 등록할 수 있어요.": "You can add up to 5 portfolio items.",
  "포트폴리오 제목은 40자, 내용은 100자 이하로 적어 주세요.":
    "Please keep portfolio titles to 40 characters and descriptions to 100 characters or fewer.",

  // Proposals and offers (routes/proposals.ts, requests.ts, offers.ts)
  "협찬받을 행사를 먼저 내 행사에 등록해 주세요. 제안은 다가오는 행사로 보내져요.":
    "Please register the event you want sponsored in My Events first. Proposals are sent about your upcoming event.",
  "제안할 캠페인을 먼저 행사 일정에 등록해 주세요. 제안은 다가오는 캠페인으로 보내져요.":
    "Please register the campaign you want to propose in Event Schedule first. Proposals are sent about your upcoming campaign.",
  "{name}은 이미 협찬이 확정됐어요. 다음 {kind}를 등록하면 다시 제안할 수 있어요.":
    "Sponsorship for {name} is already confirmed. Register your next {kind} to propose again.",
  "행사": "event",
  "캠페인": "campaign",
  "목록에 없는 상대예요.": "This partner isn't in the list.",
  "이미 수락된 제안이에요.": "This proposal has already been accepted.",
  "브랜드 회원만 제안에 답할 수 있어요.": "Only brand members can answer proposals.",
  "학생단체 회원만 받은 협찬에 답할 수 있어요.": "Only student group members can answer sponsorship offers.",
  "제안을 찾을 수 없어요.": "We couldn't find the proposal.",
  "이미 답한 제안이에요.": "This proposal has already been answered.",
  "삭제된 행사에 대한 제안이에요.": "This proposal is about a deleted event.",
  "삭제된 캠페인에 대한 제안이에요.": "This proposal is about a deleted campaign.",

  // Measurement and goals (lib/measurements.ts). topic() puts 은 or 는
  // after the field's name, so both forms are here.
  "알 수 없는 측정 항목이에요.": "Unknown measurement type.",
  "{label}은 {range}의 숫자로 적어 주세요.": "{label} must be a number {range}.",
  "{label}는 {range}의 숫자로 적어 주세요.": "{label} must be a number {range}.",
  "{min}부터 {max}까지": "from {min} to {max}",
  "협찬 가치": "Sponsorship value",
  "예상 인원": "Expected audience",
  "1인 예상 지출": "Expected spending per person",
  "현장 밖 도달": "Reach beyond the venue",
  "목표 도달": "Target reach",
  "목표 QR 스캔": "Target QR scans",
  "목표 쿠폰 수령": "Target coupons received",
  "목표 매장 방문": "Target store visits",
  "목표 QR 참여율": "Target QR participation rate",
  "목표 방문 전환율": "Target visit conversion rate",
  "목표 ROAS": "Target ROAS",
  "{brand}의 협찬 가치": "{brand}'s sponsorship value",
  "협찬 가치는 6개까지 적을 수 있어요.": "You can enter up to 6 sponsorship values.",
  "협찬 종류를 골라 주세요.": "Please choose a sponsorship type.",
  "쿠폰의 매장과 혜택을 30자 이하로 적어 주세요.": "Please keep the coupon's store and benefit to 30 characters or fewer.",
  "{brand}의 쿠폰을 적어 주세요.": "Please fill in the coupon for {brand}.",
  "직원 확인 PIN은 협찬사마다 다르게 정해 주세요.": "Please set a different staff PIN for each sponsor.",
  "협찬사별 가치를 더하면 협찬 가치 합계({total}원)와 같아야 해요.":
    "The sponsors' values must add up to the total sponsorship value (KRW {total}).",
  "직원 확인 PIN은 숫자 4자리로 적어 주세요.": "Please enter the staff PIN as 4 digits.",
  "쿠폰 사용 기간이 지났어요.": "The coupon has expired.",
  "아직 참여를 받지 않는 행사예요. 행사 당일({date})에 다시 스캔해 주세요.":
    "This event isn't open for participation yet. Please scan again on the day of the event ({date}).",
  "참여 기간이 끝난 행사예요.": "Participation for this event has ended.",

  // Check-in (routes/checkin.ts)
  "행사를 찾을 수 없어요. QR을 다시 스캔해 주세요.": "We couldn't find the event. Please scan the QR code again.",
  "이 행사의 참여 기록이 가득 찼어요. 행사 주최 측에 알려 주세요.":
    "This event's participation records are full. Please let the event organizers know.",
  "매장 방문은 매장 직원 화면에서 확인해요.": "Store visits are confirmed on the store staff's screen.",
  "참여 기록을 찾을 수 없어요. QR을 다시 스캔해 주세요.": "We couldn't find your participation record. Please scan the QR code again.",
  "쿠폰을 찾을 수 없어요. 화면을 새로 고쳐 주세요.": "We couldn't find the coupon. Please refresh the page.",
  "이미 쿠폰을 받았어요.": "You've already received the coupon.",
  "직원 PIN이 맞지 않아요. 행사 주최 측에 확인해 주세요.": "The staff PIN is incorrect. Please check with the event organizers.",
  "다른 매장의 쿠폰이에요. 쿠폰에 적힌 매장을 확인해 주세요.":
    "This coupon is for another store. Please check the store written on the coupon.",
  "쿠폰 번호를 찾을 수 없어요. 다시 확인해 주세요.": "We couldn't find the coupon number. Please check it again.",
  "이미 방문이 확인된 쿠폰이에요.": "A visit has already been confirmed for this coupon.",

  // Invitations to shops (routes/invites.ts)
  "학생단체 계정으로 가게를 초대할 수 있어요.": "Only student group accounts can invite shops.",
  "초대할 가게를 다시 골라 주세요.": "Please pick the shop to invite again.",
  "가게는 100곳까지 초대할 수 있어요.": "You can invite up to 100 shops.",
  "초대 링크를 찾을 수 없어요. 링크를 다시 확인해 주세요.": "We couldn't find this invitation. Please check the link.",
  "브랜드 계정으로 가게를 연결할 수 있어요.": "Only brand accounts can link a shop.",
  "데모 계정은 가게를 연결할 수 없어요.": "The demo accounts can't link a shop.",
  "데모 계정은 담당자 정보를 바꿀 수 없어요.": "The demo accounts can't change their contact details.",
  "담당자 이름을 입력해 주세요.": "Please enter the contact person's name.",
  "담당자 이름은 20자 이하로 입력해 주세요.": "Please keep the contact person's name to 20 characters or fewer.",
  "직책을 입력해 주세요.": "Please enter your position.",
  "직책은 20자 이하로 입력해 주세요.": "Please keep the position to 20 characters or fewer.",
  "휴대폰 번호를 010-1234-5678처럼 입력해 주세요.": "Please enter a mobile number like 010-1234-5678.",
  "데모 계정으로는 실제 가게를 초대할 수 없어요. 가입하면 우리 단체 이름으로 초대할 수 있어요.":
    "The demo accounts can't invite real shops. Sign up to invite them in your group's name.",
  "이미 다른 브랜드와 연결된 가게예요.": "This shop is already linked to another brand.",
  "이미 다른 가게와 연결된 브랜드예요.": "Your brand is already linked to another shop.",

  // Sponsorship agreements (routes/agreements.ts)
  "협찬 약속서를 찾을 수 없어요.": "We couldn't find this sponsorship agreement.",
  "약속한 일을 찾을 수 없어요.": "We couldn't find that item.",
  "상대가 할 일은 상대만 표시할 수 있어요.": "Only the other side can mark what they do.",
  "약속할 일을 1개부터 12개까지 적어 주세요.": "Please list from 1 to 12 things to do.",
  "누가 할 일인지 골라 주세요.": "Please choose who does it.",
  "할 일을 적어 주세요.": "Please write what is to be done.",
  "할 일은 80자 이하로 적어 주세요.": "Please keep each item to 80 characters or fewer.",
  "링크 목록을 다시 확인해 주세요.": "Please check the links again.",
  "링크는 5개까지 붙일 수 있어요.": "You can add up to 5 links.",
  "링크는 http:// 또는 https://로 시작하는 주소로 적어 주세요.": "Please enter links that start with http:// or https://.",
  "사진은 할 일마다 3장까지 올릴 수 있어요.": "You can add up to 3 photos to each item.",
  "사진은 PNG, JPG, WebP로 올려 주세요.": "Please upload photos as PNG, JPG or WebP.",
  "사진을 찾을 수 없어요.": "We couldn't find that photo.",

  // Sponsorship reviews (routes/reviews.ts)
  "후기를 쓸 협찬을 찾을 수 없어요.": "We couldn't find the sponsorship to review.",
  "데모 계정은 후기를 쓸 수 없어요.": "The demo accounts can't write reviews.",
  "행사 날부터 후기를 쓸 수 있어요.": "You can write a review from the day of the event.",
  "상대의 소개가 아직 없어서 후기를 남길 수 없어요.": "The other side has no profile yet, so a review can't be left.",
  "별점을 1부터 5까지 골라 주세요.": "Please choose from 1 to 5 stars.",
  "고를 수 없는 태그예요.": "That tag can't be chosen.",
  "태그는 3개까지 고를 수 있어요.": "You can choose up to 3 tags.",
  "후기는 300자 이하로 적어 주세요.": "Please keep the review to 300 characters or fewer.",
  "지울 후기가 없어요.": "There's no review to delete.",

  // Last, as patterns are tried in order and this one would also take
  // "{label}과 일정을 입력해 주세요." (routes/auth.ts sign-up names).
  "{label}을 입력해 주세요.": "Please enter the {label}.",
  "매장 주소는 100자 이하로 적어 주세요.": "Please keep the store address to 100 characters or fewer.",
  "찾을 가게 종류를 골라 주세요.": "Please choose a kind of shop to look for.",
  "데모 계정은 로그인 이메일을 바꿀 수 없어요.": "The demo accounts can't change their login email.",
  "지금 쓰는 이메일과 같아요.": "That's the email you already use.",
  "가게 검색이 너무 많아요. 잠시 후 다시 시도해 주세요.": "Too many shop searches. Please try again in a moment.",
  "주변 가게를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.": "We couldn't load the shops nearby. Please try again in a moment.",
}

export default en
