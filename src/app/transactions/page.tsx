"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatCurrency,
  formatDate,
  getCategoryEmoji,
} from "@/lib/utils/formatters";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Download,
  Upload,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInfo } from "@/components/ui/currency-info";
import { useCurrency } from "@/components/providers/currency-provider";
import logger from "@/lib/utils/logger";

interface Transaction {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  vendor: string;
  description: string;
  category: string;
  type: "income" | "expense";
  // Multi-currency fields
  originalAmount?: number;
  originalCurrency?: string;
  convertedAmount?: number;
  convertedCurrency?: string;
  conversionRate?: number;
  conversionFee?: number;
}

const CATEGORIES = [
  "Food & Dining",
  "Shopping", 
  "Transportation",
  "Entertainment",
  "Bills & Utilities",
  "Healthcare",
  "Education",
  "Travel",
  "Other Expenses",
  "Salary",
  "Business",
  "Investment",
  "Gift",
  "Other Income",
];

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<
    Transaction[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { defaultCurrency, supportedCurrencies, isCurrencyLoading } = useCurrency();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;
  
  // Infinite scroll refs
  const observerRef = useRef<IntersectionObserver | null>(null);
// Removed unused loadingTriggerRef variable
  
  const [formData, setFormData] = useState({
    amount: "",
    currency: "USD",
    vendor: "",
    description: "",
    category: "",
    type: "expense" as "income" | "expense",
    date: new Date().toISOString().split("T")[0],
  });





  const fetchTransactions = async (page = 0, append = false) => {
    try {
      if (!append) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      logger.info({ defaultCurrency, page, append }, 'Fetching transactions for currency');
      const offset = page * pageSize;
      const response = await fetch(
        `/api/transactions?currency=${defaultCurrency}&limit=${pageSize}&offset=${offset}&t=${Date.now()}`
      );
      const data = await response.json();

      if (data.success) {
        const parsedTransactions = data.data.map((t: any) => ({
          ...t,
          date: new Date(t.date),
        }));
        
        logger.info({ 
          defaultCurrency, 
          success: data.success, 
          transactionCount: data.data?.length || 0,
          sampleTransaction: parsedTransactions[0]
        }, 'Transactions API response received');

        if (append) {
          // Append to existing transactions
          setTransactions(prev => [...prev, ...parsedTransactions]);
        } else {
          // Replace transactions (first load or refresh)
          setTransactions(parsedTransactions);
          setCurrentPage(0);
        }

        // Update pagination state
        if (data.pagination) {
          setHasMore(data.pagination.hasMore);
          setTotalCount(data.pagination.totalCount);
        }
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadMoreTransactions = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    await fetchTransactions(nextPage, true);
  }, [hasMore, isLoadingMore, currentPage]);

  // Intersection Observer for infinite scroll
  const lastTransactionElementRef = useCallback((node: HTMLTableRowElement | null) => {
    if (isLoadingMore) return;
    
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMoreTransactions();
      }
    }, {
      // Trigger when the element is 100px from being visible
      rootMargin: '100px'
    });
    
    if (node) observerRef.current.observe(node);
  }, [isLoadingMore, hasMore, loadMoreTransactions]);

  // Initial data load
  useEffect(() => {
    fetchTransactions(0, false);
  }, []);

  useEffect(() => {
    // Only fetch if no filters are active (to avoid double fetch)
    if (searchQuery === "" && categoryFilter === "all" && typeFilter === "all") {
      setCurrentPage(0);
      setTransactions([]);
      fetchTransactions(0, false);
    }
  }, [defaultCurrency]);

  // Filter transactions based on search and filters
  useEffect(() => {
    let filtered = transactions;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (t) =>
          t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Category filter
    if (categoryFilter !== "all") {
      filtered = filtered.filter((t) => t.category === categoryFilter);
    }

    // Type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter((t) => t.type === typeFilter);
    }

    setFilteredTransactions(filtered);
  }, [transactions, searchQuery, categoryFilter, typeFilter]);

  // Reset pagination when filters change
  useEffect(() => {
    if (searchQuery || categoryFilter !== "all" || typeFilter !== "all") {
      // When filtering, we should fetch fresh data
      setCurrentPage(0);
      setTransactions([]);
      fetchTransactions(0, false);
    }
  }, [searchQuery, categoryFilter, typeFilter, defaultCurrency]);

  // Cleanup intersection observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormData({
      amount: Math.abs(transaction.originalAmount || transaction.amount).toString(),
      currency: transaction.originalCurrency || transaction.currency || "USD",
      vendor: transaction.vendor,
      description: transaction.description,
      category: transaction.category,
      type: transaction.type,
      date: transaction.date.toISOString().split("T")[0],
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    try {
      const response = await fetch(`/api/transactions/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Reset pagination and fetch fresh data
        setCurrentPage(0);
        setTransactions([]);
        await fetchTransactions(0, false);
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const transactionData = {
      amount: Math.abs(Number(formData.amount)), // Always send positive amount
      currency: formData.currency,
      vendor: formData.vendor,
      description: formData.description,
      category: formData.category,
      type: formData.type,
      date: new Date(formData.date),
    };

    try {
      const url = editingTransaction
        ? `/api/transactions/${editingTransaction.id}`
        : "/api/transactions";
      const method = editingTransaction ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transactionData),
      });

      if (response.ok) {
        // Reset pagination and fetch fresh data
        setCurrentPage(0);
        setTransactions([]);
        await fetchTransactions(0, false);
        setIsEditDialogOpen(false);
        setIsAddDialogOpen(false);
        setEditingTransaction(null);
        setFormData({
          amount: "",
          currency: "USD",
          vendor: "",
          description: "",
          category: "",
          type: "expense",
          date: new Date().toISOString().split("T")[0],
        });
      }
    } catch (error) {
      console.error("Error saving transaction:", error);
    }
  };

  const totalIncome = filteredTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + (t.convertedAmount || t.amount), 0);

  const totalExpenses = filteredTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Math.abs(t.convertedAmount || t.amount), 0);

  logger.info({
    totalIncome,
    totalExpenses,
    currency: defaultCurrency,
    transactionCount: filteredTransactions.length
  }, 'Transactions calculations completed');

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">
            Manage your financial transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Total Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredTransactions.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalIncome, { currency: defaultCurrency })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalExpenses, { currency: defaultCurrency })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search transactions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {getCategoryEmoji(category)} {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount ({defaultCurrency})</TableHead>
                <TableHead className="text-right">Original Amount</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((transaction, index) => {
                // Add ref to the last few items to trigger loading
                const isLastItem = index === filteredTransactions.length - 1;
                const isNearEnd = index >= filteredTransactions.length - 3;
                
                return (
                  <TableRow 
                    key={transaction.id}
                    ref={isLastItem ? lastTransactionElementRef : null}
                  >
                    <TableCell>{formatDate(transaction.date, "long")}</TableCell>
                    <TableCell className="font-medium">
                      {transaction.description}
                    </TableCell>
                    <TableCell>{transaction.vendor}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{getCategoryEmoji(transaction.category)}</span>
                        <span className="text-sm">{transaction.category}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          transaction.type === "income" ? "default" : "secondary"
                        }
                      >
                        {transaction.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-bold ${
                          transaction.type === "income"
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {transaction.type === "income" ? "+" : "-"}
                        {formatCurrency(
                          Math.abs(transaction.convertedAmount || transaction.amount),
                          { currency: defaultCurrency }
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {transaction.originalAmount && transaction.originalCurrency ? (
                        <div className="flex flex-col items-end">
                          <span className="text-sm text-muted-foreground">
                            {formatCurrency(
                              Math.abs(transaction.originalAmount),
                              { currency: transaction.originalCurrency }
                            )}
                          </span>
                          {transaction.conversionRate && transaction.conversionRate !== 1 && (
                            <span className="text-xs text-muted-foreground">
                              Rate: {transaction.conversionRate.toFixed(4)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleEdit(transaction)}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(transaction.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
        
        {/* Infinite Scroll Loading Indicator */}
        {filteredTransactions.length > 0 && (
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {filteredTransactions.length} transactions
                {totalCount > 0 && ` of ${totalCount} total`}
              </div>
              
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  Loading more...
                </div>
              )}
              
              {hasMore && !isLoadingMore && filteredTransactions.length >= pageSize && (
                <Button 
                  onClick={loadMoreTransactions}
                  variant="ghost" 
                  size="sm"
                  className="ml-auto text-xs"
                >
                  Load More
                </Button>
              )}
              
              {!hasMore && filteredTransactions.length > pageSize && (
                <div className="text-sm text-muted-foreground ml-auto">
                  No more transactions to load
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Add/Edit Transaction Dialog */}
      <Dialog
        open={isAddDialogOpen || isEditDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingTransaction(null);
            setFormData({
              amount: "",
              currency: "USD",
              vendor: "",
              description: "",
              category: "",
              type: "expense",
              date: new Date().toISOString().split("T")[0],
            });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTransaction ? "Edit Transaction" : "Add New Transaction"}
            </DialogTitle>
            <DialogDescription>
              {editingTransaction
                ? "Update the transaction details."
                : "Add a new transaction to your records."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, currency: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="AUD">AUD</SelectItem>
                    <SelectItem value="CHF">CHF</SelectItem>
                    <SelectItem value="CNY">CNY</SelectItem>
                    <SelectItem value="SAR">SAR</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="YER">YER</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="type">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: "income" | "expense") =>
                    setFormData((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vendor">Vendor</Label>
                <Input
                  id="vendor"
                  placeholder="e.g., Starbucks"
                  value={formData.vendor}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, vendor: e.target.value }))
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, category: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {getCategoryEmoji(category)} {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Transaction description..."
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                required
              />
            </div>

            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, date: e.target.value }))
                }
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setIsEditDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingTransaction ? "Update" : "Add"} Transaction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
