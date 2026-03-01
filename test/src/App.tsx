import { useState } from 'react'
import langchainLogo from './assets/langchain-logo.png'
import openAILogo from './assets/openai.svg'
import reactLogo from './assets/react.svg'
import { getChatResponse, streamChatResponse } from './ai/chatService'
import './App.css'

function App() {
  const [userMessage, setUserMessage] = useState('')
  const [chatResponse, setChatResponse] = useState('')

  const handleSendMessage = async () => {
    const response = await getChatResponse(userMessage)
    setChatResponse(response) // Assuming 'text' is the string property of AIMessageChunk
  }

  const handleStreamMessage = async () => {
    setChatResponse('') // Clear previous response
    await streamChatResponse(userMessage, (message) => {
      setChatResponse((prev) => prev + message)
    })
  }

  return (
    <>
      <div className="logos">
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo_react" alt="React logo" />
        </a>
        <a href="https://js.langchain.com/docs/introduction/" target="_blank">
          <img
            src={langchainLogo}
            className="logo_langchain"
            alt="LangChain logo"
            width="80"
            height="80"
          />
        </a>
        <a href="https://platform.openai.com/" target="_blank">
          <img src={openAILogo} className="logo_openai" alt="OpenAI logo" />
        </a>
      </div>
      <div className="title">
        <h3>Chat with React + LangChain + Open AI</h3>
        <p>
          Converts korean to english
          <br />
          OpenAI's GPT-4o-mini model via LangChain
        </p>
      </div>
      <div className="chatbox">
        <input
          type="text"
          value={userMessage}
          onChange={(e) => setUserMessage(e.target.value)}
          placeholder="Type your message here"
        />
        <div className="buttons">
          <button onClick={handleSendMessage}>Send</button>
          <button onClick={handleStreamMessage}>Stream</button>
        </div>
      </div>
      <div className="response">
        <p>Response: </p>
        <p>{chatResponse}</p>
      </div>
    </>
  )
}

export default App
