# CoinMind Multi-Currency System Guide

## Overview

CoinMind now supports multi-currency transactions, allowing users to track expenses and income in different currencies while maintaining a unified view in their preferred default currency.

## Features

### Core Features
- **Multi-Currency Support**: Track transactions in USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, SAR, AED, and more
- **Automatic Conversion**: Real-time currency conversion using exchange rates
- **Original vs Converted Amounts**: See both original and converted amounts for transparency
- **Conversion Tracking**: Monitor conversion rates and fees
- **User Preferences**: Set your default currency for unified reporting

### User Interface
- **Currency Selection**: Choose currency when adding transactions
- **Currency Display**: See original and converted amounts in transaction tables
- **Conversion Details**: View conversion rates and fees
- **Dashboard Summary**: Multi-currency overview with conversion statistics

## User Guide

### Setting Your Default Currency

1. Go to the **Dashboard**
2. Look for the currency selector in the top-right corner
3. Choose your preferred default currency
4. All future calculations will use this currency

### Adding Multi-Currency Transactions

1. Go to **Transactions** page
2. Click **"Add Transaction"**
3. Fill in the transaction details:
   - **Amount**: Enter the transaction amount
   - **Currency**: Select the original currency
   - **Type**: Choose Income or Expense
   - **Category**: Select appropriate category
   - **Description**: Add transaction description
4. Click **"Add Transaction"**

### Understanding Transaction Display

Transactions show two amounts:
- **Amount**: The converted amount in your default currency
- **Original**: The original amount in the original currency (if different)

### Currency Conversion Details

When you see a transaction with different currencies:
- **Rate**: Shows the conversion rate used
- **Fee**: Displays any conversion fees (if applicable)
- **Original**: Shows the original amount in the original currency

## API Documentation

### Transaction Structure

```typescript
interface Transaction {
  id: string;
  date: Date;
  // Legacy fields (for backward compatibility)
  amount: number;
  currency: string;
  // Multi-currency fields
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  convertedCurrency: string;
  conversionRate: number;
  conversionFee: number;
  // Other fields
  vendor: string;
  description: string;
  category: TransactionCategory;
  type: 'income' | 'expense';
}
```

### API Endpoints

#### Get Transactions
```http
GET /api/transactions
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "123",
      "originalAmount": 100,
      "originalCurrency": "EUR",
      "convertedAmount": 110.50,
      "convertedCurrency": "USD",
      "conversionRate": 1.105,
      "conversionFee": 0,
      "description": "Coffee",
      "category": "Food & Drink",
      "type": "expense"
    }
  ]
}
```

#### Create Transaction
```http
POST /api/transactions
```

**Request Body:**
```json
{
  "amount": 100,
  "currency": "EUR",
  "description": "Coffee",
  "category": "Food & Drink",
  "type": "expense"
}
```

#### Chat API (Multi-Language)
```http
POST /api/chat
```

**Request Body:**
```json
{
  "message": "دفعت 200 ريال على الطعام"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "تم إضافة المعاملة بنجاح! دفعت 200 ريال على الطعام بقيمة $53.33. رصيدك الجديد هو $1,234.56.",
    "detectedLanguage": "ar",
    "isRTL": true,
    "transactionAdded": true
  }
}
```

### Currency Conversion API

#### Get Supported Currencies
```http
GET /api/currencies
```

**Response:**
```json
{
  "success": true,
  "currencies": ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "SAR", "AED"]
}
```

#### Get User Currency Settings
```http
GET /api/user-currency
```

**Response:**
```json
{
  "success": true,
  "defaultCurrency": "USD"
}
```

#### Update User Currency
```http
POST /api/user-currency
```

**Request Body:**
```json
{
  "defaultCurrency": "EUR"
}
```

### Migration API

#### Check Migration Status
```http
GET /api/migration
```

**Response:**
```json
{
  "success": true,
  "data": {
    "needsMigration": true,
    "totalTransactions": 50,
    "migratedTransactions": 30,
    "legacyTransactions": 20
  }
}
```

#### Run Migration
```http
POST /api/migration
```

**Request Body:**
```json
{
  "action": "migrate"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "migratedCount": 20,
    "errorCount": 0,
    "errors": [],
    "rollbackData": [...]
  }
}
```

## Technical Implementation

### Database Schema

The transaction table includes new fields:
- `original_amount`: The original transaction amount
- `original_currency`: The original currency code
- `converted_amount`: The amount converted to default currency
- `converted_currency`: The default currency code
- `conversion_rate`: The exchange rate used
- `conversion_fee`: Any conversion fees

### Currency Conversion

The system uses the `exchangerate.host` API for real-time exchange rates:

```typescript
async function convertAmount(
  amount: number, 
  fromCurrency: string, 
  toCurrency: string
): Promise<number> {
  const response = await fetch(
    `https://api.exchangerate.host/convert?from=${fromCurrency}&to=${toCurrency}&amount=${amount}`
  );
  const data = await response.json();
  return data.result;
}
```

### Multi-Language Support

The chat system supports multiple languages with automatic currency detection:

- **Arabic**: "دفعت 200 ريال على الطعام" → 200 SAR for Food
- **English**: "Spent $50 on groceries" → 50 USD for Food
- **Spanish**: "Gasté 45 euros en gasolina" → 45 EUR for Transportation

### Migration Process

1. **Backup**: Original transaction data is backed up
2. **Conversion**: Legacy transactions are converted to new format
3. **Validation**: All data is validated during migration
4. **Rollback**: Option to rollback if issues occur

## Troubleshooting

### Common Issues

#### Migration Failed
- Check database permissions
- Ensure sufficient disk space
- Verify database connection

#### Currency Conversion Errors
- Check internet connection
- Verify currency codes are valid
- Check exchange rate API status

#### Display Issues
- Clear browser cache
- Check browser console for errors
- Verify JavaScript is enabled

### Support

For technical support or feature requests:
1. Check the troubleshooting section above
2. Review the API documentation
3. Contact the development team

## Future Enhancements

### Planned Features
- **Historical Exchange Rates**: Track rate changes over time
- **Currency Charts**: Visualize currency trends
- **Batch Currency Updates**: Update multiple transactions
- **Advanced Analytics**: Currency-specific insights
- **Mobile App**: Native mobile support

### API Improvements
- **WebSocket Support**: Real-time currency updates
- **Rate Limiting**: Improved API performance
- **Caching**: Faster currency conversions
- **Webhooks**: Notifications for rate changes

## Security Considerations

### Data Protection
- All currency data is encrypted at rest
- API keys are securely stored
- User preferences are protected
- Audit trail for all conversions

### Rate Limiting
- API calls are rate-limited
- Currency conversion caching
- Fallback to cached rates
- Error handling for API failures

## Performance Optimization

### Caching Strategy
- Exchange rates cached for 1 hour
- User preferences cached locally
- Transaction data optimized for queries
- Database indexes for currency fields

### Scalability
- Horizontal scaling support
- Database sharding ready
- CDN integration for static assets
- Load balancing for API endpoints 