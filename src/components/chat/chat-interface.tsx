"use client";

import { useState, useRef, useEffect , useCallback} from "react";
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

import { parseSpreadsheetFile } from "@/lib/utils/parsers";

import TextareaAutosize from "react-textarea-autosize";
import { Markdown } from "@/components/ui/markdown";
import logger from "@/lib/utils/logger";


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
    <ScrollArea ref={scrollAreaRef} className="flex-1 p-3 sm:p-4 min-h-0">
      <div className="space-y-4 max-w-4xl mx-auto pb-24">
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
  onSubmit: (e: React.FormEvent) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  isListening: boolean;
  speechSupported: boolean;
  onVoiceInput: () => void;
  onCSVImport: () => void;
  onReceiptUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  receiptFileInputRef: React.RefObject<HTMLInputElement | null>;
  recordingTime: number;
  onFocus?: () => void;
}

function ChatInput({
  input,
  onInputChange,
  onSubmit,
  onKeyPress,
  isLoading,
  isListening,
  speechSupported,
  onVoiceInput,
  onCSVImport,
  onReceiptUpload,
  receiptFileInputRef,
  recordingTime,
  onFocus,
}: ChatInputProps) {
  return (
    <div className="sticky bottom-0 z-10 border-t p-3 sm:p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-[env(safe-area-inset-bottom)]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(e);
        }}
        className="max-w-4xl mx-auto"
        onClick={() => onFocus?.()}
      >
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-start">
          <div className="flex-1 relative w-full">
            <TextareaAutosize
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyPress={onKeyPress}
              onFocus={() => onFocus?.()}
              placeholder={
                isListening
                  ? `🎤 Listening... ${recordingTime > 0 ? `(${recordingTime}s)` : ''}`
                  : getPlaceholderText()
              }
              className={cn(
                "w-full resize-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-md min-h-[40px] sm:min-h-[36px] max-h-[160px] overflow-y-auto",
                isListening && "border-red-300 bg-red-50 dark:bg-red-950/20"
              )}
              minRows={1}
              maxRows={5}
              disabled={isLoading}
            />
          </div>
          <div className="flex gap-2 items-center sm:items-start flex-wrap sm:flex-nowrap justify-end">
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !input.trim()}
              title="Send message"
              className="h-[36px] w-[36px] rounded-md flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
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
                  : "Click to start voice input (20s max)"
              }
              className={cn(
                "h-[36px] w-[36px] rounded-md flex-shrink-0",
                isListening ? "animate-pulse bg-red-500 hover:bg-red-600" : ""
              )}
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
              onClick={() => receiptFileInputRef.current?.click()}
              title="Upload receipt"
              className="h-[36px] w-[36px] rounded-md flex-shrink-0"
            >
              <Camera className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={isLoading}
              onClick={onCSVImport}
              title="Import CSV/Excel file"
              className="h-[36px] w-[36px] rounded-md flex-shrink-0"
            >
              <FileSpreadsheet className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <input
          type="file"
          ref={receiptFileInputRef}
          onChange={onReceiptUpload}
          accept="image/*,.pdf"
          className="hidden"
        />
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
  pendingReceiptData?: any;
}

