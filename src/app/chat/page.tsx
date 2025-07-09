import { ChatInterface } from '@/components/chat/chat-interface';

export default function ChatPage() {
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Chat with CoinMind</h1>
        <p className="text-muted-foreground">
          Get financial insights and manage your transactions in any language. 
          Try voice input for hands-free interaction!
        </p>
      </div>
      
      <ChatInterface className="w-full" />
      
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-muted/50 rounded-lg p-4">
          <h3 className="font-semibold mb-2">🌍 Multi-Language Support</h3>
          <p className="text-sm text-muted-foreground mb-3">
            CoinMind understands and responds in multiple languages including:
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>• العربية (Arabic)</div>
            <div>• English</div>
            <div>• Español (Spanish)</div>
            <div>• Français (French)</div>
            <div>• Deutsch (German)</div>
            <div>• 中文 (Chinese)</div>
            <div>• 日本語 (Japanese)</div>
            <div>• 한국어 (Korean)</div>
            <div>• हिन्दी (Hindi)</div>
            <div>• Türkçe (Turkish)</div>
            <div>• Русский (Russian)</div>
            <div>• And many more...</div>
          </div>
        </div>
        
        <div className="bg-muted/50 rounded-lg p-4">
          <h3 className="font-semibold mb-2">🎤 Voice Input</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Use voice input for hands-free interaction:
          </p>
          <ul className="text-xs space-y-1 text-muted-foreground">
            <li>• Click the microphone button</li>
            <li>• Speak in any language</li>
            <li>• Your speech is automatically transcribed</li>
            <li>• Perfect for mobile use</li>
          </ul>
        </div>
      </div>
      
      <div className="mt-6 bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
        <h3 className="font-semibold mb-2 text-blue-700 dark:text-blue-300">
          💡 Pro Tips
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium mb-1">Try these examples:</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>• "I spent $50 on groceries"</li>
              <li>• "أنا أنفقت 200 ريال على الطعام"</li>
              <li>• "How much did I spend this month?"</li>
              <li>• "كم أنفقت هذا الشهر؟"</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-1">Currency Support:</h4>
            <ul className="space-y-1 text-muted-foreground">
              <li>• USD, EUR, SAR, JPY, CNY</li>
              <li>• Automatic currency detection</li>
              <li>• Localized formatting</li>
              <li>• RTL support for Arabic</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 