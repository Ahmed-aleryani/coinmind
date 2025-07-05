# FinanceChat - Wireframes & Component Sketches

## Overview
This document outlines the user interface design and component structure for FinanceChat, focusing on the conversational UI and key interaction flows.

---

## 1. Chat Interface (Main Screen)

### Layout Structure
```
┌─────────────────────────────────────┐
│ [Header: FinanceChat] [☰] [🌙]      │
├─────────────────────────────────────┤
│                                     │
│  Chat Messages Area                 │
│  ┌─ User Message ──────────────────┐ │
│  │ "I bought lunch for $12"       │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌─ AI Response ───────────────────┐ │
│  │ ✅ Transaction Added            │ │
│  │ 📊 Lunch • $12.00 • Food       │ │
│  │ [Edit] [Delete]                │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌─ User Message ──────────────────┐ │
│  │ "Show me this month's spending" │ │
│  └────────────────────────────────┘ │
│                                     │
│  ┌─ AI Response ───────────────────┐ │
│  │ 📈 Monthly Spending: $1,234     │ │
│  │ [View Dashboard]               │ │
│  └────────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│ Input Area                          │
│ ┌─────────────────────┐ [🎤] [📸]   │
│ │ Type your message...│ [↗️]        │
│ └─────────────────────┘             │
└─────────────────────────────────────┘
```

### Components
- **ChatMessage**: Display user/AI messages
- **MessageInput**: Text input with voice/photo buttons
- **TransactionCard**: Quick transaction preview in chat
- **ActionButtons**: Edit/Delete/View options

---

## 2. Dashboard Screen

### Layout Structure
```
┌─────────────────────────────────────┐
│ [← Back] Dashboard [⚙️]             │
├─────────────────────────────────────┤
│                                     │
│  Spending Health                    │
│  ┌─────────────────────────────────┐ │
│  │     📊 Monthly Trends           │ │
│  │  ┌───────────────────────────┐  │ │
│  │  │     Line Chart           │  │ │
│  │  │   Jan Feb Mar Apr May    │  │ │
│  │  │   $800 $900 $1100 $950  │  │ │
│  │  └───────────────────────────┘  │ │
│  └─────────────────────────────────┘ │
│                                     │
│  ┌─────────────────────────────────┐ │
│  │     🥧 Category Breakdown       │ │
│  │  ┌───────────────────────────┐  │ │
│  │  │    Donut Chart           │  │ │
│  │  │  Food 35% | Transport 25% │  │ │
│  │  │  Utils 20% | Other 20%   │  │ │
│  │  └───────────────────────────┘  │ │
│  └─────────────────────────────────┘ │
│                                     │
│  Income Health                      │
│  ┌─────────────────────────────────┐ │
│  │     💰 Cash Flow               │ │
│  │  ┌───────────────────────────┐  │ │
│  │  │    Bar Chart             │  │ │
│  │  │  Income vs Expenses      │  │ │
│  │  │  +$2000 | -$1200 = +$800 │  │ │
│  │  └───────────────────────────┘  │ │
│  └─────────────────────────────────┘ │
│                                     │
├─────────────────────────────────────┤
│ [💬 Chat] [📊 Dashboard] [📋 List]  │
└─────────────────────────────────────┘
```

### Components
- **SpendingChart**: Line chart for monthly trends
- **CategoryChart**: Donut chart for spending breakdown
- **CashFlowChart**: Bar chart for income vs expenses
- **MetricCard**: Display key financial metrics
- **NavigationBar**: Bottom navigation

---

## 3. Receipt Upload Flow

### Upload Modal
```
┌─────────────────────────────────────┐
│ Upload Receipt                [✕]   │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────────┐ │
│  │                                 │ │
│  │     📷 Drop image here          │ │
│  │        or click to browse       │ │
│  │                                 │ │
│  │     [Choose File]               │ │
│  │                                 │ │
│  └─────────────────────────────────┘ │
│                                     │
│  Supported formats: JPG, PNG        │
│  Max size: 10MB                     │
│                                     │
│              [Cancel] [Upload]      │
└─────────────────────────────────────┘
```

