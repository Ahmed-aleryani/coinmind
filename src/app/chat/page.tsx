import { ChatInterface } from "@/components/chat/chat-interface";

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

      {/* Simple Sentences in Different Languages */}
      <div className="mt-6 bg-green-50 dark:bg-green-950/20 rounded-lg p-4">
        <h3 className="font-semibold mb-3 text-green-700 dark:text-green-300">
          💬 Simple Phrases You Can Try
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2 text-sm">Adding Transactions:</h4>
            <div className="space-y-2 text-xs">
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">English:</span> &ldquo;I spent $50
                on groceries&rdquo;
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">العربية:</span> &ldquo;دفعت 200
                ريال على الطعام&rdquo;
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">Español:</span> &ldquo;Gasté 25
                euros en gasolina&rdquo;
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">Français:</span> &ldquo;J&apos;ai
                dépensé 30 euros pour l&apos;essence&rdquo;
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">Deutsch:</span> &ldquo;Ich habe 40
                Euro für Lebensmittel ausgegeben&rdquo;
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">中文:</span>{" "}
                &ldquo;我花了100元买食物&rdquo;
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2 text-sm">Asking Questions:</h4>
            <div className="space-y-2 text-xs">
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">English:</span> &ldquo;How much
                did I spend this month?&rdquo;
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">العربية:</span> &ldquo;كم أنفقت
                هذا الشهر؟&rdquo;
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">Español:</span> &ldquo;¿Cuánto
                gasté este mes?&rdquo;
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">Français:</span> &ldquo;Combien
                ai-je dépensé ce mois-ci?&rdquo;
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">Deutsch:</span> &ldquo;Wie viel
                habe ich diesen Monat ausgegeben?&rdquo;
              </div>
              <div className="bg-white dark:bg-gray-800 p-2 rounded">
                <span className="font-medium">中文:</span>{" "}
                &ldquo;我这个月花了多少钱？&rdquo;
              </div>
            </div>
          </div>
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
              <li>• &ldquo;I spent $50 on groceries&rdquo;</li>
              <li>• &ldquo;أنا أنفقت 200 ريال على الطعام&rdquo;</li>
              <li>• &ldquo;How much did I spend this month?&rdquo;</li>
              <li>• &ldquo;كم أنفقت هذا الشهر؟&rdquo;</li>
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

      {/* Quick Help Section */}
      <div className="mt-6 bg-purple-50 dark:bg-purple-950/20 rounded-lg p-4">
        <h3 className="font-semibold mb-3 text-purple-700 dark:text-purple-300">
          🚀 Quick Start Guide
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="text-2xl mb-2">1️⃣</div>
            <h4 className="font-medium mb-1">Type or Speak</h4>
            <p className="text-xs text-muted-foreground">
              Write your message in any language or use voice input
            </p>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-2">2️⃣</div>
            <h4 className="font-medium mb-1">Get Response</h4>
            <p className="text-xs text-muted-foreground">
              CoinMind will understand and help you manage finances
            </p>
          </div>
          <div className="text-center">
            <div className="text-2xl mb-2">3️⃣</div>
            <h4 className="font-medium mb-1">Track Progress</h4>
            <p className="text-xs text-muted-foreground">
              View your transactions and financial insights
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
