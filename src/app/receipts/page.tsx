import { ReceiptUpload } from "@/components/receipt/receipt-upload";

export default function ReceiptsPage() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Receipt Processing</h1>
        <p className="text-muted-foreground">
          Upload receipt images to automatically extract transaction details using AI-powered OCR.
          Supports JPEG, PNG, and PDF files.
        </p>
      </div>

      <ReceiptUpload />
    </div>
  );
} 