### Processing State
```
┌─────────────────────────────────────┐
│ Processing Receipt...          [✕]  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────────┐ │
│  │     🔄 Analyzing receipt...     │ │
│  │                                 │ │
│  │     [████████████████] 75%      │ │
│  │                                 │ │
│  │     Extracting transaction      │ │
│  │     details with AI...          │ │
│  └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### Review & Confirm
```
┌─────────────────────────────────────┐
│ Review Transaction             [✕]  │
├─────────────────────────────────────┤
│                                     │
│  ✅ Receipt processed successfully! │
│                                     │
│  ┌─────────────────────────────────┐ │
│  │ Date: [2024-01-15      ↓]      │ │
│  │ Amount: [$25.50            ]   │ │
│  │ Vendor: [Starbucks         ]   │ │
│  │ Category: [Food & Drink ↓]     │ │
│  │ Description: [Coffee & pastry] │ │
│  └─────────────────────────────────┘ │
│                                     │
│  📄 Receipt Preview                 │
│  ┌─────────────────────────────────┐ │
│  │ [Receipt Image Thumbnail]       │ │
│  └─────────────────────────────────┘ │
│                                     │
│            [Cancel] [Save Transaction] │
└─────────────────────────────────────┘
```

### Components
- **FileUpload**: Drag & drop file upload
- **ProcessingSpinner**: Loading state with progress
- **TransactionForm**: Editable transaction details
- **ReceiptPreview**: Thumbnail of uploaded receipt

---

## 4. CSV Import Flow

### File Selection
```
┌─────────────────────────────────────┐
│ Import Bank Statement          [✕]  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────────┐ │
│  │                                 │ │
│  │     📁 Select CSV file          │ │
│  │        from your bank           │ │
│  │                                 │ │
│  │     [Choose File]               │ │
│  │                                 │ │
│  └─────────────────────────────────┘ │
│                                     │
│  💡 Tips:                           │
│  • Download CSV from your bank      │
│  • Make sure it includes dates,     │
│    descriptions, and amounts        │
│                                     │
│              [Cancel] [Continue]    │
└─────────────────────────────────────┘
```

### Column Mapping
```
┌─────────────────────────────────────┐
│ Map CSV Columns                [✕]  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────────┐ │
│  │ CSV Preview (first 3 rows)      │ │
│  │ ┌─────────────────────────────┐ │ │
│  │ │Date     │Desc     │Amount  │ │ │
│  │ │01/15/24 │Starbucks│-25.50  │ │ │
│  │ │01/16/24 │Salary   │+2000   │ │ │
│  │ │01/17/24 │Gas      │-45.00  │ │ │
│  │ └─────────────────────────────┘ │ │
│  └─────────────────────────────────┘ │
│                                     │
│  Column Mapping:                    │
│  Date Column: [Date        ↓]       │
│  Description: [Desc        ↓]       │
│  Amount: [Amount      ↓]            │
│                                     │
│              [Back] [Import 156 Transactions] │
└─────────────────────────────────────┘
```

### Import Progress
```
┌─────────────────────────────────────┐
│ Importing Transactions...      [✕]  │
├─────────────────────────────────────┤
│                                     │
│  🔄 Processing 156 transactions...  │
│                                     │
│  [██████████████████████] 85%       │
│                                     │
│  ✅ Processed: 133                  │
│  ⚠️ Skipped: 2 (duplicates)         │
│  ❌ Errors: 1                       │
│                                     │
│  Current: "Gas Station - $45.00"    │
│                                     │
└─────────────────────────────────────┘
```

### Components
- **CSVUpload**: File selection interface
- **ColumnMapper**: Map CSV columns to transaction fields
- **ImportProgress**: Progress bar with status updates
- **PreviewTable**: Show CSV data preview

---

## 5. Transaction Management (List View)

### Transaction List
```
┌─────────────────────────────────────┐
│ Transactions              [+] [⚙️]  │
├─────────────────────────────────────┤
│                                     │
│  🔍 [Search transactions...      ]  │
│                                     │
│  Filter: [All ↓] [This Month ↓]     │
│  Sort: [Date ↓] [Amount ↓]          │
│                                     │
│  ┌─────────────────────────────────┐ │
│  │ ☑️ Jan 15  Starbucks      -$25.50 │ │
│  │     Food & Drink          [⋯]  │ │
│  ├─────────────────────────────────┤ │
│  │ ☑️ Jan 16  Salary       +$2000.00 │ │
│  │     Income                [⋯]  │ │
│  ├─────────────────────────────────┤ │
│  │ ☑️ Jan 17  Gas Station    -$45.00 │ │
│  │     Transportation        [⋯]  │ │
│  └─────────────────────────────────┘ │
│                                     │
│  [✓ Select All] [🗑️ Delete] [📤 Export] │
│                                     │
├─────────────────────────────────────┤
│ [💬 Chat] [📊 Dashboard] [📋 List]  │
└─────────────────────────────────────┘
```

### Edit Transaction Modal
```
┌─────────────────────────────────────┐
│ Edit Transaction               [✕]  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────────┐ │
│  │ Date: [2024-01-15      ↓]      │ │
│  │ Amount: [$25.50            ]   │ │
│  │ Vendor: [Starbucks         ]   │ │
│  │ Category: [Food & Drink ↓]     │ │
│  │ Description: [Coffee & pastry] │ │
│  │ Type: [Expense ↓]              │ │
│  └─────────────────────────────────┘ │
│                                     │
│  🗑️ Delete this transaction         │
│                                     │
│            [Cancel] [Save Changes]  │
└─────────────────────────────────────┘
```

### Components
- **TransactionList**: Paginated list of transactions
- **SearchBar**: Real-time transaction search
- **FilterControls**: Date and category filters
- **TransactionItem**: Individual transaction row
- **EditModal**: Modal for editing transaction details
- **BulkActions**: Select and batch operations

---

## 6. Mobile Responsive Design

### Mobile Chat Interface
```
┌─────────────────┐
│ FinanceChat [☰]│
├─────────────────┤
│                 │
│ 👤 I bought     │
│    lunch $12    │
│                 │
│    🤖 Transaction│
│       Added     │
│    💰 Lunch •   │
│       $12 • Food│
│    [Edit][Del]  │
│                 │
│ 👤 Show monthly │
│    spending     │
│                 │
│    🤖 Monthly:  │
│       $1,234    │
│    [Dashboard]  │
│                 │
├─────────────────┤
│[Type...] [🎤][📷]│
│           [Send]│
└─────────────────┘
```

### Mobile Dashboard
```
┌─────────────────┐
│ [←] Dashboard   │
├─────────────────┤
│                 │
│ 📊 Spending     │
│ ┌─────────────┐ │
│ │ Line Chart  │ │
│ │ $800→$1100  │ │
│ └─────────────┘ │
│                 │
│ 🥧 Categories   │
│ ┌─────────────┐ │
│ │ Donut Chart │ │
│ │ Food 35%    │ │
│ │ Transport   │ │
│ └─────────────┘ │
│                 │
│ 💰 Cash Flow    │
│ ┌─────────────┐ │
│ │ Bar Chart   │ │
│ │ +$800 net   │ │
│ └─────────────┘ │
│                 │
├─────────────────┤
│[💬][📊][📋]     │
└─────────────────┘
```

---

## 7. Component Architecture

### Core Components
```
src/components/
├── ui/                     # shadcn/ui components
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   └── ...
├── chat/
│   ├── ChatInterface.tsx   # Main chat container
│   ├── MessageList.tsx     # List of messages
│   ├── ChatMessage.tsx     # Individual message
│   ├── MessageInput.tsx    # Input with voice/photo
│   └── TransactionCard.tsx # Transaction preview
├── dashboard/
│   ├── Dashboard.tsx       # Main dashboard
│   ├── SpendingChart.tsx   # Monthly trends
│   ├── CategoryChart.tsx   # Category breakdown
│   ├── CashFlowChart.tsx   # Income vs expenses
│   └── MetricCard.tsx      # Stat cards
├── transactions/
│   ├── TransactionList.tsx # List view
│   ├── TransactionItem.tsx # List item
│   ├── EditModal.tsx       # Edit dialog
│   ├── SearchBar.tsx       # Search input
│   └── FilterControls.tsx  # Filters
├── uploads/
│   ├── ReceiptUpload.tsx   # Receipt upload modal
│   ├── CSVImport.tsx       # CSV import flow
│   ├── FileUpload.tsx      # Generic file upload
│   └── ProcessingState.tsx # Loading states
└── layout/
    ├── Header.tsx          # App header
    ├── Navigation.tsx      # Bottom nav
    ├── Sidebar.tsx         # Desktop sidebar
    └── Layout.tsx          # Main layout
