// 휴대폰 푸시 알림의 VAPID 키 한 쌍을 만들어 보여 준다(backend/src/lib/push.ts).
// 값은 저장하지 않는다. 호스트의 환경 변수에 직접 넣고, 비밀 키는 다른 곳에 남기지 않는다.
// 키를 바꾸면 켜 둔 기기는 모두 다시 켜야 한다.
import { createECDH } from "node:crypto"

const pair = createECDH("prime256v1")
pair.generateKeys()
console.log(`VAPID_PUBLIC_KEY=${pair.getPublicKey("base64url")}`)
// 앞의 0 바이트가 빠질 수 있어 32바이트로 채운다.
const secret = Buffer.alloc(32)
pair.getPrivateKey().copy(secret, 32 - pair.getPrivateKey().length)
console.log(`VAPID_PRIVATE_KEY=${secret.toString("base64url")}`)
