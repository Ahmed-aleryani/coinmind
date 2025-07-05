# CoinMind - AI-Powered Personal Finance Tracker

> 🏆 **Hackathon Project**: Built during the [Cursor Tallinn Hackathon](https://lu.ma/edajc7xj?tk=LxhbIU) using Cursor IDE and AI-powered development tools.

A modern, conversational finance tracking application built with Next.js 15, TypeScript, and Google Gemini AI. Track your expenses and income through natural language conversations, upload receipts, import CSV files, and get AI-powered insights about your financial health.

## ✨ Features

- **🤖 Conversational UI**: Chat naturally to track transactions ("I bought coffee for $5")
- **📸 Receipt OCR**: Upload receipts and extract transaction data automatically
- **📊 CSV Import**: Import bank statements and categorize them automatically
- **📈 Smart Analytics**: AI-powered spending insights and financial health analysis
- **🌓 Dark/Light Mode**: Beautiful UI with theme switching
- **📱 Mobile Responsive**: Works seamlessly on all devices
- **⚡ Real-time Updates**: Instant transaction updates and live chat

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Google Gemini API key ([Get one here](https://aistudio.google.com/app/apikey))

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone git@github.com:Ahmed-aleryani/coinmind.git
   cd coinmind
   pnpm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   DATABASE_URL=./data/finance.db
   ```

3. **Start the development server:**
   ```bash
   pnpm dev
   ```

4. **Open [http://localhost:3000](http://localhost:3000)** to see the application.

## 💬 How to Use

### Adding Transactions
Just type naturally in the chat:
- "I bought lunch for $12 at McDonald's"
- "Got paid $2000 salary today"
- "Spent $50 on gas at Shell"
- "Received $100 cash gift"

### Querying Your Data
Ask questions about your finances:
- "How much did I spend this month?"
- "What's my biggest expense category?"
- "Show me my food expenses"
- "Am I saving money this month?"

### Uploading Receipts
- Click the camera icon to upload receipt images
- AI will extract transaction details automatically
- Review and confirm the parsed information

### Importing CSV Files
- Use the import feature to upload bank statements
- Auto-detect column mappings (date, description, amount)
- Bulk import and categorize transactions

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui, Radix UI, Lucide Icons
- **AI Integration**: Google Gemini API (Vision + Text)
- **Database**: SQLite with better-sqlite3
- **Styling**: Tailwind CSS with custom design system
- **Charts**: Recharts for data visualization
- **Development**: Built with Cursor IDE and AI-powered development

### Project Structure
```
src/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Homepage
├── components/            # React components
│   ├── chat/              # Chat interface
│   ├── layout/            # Layout components
│   ├── providers/         # Context providers
│   └── ui/                # UI components
├── lib/                   # Utilities and business logic
│   ├── api/               # AI integration
│   ├── db/                # Database schema
│   ├── types/             # TypeScript types
│   └── utils/             # Helper functions
└── data/                  # SQLite database files
```

## 🛠️ Development

### Available Scripts
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm type-check` - Run TypeScript checks

### Database Schema
The app uses SQLite with two main tables:
- `transactions` - Financial transactions with AI-generated categories
- `chat_messages` - Conversation history with context

Sample data is automatically inserted on first run for demo purposes.

### API Routes
- `POST /api/chat` - Main chat endpoint with intent detection
- `GET/POST /api/transactions` - CRUD operations for transactions
- `GET/PUT/DELETE /api/transactions/[id]` - Individual transaction operations

## 🎨 Customization

### Theme Colors
The app uses a custom design system with CSS variables. Modify colors in `globals.css`:
```css
:root {
  --primary: oklch(0.205 0 0);
  --secondary: oklch(0.97 0 0);
  /* ... other colors */
}
```

### AI Prompts
Customize AI behavior by modifying prompts in `src/lib/api/gemini.ts`:
- Transaction parsing prompts
- Receipt OCR prompts  
- Category suggestions
- Query response templates

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `DATABASE_URL` | SQLite database path | No (defaults to `./data/finance.db`) |
| `NODE_ENV` | Environment mode | No (auto-detected) |
| `NEXT_PUBLIC_APP_URL` | Public app URL | No (defaults to localhost) |

## 🚧 Roadmap

- [ ] **Database Migration**: Migrate from local SQLite to remote database (MongoDB or Supabase)
- [ ] Multi-currency support
- [ ] Bank account integration (Plaid)
- [ ] Budget setting and tracking
- [ ] Investment portfolio tracking
- [ ] Export reports (PDF, Excel)
- [ ] Recurring transaction detection
- [ ] Advanced analytics dashboard
- [ ] Multi-user support
- [ ] Mobile app (React Native)



## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0) - see the [LICENSE](LICENSE) file for details.

This means you are free to:
- Use the software for any purpose
- Study how the software works
- Share copies of the software
- Modify the software and share your modifications

**Important**: Any derivative works or modifications must also be released under the GPL-3.0 license, ensuring that improvements benefit the entire community.

## 🆘 Support

If you encounter any issues:

1. Check that your Gemini API key is configured correctly
2. Ensure the `data/` directory exists and is writable
3. Check the console for any error messages
4. Review the [troubleshooting guide](TROUBLESHOOTING.md)

For bugs and feature requests, please open an issue on GitHub.

For detailed troubleshooting steps, see the [Troubleshooting Guide](TROUBLESHOOTING.md).

---

Built with ❤️ using Next.js, Google Gemini AI, and Cursor IDE during the [Cursor Tallinn Hackathon](https://lu.ma/edajc7xj?tk=LxhbIU)