```

### State Management
```
src/contexts/
├── TransactionContext.tsx  # Transaction CRUD
├── ChatContext.tsx         # Chat messages
├── UIContext.tsx           # UI state (modals, etc.)
└── ThemeContext.tsx        # Dark/light mode
```

### API Integration
```
src/lib/
├── api/
│   ├── gemini.ts          # AI integration
│   ├── transactions.ts    # CRUD operations
│   └── uploads.ts         # File handling
├── utils/
│   ├── parsers.ts         # Text/CSV parsing
│   ├── formatters.ts      # Data formatting
│   └── validators.ts      # Input validation
└── types/
    ├── transaction.ts     # Transaction types
    ├── chat.ts            # Chat types
    └── api.ts             # API response types
```

---

## 8. Interaction Patterns

### Chat Interactions
- **Natural Language**: "I spent $50 on groceries"
- **Questions**: "How much did I spend this month?"
- **Commands**: "Show me my food expenses"
- **Voice Input**: Long press microphone button
- **Quick Actions**: Tap suggested responses

### Dashboard Interactions
- **Chart Drill-down**: Tap chart segments for details
- **Time Range**: Swipe or select date ranges
- **Category Filter**: Tap legend items to toggle
- **Export Data**: Long press chart for options

### Transaction Management
- **Swipe Actions**: Swipe left/right for quick edit/delete
- **Bulk Selection**: Tap checkboxes for multi-select
- **Search**: Real-time filtering as you type
- **Sort/Filter**: Dropdown menus with multiple options

---

## Conclusion

This wireframe specification provides a comprehensive blueprint for building FinanceChat's user interface. The design prioritizes:

1. **Conversational UI**: Chat-first approach for natural interaction
2. **Mobile Responsive**: Optimized for all device sizes
3. **Visual Feedback**: Clear loading states and confirmations
4. **Accessibility**: Proper contrast, focus states, and screen reader support
5. **Progressive Enhancement**: Core functionality works without JavaScript

The component architecture supports modular development and easy maintenance, while the interaction patterns ensure intuitive user experience across all features. 