"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Mic,
  Camera,
  Send,
  User,
  Bot,
  FileSpreadsheet,
  MicOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMessageTime } from "@/lib/utils/formatters";
import { detectLanguage } from "@/lib/utils/language-detection";
import TextareaAutosize from "react-textarea-autosize";
import { Markdown } from "@/components/ui/markdown";

interface MessageItemProps {
  message: Message;
  onSuggestionClick: (suggestion: string) => void;
}

function MessageItem({ message, onSuggestionClick }: MessageItemProps) {
  return (
    <div
      className={cn(
        "flex gap-3",
        message.sender === "user" ? "justify-end" : "justify-start"
      )}
    >
      {message.sender === "assistant" && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "flex flex-col space-y-2 max-w-lg",
          message.sender === "user" ? "items-end" : "items-start"
        )}
      >
        <Card
          className={cn(
            "p-3",
            message.sender === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted",
            message.type === "error" && "border-destructive"
          )}
        >
          {message.sender === "assistant" ? (
            <Markdown content={message.content} className="text-sm" />
          ) : (
            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
          )}
        </Card>

        {message.suggestions && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.suggestions.map((suggestion, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => onSuggestionClick(suggestion)}
                className="text-xs"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}

        <span className="text-xs text-muted-foreground">
          {formatMessageTime(message.timestamp)}
        </span>
      </div>

      {message.sender === "user" && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback>
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onSuggestionClick: (suggestion: string) => void;
}

function MessageList({
  messages,
  isLoading,
  scrollAreaRef,
  onSuggestionClick,
}: MessageListProps) {
  return (
    <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
      <div className="space-y-4 max-w-4xl mx-auto">
        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            onSuggestionClick={onSuggestionClick}
          />
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <Card className="p-3 bg-muted">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-current rounded-full animate-pulse"></div>
                <div
                  className="w-2 h-2 bg-current rounded-full animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                />
                <div
                  className="w-2 h-2 bg-current rounded-full animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
            </Card>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  isListening: boolean;
  speechSupported: boolean;
  voiceLang: string;
  setVoiceLang: (lang: string) => void;
  onVoiceInput: () => void;
  onCSVImport: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function ChatInput({
  input,
  onInputChange,
  onSubmit,
  onKeyPress,
  isLoading,
  isListening,
  speechSupported,
  voiceLang,
  setVoiceLang,
  onVoiceInput,
  onCSVImport,
  onFileUpload,
}: ChatInputProps) {
  return (
    <div className="border-t p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="max-w-4xl mx-auto"
      >
        <div className="flex items-center gap-2 mb-2">
          <label htmlFor="voice-lang-select" className="text-sm font-medium">
            Voice Language:
          </label>
          <select
            id="voice-lang-select"
            value={voiceLang}
            onChange={(e) => setVoiceLang(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            disabled={isLoading}
          >
            <option value="en-US">English</option>
            <option value="ar-SA">العربية</option>
          </select>
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <TextareaAutosize
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyPress={onKeyPress}
              placeholder={
                isListening
                  ? "🎤 Listening... speak now"
                  : getPlaceholderText(input)
              }
              className={cn(
                "w-full resize-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-md",
                isListening && "border-red-300 bg-red-50 dark:bg-red-950/20"
              )}
              minRows={1}
              maxRows={4}
              disabled={isLoading}
            />
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant={isListening ? "default" : "outline"}
              size="icon"
              disabled={isLoading}
              onClick={onVoiceInput}
              title={
                !speechSupported
                  ? "Voice input not supported in your browser"
                  : isListening
                  ? "Click to stop recording"
                  : "Click to start voice input"
              }
              className={
                isListening ? "animate-pulse bg-red-500 hover:bg-red-600" : ""
              }
            >
              {isListening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={isLoading}
              title="Upload receipt (coming soon)"
            >
              <Camera className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={isLoading}
              onClick={onCSVImport}
              title="Import CSV file"
            >
              <FileSpreadsheet className="h-4 w-4" />
            </Button>
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <input
            type="file"
            accept=".csv"
            onChange={onFileUpload}
            className="hidden"
          />
        </div>
      </form>
    </div>
  );
}

interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
  timestamp: Date;
  type?: "text" | "transaction" | "help" | "error";
  suggestions?: string[];
}

interface ChatInterfaceProps {
  className?: string;
}

// Speech Recognition types
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
  pendingCSVImport?: { csvText: string };
}

// Get placeholder text based on detected language
function getPlaceholderText(input: string): string {
  const language = detectLanguage(input);

  const placeholders: Record<string, string> = {
    ar: "اكتب رسالتك... (مثال: دفعت 200 ريال على الطعام)",
    zh: "输入您的消息... (例如: 我花了100元买食物)",
    ja: "メッセージを入力... (例: 食料品に1000円使いました)",
    ko: "메시지를 입력하세요... (예: 식료품에 10000원 썼습니다)",
    hi: "अपना संदेश लिखें... (उदाहरण: मैंने खाने पर 100 रुपये खर्च किए)",
    tr: "Mesajınızı yazın... (örnek: yemek için 100 lira harcadım)",
    es: "Escribe tu mensaje... (ejemplo: gasté 25 euros en comida)",
    fr: "Écrivez votre message... (exemple: j'ai dépensé 30 euros pour la nourriture)",
    de: "Schreiben Sie Ihre Nachricht... (Beispiel: ich habe 40 Euro für Lebensmittel ausgegeben)",
    ru: "Напишите ваше сообщение... (пример: я потратил 3000 рублей на еду)",
    en: "Type your message... (e.g., 'I spent $50 on groceries')",
  };

  return placeholders[language.code] || placeholders.en;
}

export function ChatInterface({ className }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content:
        "Hi! I'm your personal finance assistant. I can help you track expenses, analyze spending, and answer questions about your finances in any language. Try one of the examples below or speak naturally in your preferred language!",
      sender: "assistant",
      timestamp: new Date(),
      type: "help",
      suggestions: [
        "I spent $50 on groceries",
        "دفعت 200 ريال على الطعام",
        "Gasté 25 euros en gasolina",
        "How much did I spend this month?",
        "كم أنفقت هذا الشهر؟",
        "¿Cuánto gasté este mes?",
      ],
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceLang, setVoiceLang] = useState("en-US"); // Language selector for voice input
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize speech recognition
  useEffect(() => {
    const windowWithSpeech = window as WindowWithSpeechRecognition;
    const SpeechRecognition =
      windowWithSpeech.SpeechRecognition ||
      windowWithSpeech.webkitSpeechRecognition;

    if (SpeechRecognition) {
      setSpeechSupported(true);

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = voiceLang; // Use selected language

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = "";
        let isFinal = false;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          transcript += result[0].transcript;
          if (result.isFinal) {
            isFinal = true;
          }
        }

        if (isFinal) {
          setInput((prev) => prev + (prev ? " " : "") + transcript);
          setIsListening(false);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);

        // Show error message to user
        const errorMessage: Message = {
          id: Date.now().toString(),
          content: `❌ Speech recognition error: ${event.error}. Please try again or type your message.`,
          sender: "assistant",
          timestamp: new Date(),
          type: "error",
        };
        setMessages((prev) => [...prev, errorMessage]);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [voiceLang]); // Add voiceLang to dependency array

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Handle CSV import confirmations
    if (content.includes("Yes, import all transactions")) {
      await handleCSVConfirmation(true);
      return;
    }
    if (content.includes("No, cancel import")) {
      await handleCSVConfirmation(false);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      sender: "user",
      timestamp: new Date(),
      type: "text",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Detect language for the message
      const detectedLanguage = detectLanguage(content.trim());
      console.log("Detected language:", detectedLanguage);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content.trim(),
          language: detectedLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Chat API response:", data);

      if (data.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.data.message,
          sender: "assistant",
          timestamp: new Date(),
          type: data.data.type || "text",
          suggestions: data.data.suggestions,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || "Unknown error from server");
      }
    } catch (error) {
      console.error("Error sending message:", error);

      let errorMessage = "Sorry, I encountered an error. Please try again.";

      if (error instanceof Error) {
        if (error.message.includes("fetch")) {
          errorMessage =
            "Network error. Please check your connection and try again.";
        } else if (error.message.includes("API key")) {
          errorMessage =
            "Configuration error. Please make sure your Gemini API key is configured correctly.";
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: errorMessage,
        sender: "assistant",
        timestamp: new Date(),
        type: "error",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const handleVoiceInput = async () => {
    if (!speechSupported) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content:
          "❌ Speech recognition is not supported in your browser. Please use Chrome, Safari, or Edge.",
        sender: "assistant",
        timestamp: new Date(),
        type: "error",
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        // Request microphone permission first
        await navigator.mediaDevices.getUserMedia({ audio: true });
        // Set recognition language before starting
        if (recognitionRef.current) {
          recognitionRef.current.lang = voiceLang;
          recognitionRef.current.start();
        }
      } catch (error) {
        console.error("Failed to start speech recognition:", error);

        let errorMsg = "❌ Failed to start voice input.";
        if (error instanceof Error) {
          if (error.name === "NotAllowedError") {
            errorMsg =
              "❌ Microphone access denied. Please allow microphone access and try again.";
          } else if (error.name === "NotFoundError") {
            errorMsg =
              "❌ No microphone found. Please connect a microphone and try again.";
          } else {
            errorMsg = `❌ Voice input error: ${error.message}`;
          }
        }

        const errorMessage: Message = {
          id: Date.now().toString(),
          content: errorMsg,
          sender: "assistant",
          timestamp: new Date(),
          type: "error",
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    }
  };

  const handleCSVImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset the input value to allow selecting the same file again
    event.target.value = "";

    if (!file.name.toLowerCase().endsWith(".csv")) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: "Please select a valid CSV file.",
        sender: "assistant",
        timestamp: new Date(),
        type: "error",
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    // Add user message about the upload
    const userMessage: Message = {
      id: Date.now().toString(),
      content: `📄 Uploading CSV file: ${file.name}`,
      sender: "user",
      timestamp: new Date(),
      type: "text",
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Read CSV file as text
      const csvText = await file.text();

      // Send CSV data to chat API for processing
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Please analyze and import this CSV file data:\n\n${csvText}`,
          type: "csv_import",
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.data.message,
          sender: "assistant",
          timestamp: new Date(),
          type: data.data.type || "text",
          suggestions: data.data.suggestions,
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Store CSV data for confirmation if needed
        if (data.data.requiresConfirmation) {
          (window as WindowWithSpeechRecognition).pendingCSVImport = {
            csvText,
          };
        }
      } else {
        throw new Error(data.error || "Failed to process CSV file");
      }
    } catch (error) {
      console.error("Error processing CSV:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Error processing CSV file: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Please make sure your file is a valid CSV.`,
        sender: "assistant",
        timestamp: new Date(),
        type: "error",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCSVConfirmation = async (confirm: boolean) => {
    const windowWithSpeech = window as WindowWithSpeechRecognition;
    const pendingImport = windowWithSpeech.pendingCSVImport;
    if (!pendingImport) return;

    if (!confirm) {
      const cancelMessage: Message = {
        id: Date.now().toString(),
        content: "❌ CSV import cancelled.",
        sender: "assistant",
        timestamp: new Date(),
        type: "text",
      };
      setMessages((prev) => [...prev, cancelMessage]);
      delete windowWithSpeech.pendingCSVImport;
      return;
    }

    setIsLoading(true);

    try {
      // Send confirmation to process the CSV import
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Process CSV import: ${pendingImport.csvText}`,
          type: "csv_import_confirm",
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          content: data.data.message,
          sender: "assistant",
          timestamp: new Date(),
          type: data.data.type || "text",
          suggestions: data.data.suggestions,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || "Failed to import CSV");
      }

      // Clean up
      delete windowWithSpeech.pendingCSVImport;
    } catch (error) {
      console.error("Error importing CSV:", error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: `❌ Error importing CSV: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        sender: "assistant",
        timestamp: new Date(),
        type: "error",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <MessageList
        messages={messages}
        isLoading={isLoading}
        scrollAreaRef={scrollAreaRef}
        onSuggestionClick={handleSuggestionClick}
      />
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSubmit={() => sendMessage(input)}
        onKeyPress={handleKeyPress}
        isLoading={isLoading}
        isListening={isListening}
        speechSupported={speechSupported}
        voiceLang={voiceLang}
        setVoiceLang={setVoiceLang}
        onVoiceInput={handleVoiceInput}
        onCSVImport={handleCSVImport}
        onFileUpload={handleFileUpload}
      />
    </div>
  );
}