// Get placeholder text - AI will handle language detection naturally
function getPlaceholderText(): string {
  // Default to English placeholder, AI will respond in user's language
  return "Type your message... (e.g., 'I spent $50 on groceries')";
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
  const [ttsEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [lastUploadedFile, setLastUploadedFile] = useState<{ name: string; size: number; lastModified: number } | null>(null);
  const [lastUploadedReceipt, setLastUploadedReceipt] = useState<{ name: string; size: number; lastModified: number } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const useMediaRecorderRef = useRef<boolean>(false);

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

  // Initialize voice capability detection (Gemini STT via MediaRecorder only)
  useEffect(() => {
    const windowWithSpeech = window as WindowWithSpeechRecognition;
    const SpeechRecognition =
      windowWithSpeech.SpeechRecognition ||
      windowWithSpeech.webkitSpeechRecognition;

    // Prefer MediaRecorder capability for Gemini STT
    const hasMediaRecorder = typeof (window as any).MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    if (hasMediaRecorder) {
      setSpeechSupported(true);
      useMediaRecorderRef.current = true;
    } else {
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []); // Remove voiceLang dependency since we're using auto-detection

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Handle CSV import confirmations
    if (content.includes("Confirm Import")) {
      await handleCSVConfirmation(true);
      return;
    }
    if (content.includes("Cancel Import")) {
      await handleCSVConfirmation(false);
      return;
    }

    // Handle receipt confirmations (English and Arabic)
    if (content.includes("Yes, save this transaction") || content.includes("نعم، احفظ هذه المعاملة")) {
      await handleReceiptConfirmation(true);
      return;
    }
    if (content.includes("No, cancel") || content.includes("لا، إلغاء")) {
      await handleReceiptConfirmation(false);
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
      // Let AI handle language detection naturally. Enable streaming for faster first token.
      const response = await fetch("/api/chat?stream=1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Streaming mode if server supports it; fallback to JSON
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let acc = '';
        const msgId = (Date.now() + 1).toString();
        let created = false;
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          // Push partials in chunks
          if (!created) {
            created = true;
            setMessages((prev) => [...prev, { id: msgId, content: '', sender: 'assistant', timestamp: new Date(), type: 'text' }]);
          }
          setMessages((prev) => prev.map(m => m.id === msgId ? { ...m, content: acc } : m));
        }
        // TTS after render
        if (ttsEnabled && acc.trim()) {
          fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: acc, voice: 'Puck', responseMimeType: 'audio/mp3' }),
          })
            .then(res => res.json())
            .then(ttsJson => {
              if (ttsJson?.success && ttsJson.audio) {
                const audioSrc = `data:${ttsJson.mimeType || 'audio/mp3'};base64,${ttsJson.audio}`;
                const audio = new Audio(audioSrc);
                audio.play().catch(() => {});
              }
            })
            .catch(() => {});
        }
      } else {
        const data = await response.json();
        logger.info({data}, "Chat API response:");
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
          if (ttsEnabled && assistantMessage.content.trim()) {
            fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: assistantMessage.content, voice: 'Puck', responseMimeType: 'audio/mp3' }),
            })
              .then(res => res.json())
              .then(ttsJson => {
                if (ttsJson?.success && ttsJson.audio) {
                  const audioSrc = `data:${ttsJson.mimeType || 'audio/mp3'};base64,${ttsJson.audio}`;
                  const audio = new Audio(audioSrc);
                  audio.play().catch(() => {});
                }
              })
              .catch(() => {});
          }
        } else {
          throw new Error(data.error || 'Unknown error from server');
        }
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
  }, [isLoading]);

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
          "❌ Voice input is not supported in your browser.",
        sender: "assistant",
        timestamp: new Date(),
        type: "error",
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    if (useMediaRecorderRef.current) {
      if (isListening) {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        audioChunksRef.current = [];
        const mediaRecorder = new (window as any).MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.onstart = () => {
          setIsListening(true);
          setRecordingTime(0);
          recordingTimerRef.current = setInterval(() => {
            setRecordingTime((prev) => {
              if (prev >= 20) {
                mediaRecorder.stop();
                return 0;
              }
              return prev + 1;
            });
          }, 1000);
        };
        mediaRecorder.ondataavailable = (e: BlobEvent) => {
          if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorder.onstop = async () => {
          try {
            const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
            const formData = new FormData();
            formData.append('audio', blob, 'recording.webm');
            const sttRes = await fetch('/api/stt', { method: 'POST', body: formData });
            const sttJson = await sttRes.json();
            if (sttJson.success && typeof sttJson.text === 'string' && sttJson.text.trim()) {
              const transcript = sttJson.text.trim();
              // Send silently (don't show transcript)
              setTimeout(() => { sendMessage(transcript); }, 0);
            } else {
              const errorMessage: Message = { id: Date.now().toString(), content: '❌ Could not transcribe audio. Please try again.', sender: 'assistant', timestamp: new Date(), type: 'error' };
              setMessages((prev) => [...prev, errorMessage]);
            }
          } catch (error) {
            const errorMessage: Message = { id: Date.now().toString(), content: `❌ Voice input error: ${error instanceof Error ? error.message : 'Unknown error'}`, sender: 'assistant', timestamp: new Date(), type: 'error' };
            setMessages((prev) => [...prev, errorMessage]);
          } finally {
            setIsListening(false);
            if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
            setRecordingTime(0);
            if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
          }
        };
        mediaRecorder.start();
      } catch (error) {
        console.error('Failed to start voice input:', error);
        let errorMsg = '❌ Failed to start voice input.';
        if (error instanceof Error) {
          if ((error as any).name === 'NotAllowedError') errorMsg = '❌ Microphone access denied. Please allow microphone access and try again.';
          else if ((error as any).name === 'NotFoundError') errorMsg = '❌ No microphone found. Please connect a microphone and try again.';
          else errorMsg = `❌ Voice input error: ${error.message}`;
        }
        const errorMessage: Message = { id: Date.now().toString(), content: errorMsg, sender: 'assistant', timestamp: new Date(), type: 'error' };
        setMessages((prev) => [...prev, errorMessage]);
      }
      return;
    }
    // No Web Speech fallback; Gemini STT only
  };

  const handleCSVImport = () => {
      logger.info("CSV Import button clicked");
      logger.info({ fileInputRef: fileInputRef.current }, "fileInputRef.current");
    fileInputRef.current?.click();
  };

  const handleReceiptUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset the input value to allow selecting the same file again
    event.target.value = "";



    // Validate file type
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: "Please select an image file (JPEG, PNG) or PDF.",
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
      content: `📷 Uploading receipt: ${file.name}`,
      sender: "user",
      timestamp: new Date(),
      type: "text",
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    // No receiptSaveMode logic

    try {
      const formData = new FormData();
      formData.append("receipt", file);

      const response = await fetch("/api/receipt", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to process receipt");
      }

      // Format receipt data for display with language support
      const receiptData = result.data;
      const isArabic = receiptData.detectedLanguage === "ar";
      
      // Format content based on detected language
      const formattedContent = isArabic 
        ? `📄 **تفاصيل الإيصال**\n\n**التاجر:** ${receiptData.merchant}\n**التاريخ:** ${receiptData.date}\n**المجموع:** **${receiptData.total} ${receiptData.currency}**\n**طريقة الدفع:** ${receiptData.paymentMethod || 'غير محددة'}\n**مستوى الثقة:** ${(receiptData.confidence * 100).toFixed(0)}%\n\n${receiptData.lineItems.length > 0 ? `**المواد:**\n${receiptData.lineItems.map((item: any) => `• ${item.description} - ${item.subtotal} ${receiptData.currency}`).join('\\n')}` : ''}\n\n${receiptData.splits.length > 0 ? `**التقسيمات:**\n${receiptData.splits.map((split: any) => `• ${split.person} - ${split.amount} ${receiptData.currency}`).join('\\n')}` : ''}\n\n${receiptData.unclearFields.length > 0 ? `**الحقول غير الواضحة:** ${receiptData.unclearFields.join(', ')}` : ''}`
        : `📄 **Receipt Details**\n\n**Merchant:** ${receiptData.merchant}\n**Date:** ${receiptData.date}\n**Total:** **${receiptData.total} ${receiptData.currency}**\n**Payment Method:** ${receiptData.paymentMethod || 'Not specified'}\n**Confidence:** ${(receiptData.confidence * 100).toFixed(0)}%\n\n${receiptData.lineItems.length > 0 ? `**Items:**\n${receiptData.lineItems.map((item: any) => `• ${item.description} - ${item.subtotal} ${receiptData.currency}`).join('\\n')}` : ''}\n\n${receiptData.splits.length > 0 ? `**Splits:**\n${receiptData.splits.map((split: any) => `• ${split.person} - ${split.amount} ${receiptData.currency}`).join('\\n')}` : ''}\n\n${receiptData.unclearFields.length > 0 ? `**Unclear Fields:** ${receiptData.unclearFields.join(', ')}` : ''}`;

      // If there are unclear fields (except paymentMethod), show a follow-up message
      if (receiptData.unclearFields && receiptData.unclearFields.length > 0) {
        const followUpMsg = isArabic
          ? `❓ بعض الحقول غير واضحة: ${receiptData.unclearFields.join(', ')}. يرجى التوضيح.`
          : `❓ Some fields are unclear: ${receiptData.unclearFields.join(', ')}. Please clarify.`;
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 2).toString(),
            content: followUpMsg,
            sender: "assistant",
            timestamp: new Date(),
            type: "error",
          },
        ]);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: formattedContent,
        sender: "assistant",
        timestamp: new Date(),
        type: "text",
        suggestions: isArabic 
          ? ["نعم، احفظ هذه المعاملة", "لا، إلغاء"]
          : ["Yes, save this transaction", "No, cancel"],
      };

      setMessages((prev) => [...prev, assistantMessage]);

              // Store receipt data for confirmation in window object
        (window as WindowWithSpeechRecognition).pendingReceiptData = receiptData;

        // Track the uploaded receipt to prevent duplicates
        setLastUploadedReceipt({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified
        });

        // Clear the tracking after 5 minutes to allow re-upload
        setTimeout(() => {
          setLastUploadedReceipt(null);
        }, 5 * 60 * 1000); // 5 minutes
      // No receiptSaveMode logic
    } catch (error) {
      console.error("Error processing receipt:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Error processing receipt: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Please try again or upload a clearer image.`,
        sender: "assistant",
        timestamp: new Date(),
        type: "error",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
          logger.info("File upload triggered");
    const file = event.target.files?.[0];
    if (!file) return;

          logger.info({ 
        fileName: file.name, 
        fileType: file.type, 
        fileSize: file.size 
      }, "File selected");

    // Reset the input value to allow selecting the same file again
    event.target.value = "";



    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      logger.info({ fileName: file.name, fileType: file.type }, "File is not a supported spreadsheet format");
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: "Please select a valid CSV or Excel file (.csv, .xlsx, .xls).",
        sender: "assistant",
        timestamp: new Date(),
        type: "error",
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    // Add user message about the upload
    const fileType = fileName.endsWith('.csv') ? 'CSV' : 'Excel';
    const userMessage: Message = {
      id: Date.now().toString(),
      content: `📄 Uploading ${fileType} file: ${file.name}`,
      sender: "user",
      timestamp: new Date(),
      type: "text",
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      let fileData: string;
      
      if (fileName.endsWith('.csv')) {
        // Read CSV file as text
        fileData = await file.text();
      } else {
        // For Excel files, parse and convert to CSV format
        const preview = await parseSpreadsheetFile(file);
        const allData = [preview.headers, ...preview.rows];
        
        // Convert to CSV string format
        fileData = allData.map(row => 
          row.map(cell => `"${cell || ''}"`).join(',')
        ).join('\n');
      }

      // Send spreadsheet data to chat API for processing
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Please analyze and import this spreadsheet file data:\n\n${fileData}`,
          type: "csv_import",
          fileInfo: {
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            type: fileName.endsWith('.csv') ? 'CSV' : 'Excel'
          },
          previousFile: lastUploadedFile
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

        // Handle duplicate detection
        if (data.data.isDuplicate) {
          // Don't track duplicate files
          return;
        }

        // Store spreadsheet data for confirmation if needed
        if (data.data.requiresConfirmation) {
          (window as WindowWithSpeechRecognition).pendingCSVImport = {
            csvText: fileData,
          };
        }

        // Track the uploaded file only if it's not a duplicate
        if (data.data.fileInfo) {
          // Let AI handle language detection naturally
          setLastUploadedFile({
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
          });

          // Clear the tracking after 5 minutes to allow re-upload
          setTimeout(() => {
            setLastUploadedFile(null);
          }, 5 * 60 * 1000); // 5 minutes
        }
      } else {
        throw new Error(data.error || "Failed to process CSV file");
      }
    } catch (error) {
      console.error("Error processing spreadsheet:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Error processing spreadsheet file: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Please make sure your file is a valid CSV or Excel file.`,
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
        content: "❌ Spreadsheet import cancelled.",
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
        throw new Error(data.error || "Failed to import spreadsheet");
      }

      // Clean up
      delete windowWithSpeech.pendingCSVImport;
    } catch (error) {
      console.error("Error importing CSV:", error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: `❌ Error importing spreadsheet: ${
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

  // Add handler for save mode selection
  // Remove receiptSaveMode state and related logic

  const handleReceiptConfirmation = async (confirm: boolean) => {
    const windowWithSpeech = window as WindowWithSpeechRecognition;
    const pendingReceipt = windowWithSpeech.pendingReceiptData;
    if (!pendingReceipt) return;

    if (!confirm) {
      // Let AI handle language detection naturally
      const cancelContent = "❌ Receipt transaction cancelled.";
      
      const cancelMessage: Message = {
        id: Date.now().toString(),
        content: cancelContent,
        sender: "assistant",
        timestamp: new Date(),
        type: "text",
      };
      setMessages((prev) => [...prev, cancelMessage]);
      delete windowWithSpeech.pendingReceiptData;
      return;
    }

    setIsLoading(true);

    try {
      // Always save as a single total transaction
      const transaction = {
        date: new Date(pendingReceipt.date),
        amount: pendingReceipt.total,
        currency: pendingReceipt.currency,
        vendor: pendingReceipt.merchant,
        description: `Receipt: ${pendingReceipt.merchant}`,
        category: pendingReceipt.lineItems[0]?.category || "Other",
        type: "expense" as const,
        originalAmount: pendingReceipt.total,
        originalCurrency: pendingReceipt.currency,
        convertedAmount: pendingReceipt.convertedTotal,
        convertedCurrency: "USD",
        conversionRate: pendingReceipt.exchangeRate
      };
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transaction),
      });
      // Let AI handle language detection naturally
      const successContent = `✅ Transaction saved successfully! **${pendingReceipt.total} ${pendingReceipt.currency}** spent at ${pendingReceipt.merchant}.`;
      
      const successMessage: Message = {
        id: Date.now().toString(),
        content: successContent,
        sender: "assistant",
        timestamp: new Date(),
        type: "text",
      };
      setMessages((prev) => [...prev, successMessage]);

      // Clean up
      delete windowWithSpeech.pendingReceiptData;
    } catch (error) {
      console.error("Error saving receipt transaction:", error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: `❌ Error saving transaction: ${
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
    <div className={cn("flex flex-col h-full w-full overflow-hidden", className)}>
      <MessageList
        messages={messages}
        isLoading={isLoading}
        scrollAreaRef={scrollAreaRef}
        onSuggestionClick={handleSuggestionClick}
      />
      <ChatInput
        input={input}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onKeyPress={handleKeyPress}
        isLoading={isLoading}
        isListening={isListening}
        speechSupported={speechSupported}
        onVoiceInput={handleVoiceInput}
        onCSVImport={handleCSVImport}
        onReceiptUpload={handleReceiptUpload}
        receiptFileInputRef={receiptFileInputRef}
        recordingTime={recordingTime}
        onFocus={scrollToBottom}
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".csv,.xlsx,.xls"
        className="hidden"
      />
    </div>
  );
}
