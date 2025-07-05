export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  transactionId?: string; // If message resulted in a transaction
  metadata?: {
    type: 'text' | 'transaction' | 'receipt' | 'csv_import' | 'query_response';
    confidence?: number;
    processingTime?: number;
  };
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface VoiceRecording {
  blob: Blob;
  duration: number;
  transcript?: string;
}

export interface ChatResponse {
  message: string;
  transaction?: {
    amount: number;
    vendor?: string;
    description: string;
    category?: string;
    date?: Date;
  };
  requiresConfirmation?: boolean;
  suggestions?: string[];
  error?: string;
}

export interface ChatContext {
  messages: ChatMessage[];
  isLoading: boolean;
  isRecording: boolean;
  sendMessage: (content: string) => Promise<void>;
  sendVoiceMessage: (recording: VoiceRecording) => Promise<void>;
  uploadReceipt: (file: File) => Promise<void>;
  clearChat: () => void;
  startRecording: () => void;
  stopRecording: () => Promise<VoiceRecording | null>;
} 