# 🛠️ Troubleshooting Guide

This guide covers common issues you might encounter while setting up or using CoinMind and their solutions.

## Common Issues

### 1. Gemini API Key Issues
**Problem**: API requests failing with authentication errors
**Solution**: 
- Verify your API key is correct in `.env.local`
- Check that your API key has the necessary permissions
- Ensure there are no extra spaces or characters in the key

### 2. Database Connection Issues
**Problem**: SQLite database errors or file not found
**Solution**:
- Ensure the `data/` directory exists in your project root
- Check file permissions - the app needs read/write access
- Delete the database file and restart to regenerate with sample data

### 3. Development Server Issues
**Problem**: Server won't start or crashes
**Solution**:
- Clear Next.js cache: `rm -rf .next`
- Delete node_modules and reinstall: `rm -rf node_modules && pnpm install`
- Check for port conflicts (default is 3000)

### 4. Chat Not Responding
**Problem**: Chat interface loads but doesn't respond to messages
**Solution**:
- Check browser console for JavaScript errors
- Verify your Gemini API key is working
- Check network tab for failed API requests
- Ensure you're not hitting API rate limits

### 5. CSV Import Issues
**Problem**: CSV files not importing correctly
**Solution**:
- Ensure CSV has headers (Date, Description, Amount)
- Check date format (YYYY-MM-DD preferred)
- Verify amounts are numeric (no currency symbols)
- File size should be under 10MB

### 6. Receipt OCR Not Working
**Problem**: Receipt images not being processed
**Solution**:
- Use clear, high-quality images
- Ensure good lighting and minimal shadows
- Supported formats: JPG, PNG, WebP
- Maximum file size: 5MB

### 7. Build/Production Issues
**Problem**: App works in development but fails in production
**Solution**:
- Run `pnpm build` to check for build errors
- Verify all environment variables are set in production
- Check that the database path is accessible in production
- Ensure static files are properly served

## Getting Help

If you're still experiencing issues:

1. **Check the logs**: Look at both browser console and terminal output
2. **Verify environment**: Ensure all required environment variables are set
3. **Test API key**: Try making a direct request to Gemini API
4. **Clean install**: Delete `node_modules`, `.next`, and reinstall
5. **GitHub Issues**: Search existing issues or create a new one with:
   - Error messages
   - Steps to reproduce
   - Environment details (OS, Node version, etc.)

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [SQLite Documentation](https://sqlite.org/docs.html)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

If you've found a solution to a problem not covered here, please consider contributing to this guide by opening a pull request! 