import { Badge } from "./badge";
import { formatCurrency } from "@/lib/utils/formatters";

interface CurrencyInfoProps {
  originalAmount?: number;
  originalCurrency?: string;
  convertedAmount?: number;
  convertedCurrency?: string;
  conversionRate?: number;
  conversionFee?: number;
  className?: string;
}

export function CurrencyInfo({
  originalAmount,
  originalCurrency,
  convertedAmount,
  convertedCurrency,
  conversionRate,
  conversionFee,
  className = "",
}: CurrencyInfoProps) {
  // If no conversion happened or no original amount, don't show conversion info
  if (
    !originalAmount ||
    !convertedAmount ||
    !originalCurrency ||
    originalAmount === convertedAmount
  ) {
    return <div className={className}></div>;
  }

  return (
    <div className={`text-xs text-muted-foreground ${className}`}>
      <div className="flex items-center gap-1">
        <span>Original:</span>
        <span className="font-medium">
          {formatCurrency(Math.abs(originalAmount), {
            currency: originalCurrency || "USD",
          })}
        </span>
        {conversionRate && conversionRate !== 1 && (
          <Badge variant="outline" className="text-xs">
            Rate: {conversionRate.toFixed(4)}
          </Badge>
        )}
      </div>
      {conversionFee && conversionFee > 0 && (
        <div className="text-xs text-red-500">
          Fee:{" "}
          {formatCurrency(conversionFee, {
            currency: convertedCurrency || "USD",
          })}
        </div>
      )}
    </div>
  );
}
