import { ChatOpenAI } from '@langchain/openai'
import {
  HumanMessage,
  SystemMessage,
  MessageContent,
  MessageContentComplex,
} from '@langchain/core/messages'

// 1. OpenAI API 키 가져오기
const apiKey = import.meta.env.VITE_OPENAI_API_KEY
if (!apiKey) {
  throw new Error('OpenAI API key is not defined in environment variables')
}

// 2. ChatOpenAI 모델 생성
const model = new ChatOpenAI({ model: 'gpt-4o-mini', apiKey })

/**
 * 사용자 입력 메시지를 ChatOpenAI 모델에 전달하고, 응답 받기
 *
 * @param userMessage   사용자 입력 메시지
 * @returns
 */
export async function getChatResponse(userMessage: string) {
  // 3. Prompt 설정
  const messages = [
    new SystemMessage('Translate the following from Korean into English'),
    new HumanMessage(userMessage),
  ]
  // 3-1. 아래의 두 가지 형식도 가능
  // const simpleMessage = 'Hello, how are you?'
  // const roleMessage = [{ role: 'user', content: simpleMessage }]

  // 4. ChatOpenAI 모델에 메시지 전달 후 응답 받기
  const response = await model.invoke(messages)
  // const response2 = await model.invoke(simpleMessage)
  // const response3 = await model.invoke(roleMessage)
  console.log(response.content)

  // 5. 응답 메시지 반환
  return parseContent(response.content)
}

/**
 * 사용자 입력 메시지를 ChatOpenAI 모델에 전달하고, 스트림으로 받은 메시지를 처리
 *
 * @param userMessage   사용자 입력 메시지
 * @param onMessage     스트림으로 받은 메시지를 처리하는 콜백 함수
 */
export async function streamChatResponse(
  userMessage: string,
  onMessage: (message: string) => void,
) {
  // 3. Prompt 설정
  const messages = [
    new SystemMessage('Translate the following from Korean into English'),
    new HumanMessage(userMessage),
  ]

  // 4. ChatOpenAI 모델에 메시지 전달 후 스트림으로 응답 받기
  const stream = await model.stream(messages)

  // 5. 스트림으로 받은 메시지 처리
  const chunks = []
  for await (const chunk of stream) {
    const content = parseContent(chunk.content)
    chunks.push(content)
    // 6. 메시지를 callback 함수로 전달
    onMessage(content)
  }
  console.log(chunks)
}

/**
 * MessageContent 또는 MessageContentComplex를 문자열로 변환
 *
 * @param content   MessageContent | MessageContentComplex
 * @returns
 */
function parseContent(content: MessageContent | MessageContentComplex): string {
  if (typeof content === 'string') {
    return content
  } else if (Array.isArray(content)) {
    return (content as MessageContentComplex[]).map(parseContent).join(' ')
  }
  return ''
}
