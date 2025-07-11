"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { ProcessedReceipt } from "@/lib/types/transaction";

export function ReceiptUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [receiptData, setReceiptData] = useState<ProcessedReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("Please select an image file (JPEG, PNG) or PDF.");
      return;
    }

    // Create preview URL for images
    if (file.type.startsWith("image/")) {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    }

    setError(null);
    setReceiptData(null);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Please select a file first.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("receipt", file);

      const response = await fetch("/api/receipt", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Failed to process receipt");
        return;
      }

      setReceiptData(result.data);
    } catch (err) {
      setError("Failed to upload receipt. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveTransaction = async () => {
    if (!receiptData) return;

    try {
      // Create transaction from receipt data
      const transaction = {
        date: new Date(receiptData.date),
        amount: receiptData.total,
        currency: receiptData.currency,
        vendor: receiptData.merchant,
        description: `Receipt: ${receiptData.merchant}`,
        category: receiptData.lineItems[0]?.category || "Other",
        type: "expense" as const,
        originalAmount: receiptData.total,
        originalCurrency: receiptData.currency,
        convertedAmount: receiptData.convertedTotal,
        convertedCurrency: "USD", // Assuming USD as base currency
        conversionRate: receiptData.exchangeRate,
      };

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(transaction),
      });

      if (response.ok) {
        // Reset form
        setReceiptData(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        alert("Transaction saved successfully!");
      } else {
        setError("Failed to save transaction");
      }
    } catch (err) {
      setError("Failed to save transaction");
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Receipt Upload
          </CardTitle>
          <CardDescription>
            Upload a receipt image to automatically extract transaction details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="receipt">Select Receipt</Label>
            <Input
              id="receipt"
              type="file"
              accept="image/*,.pdf"
              ref={fileInputRef}
              onChange={handleFileSelect}
              disabled={isUploading}
            />
          </div>

          {previewUrl && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <img
                src={previewUrl}
                alt="Receipt preview"
                className="max-w-md rounded border"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={isUploading || !fileInputRef.current?.files?.length}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Process Receipt
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {receiptData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Receipt Details
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={receiptData.confidence > 0.8 ? "default" : "secondary"}>
                Confidence: {(receiptData.confidence * 100).toFixed(0)}%
              </Badge>
              {receiptData.unclearFields.length > 0 && (
                <Badge variant="destructive">
                  {receiptData.unclearFields.length} unclear fields
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Merchant</Label>
                <p className="text-sm text-muted-foreground">{receiptData.merchant}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Date</Label>
                <p className="text-sm text-muted-foreground">{receiptData.date}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Payment Method</Label>
                <p className="text-sm text-muted-foreground">{receiptData.paymentMethod}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Total</Label>
                <p className="text-sm font-medium">
                  {formatCurrency(receiptData.total, receiptData.currency)}
                </p>
              </div>
            </div>

            {receiptData.lineItems.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Line Items</Label>
                <div className="mt-2 space-y-2">
                  {receiptData.lineItems.map((item, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>{item.description}</span>
                      <span>{formatCurrency(item.subtotal, receiptData.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {receiptData.splits.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Splits</Label>
                <div className="mt-2 space-y-1">
                  {receiptData.splits.map((split, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>{split.person}</span>
                      <span>{formatCurrency(split.amount, receiptData.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div className="flex gap-2">
              <Button onClick={handleSaveTransaction} className="flex-1">
                Save Transaction
              </Button>
              <Button
                variant="outline"
                onClick={() => setReceiptData(null)}
                className="flex-1"
              >
                Process Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 