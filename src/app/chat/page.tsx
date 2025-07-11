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
    </div>
  );
}
