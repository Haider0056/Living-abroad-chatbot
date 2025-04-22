"use client";

import { useState, useEffect, useRef } from "react";
import { ChatBotWidget } from "chatbot-widget-ui";

export default function ChatWindow() {
  const [chatHistory, setChatHistory] = useState<
    { sender: string; text: string; isLoading?: boolean }[]
  >([]);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, streamingMessage]);

  // Load threadId and chat history from localStorage on initial render
  useEffect(() => {
    try {
      // Load threadId
      const savedThreadId = localStorage.getItem("chatThreadId");
      if (savedThreadId) {
        setThreadId(savedThreadId);
      }
      
      // Load chat history
      const savedHistory = localStorage.getItem("chatHistory");
      if (savedHistory) {
        setChatHistory(JSON.parse(savedHistory));
      }
    } catch (e) {
      console.error("Failed to load data from storage:", e);
    }
  }, []);

  // Save threadId to localStorage whenever it changes
  useEffect(() => {
    if (threadId) {
      localStorage.setItem("chatThreadId", threadId);
    }
  }, [threadId]);

  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
    }
  }, [chatHistory]);

  const cleanResponseText = (text: string): string => {
    // First check if the text is wrapped in {"response":"..."} format
    const responsePattern = /^\s*\{\s*"response"\s*:\s*"([\s\S]+)"\s*\}\s*$/;
    const responseMatch = text.match(responsePattern);
    if (responseMatch) {
      text = responseMatch[1];
    }
    
    // Replace escaped newlines with actual newlines
    let cleaned = text.replace(/\\n/g, "\n");
    
    // Remove any remaining escape sequences
    cleaned = cleaned.replace(/\\(.)/g, "$1");
    
    // Handle standard Markdown bold text (**word**)
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    
    // Handle Markdown headings (### Heading)
    cleaned = cleaned.replace(/###\s+([^\n]+)/g, '\n<h3>$1</h3>\n');
    
    // Handle any JSON-related formatting issues
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }
    
    return cleaned;
  };

  const callApiHandler = async (message: string): Promise<string> => {
    try {
      setIsTyping(true);
      setStreamingMessage("");
      
      
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message,
          threadId // Send just the threadId
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "API request failed");
      }

      const responseData = await res.json();
      
      // Update threadId from response
      if (responseData.threadId) {
        setThreadId(responseData.threadId);
      }
      
      const responseText = responseData.response || "";
      const cleanedResponse = cleanResponseText(responseText);
      
      setIsTyping(false);
      return cleanedResponse;
    } catch (error) {
      console.error("Chat failed:", error);
      setIsTyping(false);
      return "Sorry, there was an error processing your request.";
    }
  };

  // Transform chat history to the expected format for the ChatBotWidget
  const formattedMessages = [
    ...chatHistory.map((chat) => ({
      content: chat.text,
      role: chat.sender === "user" ? "user" : "assistant",
    })),
    // Add streaming message if it exists
    ...(streamingMessage 
      ? [{ content: streamingMessage, role: "assistant", isTyping: true }] 
      : [])
  ];



  return (
    <div className="flex flex-col w-full h-full">

      
      <div className="flex-1">
        <ChatBotWidget
          callApi={callApiHandler}
          onBotResponse={(response: string) => {
            // Only add the response to history if it's not already being streamed
            if (!isTyping) {
              setChatHistory((prev) => [
                ...prev,
                { sender: "bot", text: cleanResponseText(response) },
              ]);
            }
            setStreamingMessage("");
          }}
          handleNewMessage={(newMessage: string | { content?: string }) => {
            const messageText = typeof newMessage === "string"
              ? newMessage
              : newMessage.content || JSON.stringify(newMessage);
              
            setChatHistory((prev) => [
              ...prev,
              { sender: "user", text: messageText },
            ]);
          }}
          messages={formattedMessages}
          primaryColor="#3498db"
          inputMsgPlaceholder="Type your message..."
          chatbotName="Customer Support"
          isTypingMessage={isTyping ? "Typing..." : ""}
          IncommingErrMsg="Oops! Something went wrong. Try again."
          chatIcon={<div>O</div>}
          botIcon={<div>B</div>}
          botFontStyle={{
            fontFamily: "Arial",
            fontSize: "14px",
            color: "#006633",
          }}
          typingFontStyle={{
            fontFamily: "Arial",
            fontSize: "12px",
            color: "#888",
            fontStyle: "italic",
          }}
          useInnerHTML={true}
        />
      </div>
    </div>
  );
}