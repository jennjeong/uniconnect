import { useEffect, useState, type CSSProperties } from "react"

// "1,480,000원", "219%", "1,240명" 같은 값 속의 숫자는 나타날 때 주행
// 거리계처럼 말려 올라간다. 각 자리가 0에서 제 숫자까지 돌고 (오른쪽 자리는
// 조금 늦게), 값이 바뀌면 다시 돈다. 숫자는 텍스트에 그대로 남아 있어서 읽는
// 사람과 스크린 리더가 숫자 자체를 얻는다. 돌아가는 띠는 CSS가 그린다
// (.odometer-digit). 숫자가 없는 텍스트는 그대로 보인다. 숫자 뒤에 오는
// 말("원", "곳")은 별도의 span(.number-unit)이라 레이아웃이 따로 크기를 줄 수
// 있다. 어느 수치를 따르는지는 data-after에 담겨 있어, 좁은 "1" 뒤의 간격을
// 맞추는 데 쓴다.
export function AnimatedNumber({ value }: { value: string }) {
  const parts = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(value)
  // 첫 프레임은 0으로 두어 숫자가 거기서부터 굴러 올라오게 한다.
  const [rolled, setRolled] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRolled(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  if (!parts) return <>{value}</>
  const number = parts[2]
  let place = 0
  return (
    <>
      {parts[1]}
      <span className="odometer" data-rolled={rolled}>
        {[...number].map((char, index) => {
          if (!/\d/.test(char)) return char
          place += 1
          const style = { "--d": char, "--place": place } as CSSProperties
          return (
            <span className="odometer-digit" key={index} style={style}>
              {char}
            </span>
          )
        })}
      </span>
      {parts[3] && (
        <span className="number-unit" data-after={number.slice(-1)}>
          {parts[3]}
        </span>
      )}
    </>
  )
}
