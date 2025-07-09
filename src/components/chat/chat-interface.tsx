"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mic, Camera, Send, User, Bot, Upload, FileSpreadsheet, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMessageTime } from "@/lib/utils/formatters";
import TextareaAutosize from "react-textarea-autosize";
import { Markdown } from "@/components/ui/markdown";

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  type?: 'text' | 'transaction' | 'help' | 'error';
  suggestions?: string[];
}

interface ChatInterfaceProps {
  className?: string;
}

// Simple language detection function
function detectLanguage(text: string): string {
  // Check for Arabic characters
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  if (arabicRegex.test(text)) {
    return 'ar';
  }
  
  // Check for other common languages
  const chineseRegex = /[\u4E00-\u9FFF]/;
  if (chineseRegex.test(text)) {
    return 'zh';
  }
  
  const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  if (japaneseRegex.test(text)) {
    return 'ja';
  }
  
  const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
  if (koreanRegex.test(text)) {
    return 'ko';
  }
  
  const hindiRegex = /[\u0900-\u097F]/;
  if (hindiRegex.test(text)) {
    return 'hi';
  }
  
  // Default to English
  return 'en';
}

export function ChatInterface({ className }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: 'Hi! I\'m your personal finance assistant. I can help you track expenses, analyze spending, and answer questions about your finances. Try saying something like "I bought coffee for $5" or "How much did I spend this month?"',
      sender: 'assistant',
      timestamp: new Date(),
      type: 'help',
      suggestions: [
        "I bought coffee for $5",
        "How much did I spend this month?",
        "Show me my food expenses"
      ]
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
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
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setSpeechSupported(true);
      
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        setIsListening(true);
      };
      
      recognition.onresult = (event: any) => {
        let transcript = '';
        let isFinal = false;
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          transcript += result[0].transcript;
          if (result.isFinal) {
            isFinal = true;
          }
        }
        
        if (isFinal) {
          setInput(prev => prev + (prev ? ' ' : '') + transcript);
          setIsListening(false);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        // Show error message to user
        const errorMessage: Message = {
          id: Date.now().toString(),
          content: `❌ Speech recognition error: ${event.error}. Please try again or type your message.`,
          sender: 'assistant',
          timestamp: new Date(),
          type: 'error'
        };
        setMessages(prev => [...prev, errorMessage]);
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
  }, []);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Handle CSV import confirmations
    if (content.includes('Yes, import all transactions')) {
      await handleCSVConfirmation(true);
      return;
    }
    if (content.includes('No, cancel import')) {
      await handleCSVConfirmation(false);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Detect language for the message
      const detectedLanguage = detectLanguage(content.trim());
      console.log('Detected language:', detectedLanguage);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: content.trim(),
          language: detectedLanguage
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Chat API response:', data);

      if (data.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.data.message,
          sender: 'assistant',
          timestamp: new Date(),
          type: data.data.type || 'text',
          suggestions: data.data.suggestions
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || 'Unknown error from server');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('API key')) {
          errorMessage = 'Configuration error. Please make sure your Gemini API key is configured correctly.';
        } else {
          errorMessage = `Error: ${error.message}`;
        }
      }
      
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: errorMessage,
        sender: 'assistant',
        timestamp: new Date(),
        type: 'error'
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
        content: '❌ Speech recognition is not supported in your browser. Please use Chrome, Safari, or Edge.',
        sender: 'assistant',
        timestamp: new Date(),
        type: 'error'
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        // Request microphone permission first
        await navigator.mediaDevices.getUserMedia({ audio: true });
        recognitionRef.current?.start();
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
        
        let errorMsg = '❌ Failed to start voice input.';
        if (error instanceof Error) {
          if (error.name === 'NotAllowedError') {
            errorMsg = '❌ Microphone access denied. Please allow microphone access and try again.';
          } else if (error.name === 'NotFoundError') {
            errorMsg = '❌ No microphone found. Please connect a microphone and try again.';
          } else {
            errorMsg = `❌ Voice input error: ${error.message}`;
          }
        }
        
        const errorMessage: Message = {
          id: Date.now().toString(),
          content: errorMsg,
          sender: 'assistant',
          timestamp: new Date(),
          type: 'error'
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    }
  };

  const handleCSVImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset the input value to allow selecting the same file again
    event.target.value = '';

    if (!file.name.toLowerCase().endsWith('.csv')) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: 'Please select a valid CSV file.',
        sender: 'assistant',
        timestamp: new Date(),
        type: 'error'
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    // Add user message about the upload
    const userMessage: Message = {
      id: Date.now().toString(),
      content: `📄 Uploading CSV file: ${file.name}`,
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Read CSV file as text
      const csvText = await file.text();
      
      // Send CSV data to chat API for processing
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: `Please analyze and import this CSV file data:\n\n${csvText}`,
          type: 'csv_import'
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.data.message,
          sender: 'assistant',
          timestamp: new Date(),
          type: data.data.type || 'text',
          suggestions: data.data.suggestions
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Store CSV data for confirmation if needed
        if (data.data.requiresConfirmation) {
          (window as any).pendingCSVImport = { csvText };
        }
      } else {
        throw new Error(data.error || 'Failed to process CSV file');
      }

    } catch (error) {
      console.error('Error processing CSV:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Error processing CSV file: ${error instanceof Error ? error.message : 'Unknown error'}. Please make sure your file is a valid CSV.`,
        sender: 'assistant',
        timestamp: new Date(),
        type: 'error'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCSVConfirmation = async (confirm: boolean) => {
    const pendingImport = (window as any).pendingCSVImport;
    if (!pendingImport) return;

    if (!confirm) {
      const cancelMessage: Message = {
        id: Date.now().toString(),
        content: '❌ CSV import cancelled.',
        sender: 'assistant',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, cancelMessage]);
      delete (window as any).pendingCSVImport;
      return;
    }

    setIsLoading(true);

    try {
      // Send confirmation to process the CSV import
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: `Process CSV import: ${pendingImport.csvText}`,
          type: 'csv_import_confirm'
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          content: data.data.message,
          sender: 'assistant',
          timestamp: new Date(),
          type: data.data.type || 'text',
          suggestions: data.data.suggestions
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || 'Failed to import CSV');
      }

      // Clean up
      delete (window as any).pendingCSVImport;

    } catch (error) {
      console.error('Error importing CSV:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: `❌ Error importing CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sender: 'assistant',
        timestamp: new Date(),
        type: 'error'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.sender === 'assistant' && (
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div className={cn(
                "flex flex-col space-y-2 max-w-lg",
                message.sender === 'user' ? 'items-end' : 'items-start'
              )}>
                <Card className={cn(
                  "p-3",
                  message.sender === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted',
                  message.type === 'error' && 'border-destructive'
                )}>
                  {message.sender === 'assistant' ? (
                    <Markdown content={message.content} className="text-sm" />
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">
                      {message.content}
                    </div>
                  )}
                </Card>
                
                {message.suggestions && message.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.suggestions.map((suggestion, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSuggestionClick(suggestion)}
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

              {message.sender === 'user' && (
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback>
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
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
                  <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <TextareaAutosize
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  isListening 
                    ? "🎤 Listening... speak now" 
                    : "Type your message... (e.g., 'I bought lunch for $12')"
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
                onClick={handleVoiceInput}
                title={
                  !speechSupported 
                    ? "Voice input not supported in this browser"
                    : isListening 
                      ? "Click to stop recording" 
                      : "Click to start voice input"
                }
                className={isListening ? "animate-pulse bg-red-500 hover:bg-red-600" : ""}
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
                onClick={handleCSVImport}
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
            
            {/* Hidden file input for CSV import */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </form>
      </div>
    </div>
  );
} 