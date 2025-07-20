"use client";

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Download, Calendar, Filter, BarChart3, FileText } from 'lucide-react';
import { ExportOptions } from '@/lib/services/export.service';

interface ExportSettingsProps {
  onExport: (options: ExportOptions) => Promise<void>;
  supportedCurrencies: string[];
  defaultCurrency: string;
  isLoading?: boolean;
}

const DATE_RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'custom', label: 'Custom Range' },
];

const EXPORT_FORMATS = [
  { value: 'pdf', label: 'PDF', icon: FileText },
  { value: 'excel', label: 'Excel (XLSX)', icon: BarChart3 },
  { value: 'csv', label: 'CSV', icon: FileText },
];



export function ExportSettings({
  onExport,
  supportedCurrencies,
  defaultCurrency,
  isLoading = false,
}: ExportSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({
    format: 'pdf',
    dateRange: {
      type: 'this_month',
      startDate: undefined,
      endDate: undefined,
    },
    viewType: 'detailed',
    includeCharts: true,
    targetCurrency: defaultCurrency,
  });

  const handleExport = async () => {
    try {
      await onExport(options);
      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const updateOptions = (updates: Partial<ExportOptions>) => {
    setOptions(prev => ({ ...prev, ...updates }));
  };



  const getDateRangeLabel = () => {
    const option = DATE_RANGE_OPTIONS.find(opt => opt.value === options.dateRange.type);
    if (options.dateRange.type === 'custom' && options.dateRange.startDate && options.dateRange.endDate) {
      return `${options.dateRange.startDate.toLocaleDateString()} - ${options.dateRange.endDate.toLocaleDateString()}`;
    }
    return option?.label || 'Select date range';
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Settings</DialogTitle>
          <DialogDescription>
            Configure your export options for PDF, Excel, or CSV formats.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Export Format */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Export Format</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {EXPORT_FORMATS.map((format) => {
                  const Icon = format.icon;
                  return (
                    <div
                      key={format.value}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        options.format === format.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => updateOptions({ format: format.value as any })}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <span className="font-medium">{format.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Date Range */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Date Range</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                value={options.dateRange.type}
                onValueChange={(value) => updateOptions({ 
                  dateRange: { ...options.dateRange, type: value as any }
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {options.dateRange.type === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={options.dateRange.startDate?.toISOString().split('T')[0] || ''}
                      onChange={(e) => updateOptions({
                        dateRange: {
                          ...options.dateRange,
                          startDate: e.target.value ? new Date(e.target.value) : undefined
                        }
                      })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="end-date">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={options.dateRange.endDate?.toISOString().split('T')[0] || ''}
                      onChange={(e) => updateOptions({
                        dateRange: {
                          ...options.dateRange,
                          endDate: e.target.value ? new Date(e.target.value) : undefined
                        }
                      })}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>





          {/* Charts Option (PDF only) */}
          {options.format === 'pdf' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Charts & Visualizations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="include-charts"
                    checked={options.includeCharts}
                    onCheckedChange={(checked: boolean) => updateOptions({ includeCharts: checked })}
                  />
                  <Label htmlFor="include-charts">Include charts and graphs in PDF export (recommended)</Label>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isLoading}>
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 