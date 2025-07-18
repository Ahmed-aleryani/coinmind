# Authentication Setup

This project now supports both authenticated users and anonymous guests using Supabase Auth.

## Features

### For Authenticated Users
- Email/password authentication
- OAuth providers (GitHub, Google)
- Persistent sessions across devices
- Data synchronization
- User profile management

### For Anonymous Users
- Automatic anonymous sign-in
- Local data storage for the session
- Seamless transition to authenticated account
- No registration required to try the app

## Authentication Flow

1. **Guest Access**: Users can access the app immediately without signing up
2. **Anonymous Sign-in**: The app automatically creates anonymous users for data persistence
3. **Authentication**: Users can sign up or sign in at any time
4. **Data Migration**: When a user signs up, their anonymous data can be preserved

## Environment Variables

Make sure you have these environment variables set in your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Supabase Configuration

### 1. Enable Authentication Providers

In your Supabase dashboard:

1. Go to Authentication > Providers
2. Enable Email provider
3. Enable GitHub OAuth (optional)
4. Enable Google OAuth (optional)
5. Enable Anonymous sign-ins

### 2. Configure OAuth Providers (Optional)

For GitHub:
1. Create a GitHub OAuth app
2. Set redirect URL to: `https://your-project.supabase.co/auth/v1/callback`
3. Add client ID and secret to Supabase

For Google:
1. Create a Google OAuth app
2. Set redirect URL to: `https://your-project.supabase.co/auth/v1/callback`
3. Add client ID and secret to Supabase

### 3. Email Templates (Optional)

Customize email templates in Supabase dashboard:
- Authentication > Email Templates
- Customize confirmation and reset password emails

## Usage

### Components

- `AuthProvider`: Provides authentication context
- `useAuth()`: Hook to access auth state
- `getUserWithFallback()`: Server function that handles anonymous fallback

### Pages

- `/auth/login`: Sign in page
- `/auth/signup`: Sign up page
- `/auth/callback`: OAuth callback handler
- `/auth/auth-code-error`: Error page for auth failures

### Middleware

The middleware automatically:
- Redirects unauthenticated users away from protected routes
- Redirects authenticated users away from auth pages
- Handles session refresh

## Anonymous User Handling

The system automatically creates anonymous users when needed:

```typescript
// This will create an anonymous user if no authenticated user exists
const user = await getUserWithFallback();
```

Anonymous users:
- Have temporary IDs
- Data is stored locally for the session
- Can transition to authenticated accounts
- Don't require email verification

## Security Considerations

1. **Rate Limiting**: Anonymous sign-ins are rate-limited by Supabase
2. **Session Management**: Sessions are automatically refreshed
3. **Data Isolation**: Each user (authenticated or anonymous) has isolated data
4. **CSRF Protection**: Built into Supabase Auth

## Troubleshooting

### Common Issues

1. **Anonymous sign-ins disabled**: Enable in Supabase dashboard
2. **OAuth not working**: Check redirect URLs and client secrets
3. **Session not persisting**: Check cookie settings and domain configuration

### Debug Mode

Enable debug logging by setting:
```env
NODE_ENV=development
```

This will show detailed authentication logs in the console. 