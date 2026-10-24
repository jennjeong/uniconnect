// English for this area's Korean copy (see i18n/index.ts).
const en: Record<string, string> = {
  // Shared by the account forms (modals/)
  로그인: "Log In",
  회원가입: "Sign Up",
  이메일: "Email",
  비밀번호: "Password",
  "비밀번호 확인": "Confirm password",
  "새 비밀번호": "New password",
  "새 비밀번호 확인": "Confirm new password",
  "8자 이상": "At least 8 characters",
  확인: "Confirm",
  재전송: "Resend",
  "인증번호 받기": "Get code",
  인증번호: "Verification code",
  "6자리 인증번호": "6-digit code",
  "{email}로 인증번호를 보냈어요.": "We sent a code to {email}.",
  "남은 시간 {time}": "{time} left",
  "인증 시간이 지났어요. 재전송을 눌러 주세요.": "The code has expired. Tap Resend for a new one.",
  "개발 모드라서 메일 대신 인증번호를 여기에 보여드려요:": "Dev mode, so here's your code instead of an email:",
  "비밀번호는 8자 이상이어야 해요.": "Your password needs at least 8 characters.",
  "비밀번호가 일치하지 않아요.": "The passwords don't match.",

  // Log in (modals/LoginModal.tsx)
  "이메일과 비밀번호를 입력해 주세요.": "Enter your email and password.",
  "비밀번호를 잊으셨나요?": "Forgot your password?",
  "학생단체로 로그인": "Log in as a student group",
  "스폰서로 로그인": "Log in as a brand",
  "아직 계정이 없나요?": "New to uniconnect?",

  // Sign up (modals/SignupModal.tsx)
  "단체명을 입력해 주세요.": "Enter your group's name.",
  "브랜드명을 입력해 주세요.": "Enter your brand's name.",
  "학교를 입력해 주세요.": "Enter your school.",
  "이메일 인증을 완료해 주세요.": "Verify your email first.",
  "이용약관에 동의해 주세요.": "Please agree to the terms.",
  "만 14세 이상만 가입할 수 있어요.": "You need to be 14 or older to sign up.",
  단체명: "Group name",
  브랜드명: "Brand name",
  "예) 삼육대 뮤즈": "e.g. SYU Muse",
  "예) 오후의 커피": "e.g. Afternoon Coffee",
  "단체 분류": "Group type",
  업종: "Industry",
  학교: "School",
  "예) 삼육대학교": "e.g. Sahmyook University",
  "학교 이메일": "School email",
  "회사 이메일": "Work email",
  변경: "Change",
  "이메일 인증이 완료됐어요.": "Your email is verified.",
  "학교 이메일(ac.kr)로 인증해야 가입할 수 있어요.":
    "Sign up with your school email (one ending in ac.kr).",
  "회사 이메일로 인증해야 가입할 수 있어요. 개인 메일(gmail, naver 등)은 사용할 수 없어요.":
    "Sign up with your work email. Personal addresses (Gmail, Naver and the like) won't work.",
  "{terms}과 {privacy}에 동의합니다.": "I agree to the {terms} and the {privacy}.",
  "서비스 이용약관": "Terms of Service",
  "개인정보 처리방침": "Privacy Policy",
  "만 14세 이상이에요.": "I'm 14 or older.",
  "가입하고 시작하기": "Sign up and get started",
  "이미 계정이 있나요?": "Already have an account?",

  // Reset password (modals/ResetPasswordModal.tsx)
  "가입한 이메일을 입력해 주세요.": "Enter the email you signed up with.",
  "6자리 인증번호를 입력해 주세요.": "Enter the 6-digit code.",
  "비밀번호 찾기": "Reset Password",
  "가입한 이메일로 인증번호를 보내 드려요. 새 비밀번호를 정하면 다른 기기에서는 로그아웃돼요.":
    "We'll email a code to the address you signed up with. Setting a new password logs you out on other devices.",
  "가입한 이메일": "Email you signed up with",
  "새 비밀번호로 로그인": "Log in with new password",
  "비밀번호가 기억났나요?": "Remembered it?",

  // Leave (modals/LeaveModal.tsx)
  "비밀번호를 입력해 주세요.": "Enter your password.",
  "지워지는 내용을 확인했다고 체크해 주세요.": "Tick the box to confirm what will be deleted.",
  "회원 탈퇴": "Delete Account",
  "탈퇴하면 {name} 계정과 아래 내용이 바로 지워지고, 되살릴 수 없어요.":
    "Deleting your account removes {name} and everything below right away. This can't be undone.",
  "계정 정보와 단체 소개": "Your account details and group profile",
  "계정 정보와 브랜드 소개": "Your account details and brand profile",
  "등록한 행사와 보낸 협찬 제안": "Your events and the proposals you sent",
  "등록한 캠페인과 받은 협찬 제안": "Your campaigns and the proposals you received",
  "주고받은 메시지 (상대방 쪽 대화도 함께 사라져요)": "Your messages (they disappear for the other side too)",
  "관리자에게 보낸 질문과 답변": "Questions sent to our team and their answers",
  "지워지는 내용을 확인했고, 되살릴 수 없다는 것을 이해했어요.":
    "I've read what will be deleted and understand it can't be restored.",
  탈퇴하기: "Delete my account",
  "계속 이용할게요": "Keep my account",

  // Change password (modals/PasswordModal.tsx)
  "지금 비밀번호를 입력해 주세요.": "Enter your current password.",
  "새 비밀번호는 8자 이상이어야 해요.": "Your new password needs at least 8 characters.",
  "새 비밀번호가 일치하지 않아요.": "The new passwords don't match.",
  "비밀번호 변경": "Change Password",
  "로그인 이메일 바꾸기": "Change login email",
  "내 데이터 내려받기": "Download my data",
  "단체나 브랜드를 넘겨줄 때 새 담당자의 이메일로 로그인 이메일을 바꿔요. 바꾸면 다른 기기에서는 로그아웃돼요.":
    "When you hand a group or brand over, change the login email to the new person's. Other devices are logged out.",
  "새 이메일로 인증번호를 보냈어요: {email}": "We sent a code to the new email: {email}",
  "새 로그인 이메일": "New login email",
  "새 로그인 이메일을 입력해 주세요.": "Please enter the new login email.",
  "인증번호를 입력해 주세요.": "Please enter the verification code.",
  "이메일 바꾸기": "Change email",
  "로그인 이메일을 바꿨어요. 다른 기기에서는 로그아웃됐어요.": "Login email changed. Other devices were logged out.",
  "내 데이터를 내려받았어요.": "Your data was downloaded.",
  "비밀번호를 바꾸면 다른 기기에서는 로그아웃돼요.": "Changing your password logs you out on other devices.",
  "지금 비밀번호": "Current password",
  "새 비밀번호 (8자 이상)": "New password (8+ characters)",
  "비밀번호 바꾸기": "Change password",

  // Ask the operators (modals/AskModal.tsx)
  "질문을 5자 이상 적어 주세요.": "Write at least 5 characters.",
  "관리자에게 질문하기": "Ask Our Team",
  "질문은 관리자가 확인한 뒤 답해요. 답변은 아래 ‘내 질문’에 표시돼요.":
    "Our team reads every question and replies. Answers show up under ‘My questions’ below.",
  "로그인하면 관리자에게 질문하고 답변을 받아볼 수 있어요.": "Log in to ask our team and get answers.",
  "질문 종류": "Question type",
  "질문 내용": "Your question",
  "궁금한 점을 적어 주세요. 오류라면 어느 화면에서 무엇을 눌렀는지 함께 적어 주시면 좋아요.":
    "What would you like to know? For a bug, tell us which screen you were on and what you tapped.",
  "질문을 보냈어요. 관리자가 답하면 아래 ‘내 질문’에서 볼 수 있어요.":
    "Question sent. You'll see our answer under ‘My questions’ below.",
  "보내는 중…": "Sending…",
  "질문 보내기": "Send question",
  "내 질문": "My questions",
  "아직 보낸 질문이 없어요.": "You haven't asked anything yet.",
  "답변 완료": "Answered",
  "답변 대기": "Waiting",
  "관리자 답변": "Our answer",

  // Operators (pages/AdminPage.tsx)
  "탈퇴한 회원": "Former member",
  답변: "Answer",
  "회원이 '내 질문'에서 보게 될 답변을 적어 주세요.": "Write the answer the member will see under 'My questions'.",
  "답변 보내기": "Send answer",
  "관리자 토큰이 맞지 않아요.": "That admin token doesn't match.",
  "답변을 보냈어요.": "Answer sent.",
  "운영자 화면": "Operator Console",
  "서비스 지표를 보고, 도움말 센터의 '관리자에게 질문하기'로 들어온 질문을 확인하고 답해요.":
    "Watch the service's figures, and read and answer the questions sent through 'Ask the Administrators' in the Help Center.",
  지표: "Figures",
  질문: "Questions",
  "큰 숫자는 실제 회원의 것이고, 작은 글씨는 데모 계정과 시드 데이터를 더한 값이에요.":
    "Large numbers are real members'; the small print adds the demo accounts and seed data.",
  "데모 포함 {count}": "{count} with demo data",
  "가입한 학생단체": "Student groups signed up",
  "가입한 브랜드": "Brands signed up",
  "이번 주 새 가입": "New this week",
  "등록된 행사": "Events registered",
  "다가오는 행사": "Upcoming events",
  "보낸 제안": "Proposals sent",
  "답변 대기 질문": "Questions waiting",
  "제안 수락률": "Proposal acceptance",
  나가기: "Sign out",
  "관리자 토큰": "Admin token",
  "서버의 ADMIN_TOKEN": "The server's ADMIN_TOKEN",
  "토큰은 이 탭에만 기억되고, 탭을 닫으면 지워져요.": "The token is kept in this tab only and cleared when you close it.",
  "질문 상태": "Question status",
  "답을 기다리는 질문이 없어요.": "No questions waiting for an answer.",
  "아직 답한 질문이 없어요.": "No answered questions yet.",

  // Help center (pages/FaqPage.tsx)
  "무엇을 도와드릴까요?": "How Can We Help?",
  "자주 묻는 질문 검색": "Search the FAQ",
  "궁금한 내용 검색 (예: 제안 취소)": "Search (e.g. cancel a proposal)",
  검색: "Search",
  "도움말 주제": "Help topics",
  "질문 1개": "1 question",
  "질문 {count}개": "{count:question|questions}",
  "‘{query}’ 검색 결과": "Results for ‘{query}’",
  "자주 묻는 질문": "Frequently Asked Questions",
  "자주 묻는 질문 전체 보기": "See all questions",
  "찾는 답이 없어요. 관리자에게 직접 물어보세요.": "Can't find your answer? Ask our team directly.",

  // Not found (pages/NotFoundPage.tsx)
  "페이지를 찾을 수 없어요": "Page Not Found",
  "주소가 바뀌었거나 없는 페이지예요. 홈이나 아래 메뉴에서 이어서 둘러보세요.":
    "This page has moved or never existed. Head home or pick a page below.",
  "홈으로 가기": "Go home",
  "주요 메뉴": "Main menu",

  // Terms and privacy frame (pages/LegalPage.tsx)
  "약관과 방침": "Terms and policies",
  "시행일 {date}": "Effective {date}",

  // Help topics and questions (data/faq.ts)
  시작하기: "Getting Started",
  "가입할 수 있는 사람과 가입 전에 둘러보는 방법": "Who can join, and how to look around first",
  "계정 · 소개": "Account · Profile",
  "내 정보와 다른 쪽에 보이는 우리 소개 관리": "Your account and the profile the other side sees",
  "협찬 제안": "Proposals",
  "제안을 보내고, 답을 받고, 거두는 방법": "Sending, answering and withdrawing proposals",
  "일정 등록": "Scheduling",
  "행사와 캠페인을 하루나 기간으로 등록하기": "Adding events and campaigns for a day or a stretch",
  메시지: "Messages",
  "상대에게 직접 묻고 대화를 관리하는 방법": "Asking the other side directly and managing chats",
  "성과 · 리포트": "Results · Reports",
  "현장 측정과 성과 리포트, 분석 보고서": "On-site measurement, reports and analytics",
  "누가 가입할 수 있나요?": "Who can sign up?",
  "학생단체와 브랜드가 가입할 수 있어요. 학생단체는 학교 이메일, 브랜드는 회사 이메일로 6자리 인증번호를 받아 확인한 뒤 가입해요.":
    "Student groups and brands. Student groups verify with a school email and brands with a work email, using a 6-digit code we send.",
  "가입하지 않고도 둘러볼 수 있나요?": "Can I look around without signing up?",
  "네. 로그인하지 않으면 학생단체 화면과 브랜드 화면을 데모 데이터로 둘러볼 수 있어요. 협찬 제안, 제안 수락, 일정 등록은 로그인한 뒤에 할 수 있어요.":
    "Yes. Without logging in, you can explore both the student group and brand screens with demo data. Sending or accepting proposals and adding events need an account.",
  "다른 쪽에 보이는 우리 소개는 어디서 고치나요?": "Where do I edit the profile others see?",
  "내 정보의 ‘소개 편집’에서 고쳐요. 여기서 쓴 소개가 브랜드·학생단체 목록과 상세 페이지에 그대로 보여요.":
    "Under ‘Edit Profile’ in My Account. What you write there appears as-is in the brand and student group listings and on your detail page.",
  "협찬 제안은 어떻게 주고받나요?": "How do proposals work?",
  "학생단체는 추천 매칭에서, 브랜드는 단체 찾기에서 상대에게 협찬을 제안해요. 학생단체가 보낸 제안은 계정이 있는 브랜드의 받은 제안에, 브랜드가 보낸 제안은 계정이 있는 학생단체의 받은 협찬에 도착해요. 받은 쪽이 수락하거나 거절하면 그 결과가 제안한 쪽 카드에 표시돼요.":
    "Student groups propose from Matches, brands from Find Groups. A group's proposal lands in the brand's Proposals, and a brand's lands in the group's Offers, as long as the other side has an account. Once they accept or decline, the result shows on the sender's card.",
  "보낸 제안을 거둘 수 있나요?": "Can I withdraw a proposal?",
  "네. 제안을 보낸 카드의 ‘제안 완료’ 아래 ‘제안 취소’를 누르면 거둘 수 있어요. 거절된 제안은 ‘다시 제안하기’로 한 번 더 보낼 수 있어요.":
    "Yes. On the card you proposed to, tap ‘Withdraw’ under ‘Proposed’. If a proposal is declined, you can send it once more with ‘Propose again’.",
  "행사나 캠페인 일정은 어떻게 등록하나요?": "How do I add an event or campaign?",
  "등록 페이지에서 이름과 인원, 협찬 유형을 고르고 달력에서 날짜를 골라요. 하루 일정은 한 번, 기간은 첫날과 마지막 날을 차례로 누르면 되고 최대 90일까지 고를 수 있어요.":
    "On the registration page, enter the name, headcount and sponsorship type, then pick dates on the calendar. Tap once for a single day, or tap the first and last day for a stretch of up to 90 days.",
  "상대에게 직접 물어볼 수 있나요?": "Can I message the other side directly?",
  "브랜드·학생단체 상세 페이지의 ‘문의하기’로 메시지를 보낼 수 있어요. 상대가 누구인지 알 수 있도록, 먼저 내 정보에서 우리 소개를 등록해야 해요.":
    "Yes, with ‘Contact’ on any brand or student group page. So they know who's writing, add your profile in My Account first.",
  "보낸 메시지를 고치거나 지울 수 있나요?": "Can I edit or delete a message?",
  "내가 보낸 메시지의 ⋯ 버튼에서 수정하거나 삭제할 수 있어요. 고친 메시지에는 ‘수정됨’, 지운 메시지는 삭제된 메시지로 양쪽 모두에게 보여요. 상대가 읽었는지도 메시지 옆에 표시돼요.":
    "Use the ⋯ button on a message you sent. Both sides see ‘Edited’ on a changed message and a placeholder for a deleted one. You can also see beside each message whether it's been read.",
  "협찬 성과는 어떻게 확인하나요?": "How do I track sponsorship results?",
  "행사 현장의 QR로 참여(스캔), 쿠폰 수령, 매장 방문을 집계해 목표와 비교해요. 학생단체는 성과 측정과 리포트에서, 브랜드는 성과 분석에서 협찬별 ROAS로 확인해요.":
    "A QR code at the event counts scans, coupons taken and store visits, then compares them with your goals. Student groups see this in Measurement and Reports; brands see ROAS per sponsorship in Analytics.",
  "리포트를 PDF로 받을 수 있나요?": "Can I get a report as a PDF?",
  "네. 학생단체는 리포트 페이지의 ‘PDF 리포트 다운로드’, 브랜드는 성과 분석의 ‘분석 보고서 다운로드’로 받아요. 브랜드 보고서에는 전체 요약과 협찬마다의 성과 페이지가 담겨요.":
    "Yes. Student groups use ‘Download PDF report’ on Reports; brands use ‘Download report’ in Analytics. The brand report has an overall summary plus a page for each sponsorship.",
}

export default en
