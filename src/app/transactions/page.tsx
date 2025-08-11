"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExportSettings } from "@/components/ui/export-settings";
import { ExportOptions } from "@/lib/services/export.service";
import { useAuth } from "@/components/providers/auth-provider";
import { useCurrency } from "@/components/providers/currency-provider";
import { useRouter } from "next/navigation";
import logger from "@/lib/utils/logger";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Edit, Trash2, ChevronDown, ChevronUp, Plus, Search, Upload, MessageCircle, Mic, MicOff, Send, X } from "lucide-react";
import { formatCurrency, formatDate, getCategoryEmoji } from "@/lib/utils/formatters";
import { toast } from "sonner";

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

interface GroupedTransactions {
  date: string;
  totalAmount: number;
  transactions: Transaction[];
}

const CATEGORIES = [
  "Food & Dining",
  "Shopping", 
  "Transportation",
  "Entertainment",
  "Healthcare",
  "Utilities",
  "Housing",
  "Education",
  "Travel",
  "Other"
];

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [groupedTransactions, setGroupedTransactions] = useState<GroupedTransactions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 50;
  
  // Infinite scroll refs
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  const [formData, setFormData] = useState({
    amount: "",
    currency: "USD",
    vendor: "",
    description: "",
    category: "",
    type: "expense" as "income" | "expense",
    date: new Date().toISOString().split("T")[0],
  });

  const { user, loading: authLoading } = useAuth();
  const { defaultCurrency, supportedCurrencies } = useCurrency();
  const router = useRouter();
  // Quick Add (bottom-center floating) state
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickInput, setQuickInput] = useState("");
  const [quickListening, setQuickListening] = useState(false);
  const [quickRecordingTime, setQuickRecordingTime] = useState(0);
  const mediaStreamRefQuick = useRef<MediaStream | null>(null);
  const mediaRecorderRefQuick = useRef<MediaRecorder | null>(null);
  const audioChunksRefQuick = useRef<Blob[]>([]);
  const quickInputRef = useRef<HTMLInputElement | null>(null);
  const quickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const quickSecondIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTsRef = useRef<number>(0);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set());

  // Helper: dedupe array of transactions by id (first wins)
  const dedupeById = useCallback((items: Transaction[]) => {
    const seen = new Set<string>();
    const out: Transaction[] = [];
    for (const it of items) {
      const key = String(it.id);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(it);
      }
    }
    return out;
  }, []);

  // Gemini-only handling for Quick Add (text/voice) — matches chat page behavior

  // Quick add: send text to chat API to parse & add transaction, then refresh list
  const handleQuickSend = useCallback(async (text?: string) => {
    const content = (text ?? quickInput).trim();
    if (!content) return;
    try {
      const res = await fetch('/api/chat?stream=0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        toast.error(`Server ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`);
        return;
      }
      let data: any;
      try {
        data = await res.json();
      } catch {
        const txt = await res.text().catch(() => '');
        toast.error(`Invalid server response${txt ? `: ${txt.slice(0, 200)}` : ''}`);
        return;
      }
      if (data?.success) {
        if (data?.data?.transactionAdded) {
          toast.success('Transaction added');
          // Keep input clear and avoid full refresh: fetch just latest few and merge-dedupe
          setQuickInput('');
          try {
            const latestRes = await fetch(`/api/transactions?currency=${defaultCurrency}&limit=5&offset=0&t=${Date.now()}`);
            const latestJson = await latestRes.json();
            if (latestJson?.success && Array.isArray(latestJson.data) && latestJson.data.length > 0) {
              const newOnes = latestJson.data.map((x: any) => ({ ...x, date: new Date(x.date) })) as Transaction[];
              // Merge and capture newly seen ids
              setTransactions(prev => {
                const beforeIds = new Set(prev.map(p => String(p.id)));
                const merged = dedupeById([...newOnes, ...prev]);
                const addedNow = newOnes
                  .map(n => String(n.id))
                  .filter(id => !beforeIds.has(id));
                if (addedNow.length > 0) {
                  // Expand date groups for newly added items (could be past/future)
                  try {
                    const idToDateKey = new Map<string, string>();
                    newOnes.forEach(n => {
                      idToDateKey.set(String(n.id), new Date(n.date).toISOString().split('T')[0]);
                    });
                    setExpandedDates(prevSet => {
                      const next = new Set(prevSet);
                      addedNow.forEach(id => {
                        const dk = idToDateKey.get(id);
                        if (dk) next.add(dk);
                      });
                      return next;
                    });
                  } catch {}
                  setRecentlyAddedIds(prevSet => {
                    const next = new Set(prevSet);
                    addedNow.forEach(id => next.add(id));
                    return next;
                  });
                  // Remove highlight after 3s
                  setTimeout(() => {
                    setRecentlyAddedIds(prevSet => {
                      const next = new Set(prevSet);
                      addedNow.forEach(id => next.delete(id));
                      return next;
                    });
                  }, 3000);
                  // After render, scroll to the first newly added transaction
                  try {
                    const firstId = addedNow[0];
                    setTimeout(() => {
                      const el = document.getElementById(`txn-${firstId}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 50);
                  } catch {}
                }
                // If currently scrolled near bottom, keep position; otherwise scroll to top to reveal
                try {
                  const y = window.scrollY || 0;
                  if (y < 120) window.scrollTo({ top: 0, behavior: 'smooth' });
                } catch {}
                return merged;
              });
            }
          } catch {
            // ignore silent; user still sees success toast
          }
          // panel stays open for rapid entry
        } else {
          // Not auto-added by AI → guide user to dialog to complete details
          setIsAddDialogOpen(true);
          setFormData((prev) => ({ ...prev, description: content }));
          toast('Describe amount/vendor to add');
        }
      } else {
        const msg = data?.error || 'Failed to add transaction';
        toast.error(msg);
      }
    } catch (e) {
      toast.error('Network error');
    }
  }, [quickInput, defaultCurrency]);

  // Start/stop recording helpers so we can call from button or effects
  const startQuickRecording = useCallback(async () => {
    if (quickListening) return;
    const hasMediaRecorder = typeof (window as any).MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    if (!hasMediaRecorder) {
      toast.error('Voice input not supported in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRefQuick.current = stream;
      audioChunksRefQuick.current = [];
      const mediaRecorder = new (window as any).MediaRecorder(stream);
      mediaRecorderRefQuick.current = mediaRecorder;
      mediaRecorder.onstart = () => {
        setQuickListening(true);
        setQuickRecordingTime(0);
        // Seconds ticker for countdown
        if (quickSecondIntervalRef.current) clearInterval(quickSecondIntervalRef.current);
        quickSecondIntervalRef.current = setInterval(() => {
          setQuickRecordingTime((s) => (s >= 20 ? 20 : s + 1));
        }, 1000);
        // Record up to 20s max
        if (quickTimerRef.current) clearTimeout(quickTimerRef.current);
        quickTimerRef.current = setTimeout(() => {
          if (mediaRecorderRefQuick.current && mediaRecorderRefQuick.current.state !== 'inactive') {
            mediaRecorderRefQuick.current.stop();
          }
        }, 20000);
        // Auto-stop on silence (~1s)
        try {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioContextRef.current.createMediaStreamSource(stream);
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 1024;
          source.connect(analyserRef.current);
          const data = new Uint8Array(analyserRef.current.frequencyBinCount);
          lastSpeechTsRef.current = Date.now();
          const checkSilence = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            if (avg > 10) lastSpeechTsRef.current = Date.now();
            if (Date.now() - lastSpeechTsRef.current > 1000) {
              if (mediaRecorderRefQuick.current && mediaRecorderRefQuick.current.state !== 'inactive') {
                mediaRecorderRefQuick.current.stop();
              }
              return;
            }
            silenceIntervalRef.current = setTimeout(checkSilence, 200);
          };
          checkSilence();
        } catch {
          // ignore analyser failures
        }
      };
      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) audioChunksRefQuick.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(audioChunksRefQuick.current, { type: mediaRecorder.mimeType || 'audio/webm' });
          const fd = new FormData();
          fd.append('audio', blob, 'quick.webm');
          const sttRes = await fetch('/api/stt', { method: 'POST', body: fd });
          const sttJson = await sttRes.json();
          if (sttJson.success && typeof sttJson.text === 'string' && sttJson.text.trim()) {
            await handleQuickSend(sttJson.text.trim());
          } else {
            toast.error('Could not transcribe audio');
          }
        } catch {
          toast.error('Voice processing failed');
        } finally {
          setQuickListening(false);
          setQuickRecordingTime(0);
          if (quickTimerRef.current) { clearTimeout(quickTimerRef.current); quickTimerRef.current = null; }
          if (quickSecondIntervalRef.current) { clearInterval(quickSecondIntervalRef.current); quickSecondIntervalRef.current = null; }
          if (silenceIntervalRef.current) { clearTimeout(silenceIntervalRef.current); silenceIntervalRef.current = null; }
          if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch {} analyserRef.current = null; }
          if (audioContextRef.current) { try { audioContextRef.current.close(); } catch {} audioContextRef.current = null; }
          if (mediaStreamRefQuick.current) {
            mediaStreamRefQuick.current.getTracks().forEach((t) => t.stop());
            mediaStreamRefQuick.current = null;
          }
        }
      };
      mediaRecorder.start();
    } catch {
      toast.error('Microphone access denied');
    }
  }, [quickListening, handleQuickSend]);

  const stopQuickRecording = useCallback(() => {
    if (mediaRecorderRefQuick.current && mediaRecorderRefQuick.current.state !== 'inactive') {
      mediaRecorderRefQuick.current.stop();
    }
  }, []);
  const quickTickRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRefQuick = useRef<any>(null);
  const analyserRefQuick = useRef<AnalyserNode | null>(null);
  const levelIntervalRefQuick = useRef<number | null>(null);
  const lastNonSilentRefQuick = useRef<number>(0);

  const fetchTransactions = useCallback(async (page = 0, append = false) => {
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
          // Append to existing transactions (dedup by id)
          setTransactions(prev => dedupeById([...prev, ...parsedTransactions]));
        } else {
          // Replace transactions (first load or refresh) (dedup just in case)
          setTransactions(dedupeById(parsedTransactions));
          setCurrentPage(0);
        }

        // Update pagination state
        if (data.pagination) {
          setHasMore(data.pagination.hasMore);
        }
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [defaultCurrency, pageSize]);


  // Keyboard shortcuts: open quick add with '/', 'q', or Cmd/Ctrl+K; close with Esc; Cmd/Ctrl+Enter to add
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const inEditable = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === '/' || e.key.toLowerCase() === 'q' || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) && !inEditable) {
        e.preventDefault();
        setQuickOpen(true);
        setTimeout(() => quickInputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape' && quickOpen) {
        setQuickOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && quickOpen) {
        e.preventDefault();
        void handleQuickSend();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [quickOpen, handleQuickSend]);

  const loadMoreTransactions = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    await fetchTransactions(nextPage, true);
  }, [hasMore, isLoadingMore, currentPage, fetchTransactions]);

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

  // Initial data fetch
  useEffect(() => {
    if (defaultCurrency) {
      fetchTransactions(0, false);
    }
  }, [defaultCurrency, fetchTransactions]);

  // Reset pagination when filters change
  useEffect(() => {
    if (searchQuery || categoryFilter !== "" || typeFilter !== "all") {
      // When filtering, we should fetch fresh data
      setCurrentPage(0);
      setTransactions([]);
      fetchTransactions(0, false);
    }
  }, [searchQuery, categoryFilter, typeFilter, defaultCurrency, fetchTransactions]);

  // Only fetch if no filters are active (to avoid double fetch)
  useEffect(() => {
    if (searchQuery === "" && categoryFilter === "all" && typeFilter === "all") {
      setCurrentPage(0);
      setTransactions([]);
      fetchTransactions(0, false);
    }
  }, [defaultCurrency, searchQuery, categoryFilter, typeFilter, fetchTransactions]);

  // Group transactions by date
  useEffect(() => {
    const grouped = filteredTransactions.reduce((groups: GroupedTransactions[], transaction) => {
      const dateKey = new Date(transaction.date).toISOString().split("T")[0];
      const existingGroup = groups.find(g => g.date === dateKey);
      
      if (existingGroup) {
        existingGroup.transactions.push(transaction);
        existingGroup.totalAmount += transaction.type === 'income' 
          ? (transaction.convertedAmount || transaction.amount)
          : -(transaction.convertedAmount || transaction.amount);
      } else {
        groups.push({
          date: dateKey,
          totalAmount: transaction.type === 'income' 
            ? (transaction.convertedAmount || transaction.amount)
            : -(transaction.convertedAmount || transaction.amount),
          transactions: [transaction]
        });
      }
      
      return groups;
    }, []);

    setGroupedTransactions(grouped);
  }, [filteredTransactions]);

  // Expand all date groups by default for easier scanning
  useEffect(() => {
    if (groupedTransactions.length > 0 && expandedDates.size === 0) {
      setExpandedDates(new Set(groupedTransactions.map((g) => g.date)));
    }
  }, [groupedTransactions, expandedDates]);

  // Filter transactions based on search and filters
  useEffect(() => {
    let filtered = transactions;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(t => 
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (categoryFilter && categoryFilter !== "all") {
      filtered = filtered.filter(t => t.category === categoryFilter);
    }

    // Apply type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter(t => t.type === typeFilter);
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setFilteredTransactions(filtered);
  }, [transactions, searchQuery, categoryFilter, typeFilter]);

  // Client-side authentication check
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated (no user at all)
  if (!user) {
    return null; // Component will unmount and redirect
  }

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

  const handleExport = async (exportOptions: ExportOptions) => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ options: exportOptions }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get the filename from the response headers
      const contentDisposition = response.headers.get('content-disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `export.${exportOptions.format}`;

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      logger.info({ exportOptions, filename }, 'Export completed successfully');
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : error, exportOptions }, 'Export failed');
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleDateExpansion = (date: string) => {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDates(newExpanded);
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
          <ExportSettings
            onExport={handleExport}
            supportedCurrencies={supportedCurrencies}
            defaultCurrency={defaultCurrency}
            isLoading={isExporting}
          />
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cash Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              (totalIncome - totalExpenses) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatCurrency(totalIncome - totalExpenses, { currency: defaultCurrency })}
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

            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as "all" | "income" | "expense")}>
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

      {/* Timeline View */}
      <div className="space-y-4">
        {groupedTransactions.map((group, groupIndex) => {
          const isExpanded = expandedDates.has(group.date);
          const isLastGroup = groupIndex === groupedTransactions.length - 1;
          
          return (
            <div key={group.date} className="overflow-hidden rounded-md">
              {/* Date Header with Total */}
              <div 
                className="flex items-center justify-between p-3 cursor-pointer bg-muted/70 hover:bg-muted/80 transition-colors border border-border rounded-md"
                onClick={() => toggleDateExpansion(group.date)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="font-semibold text-base">
                      {formatDate(new Date(group.date), "long")}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {group.transactions.length} transaction{group.transactions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`text-base font-bold ${
                      group.totalAmount >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {group.totalAmount >= 0 ? '+' : ''}{formatCurrency(group.totalAmount, { currency: defaultCurrency })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Daily total
                    </div>
                  </div>
                  
                  <Button variant="ghost" size="sm">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Transactions for this date */}
              {isExpanded && (
                <div>
                      <div className="p-1 divide-y divide-border/50">
                    {group.transactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        id={`txn-${transaction.id}`}
                        className={`flex items-center justify-between px-3 py-2 hover:bg-accent/5 transition-colors ${recentlyAddedIds.has(String(transaction.id)) ? 'ring-2 ring-primary/40 rounded-md bg-primary/5' : ''}`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-8 h-8 bg-background rounded-full flex items-center justify-center border">
                            <span className="text-base">{getCategoryEmoji(transaction.category)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {transaction.category}{transaction.vendor ? ` · ${transaction.vendor}` : ''}
                            </div>
                            {transaction.description && (
                              <div className="text-xs text-muted-foreground truncate">
                                {transaction.description}
                              </div>
                            )}
                            {transaction.originalAmount && transaction.originalCurrency && (
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(
                                  Math.abs(transaction.originalAmount),
                                  { currency: transaction.originalCurrency }
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className={`font-semibold text-sm ${
                              transaction.type === "income" ? "text-green-600" : "text-red-600"
                            }`}>
                              {transaction.type === "income" ? "+" : "-"}
                              {formatCurrency(
                                Math.abs(transaction.convertedAmount || transaction.amount),
                                { currency: defaultCurrency }
                              )}
                            </div>
                          </div>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(transaction)}>
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
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Infinite scroll trigger */}
              {isLastGroup && hasMore && (
                <div ref={lastTransactionElementRef} className="h-4" />
              )}
            </div>
          );
        })}

        {/* Loading indicator */}
        {isLoadingMore && (
          <div className="flex items-center justify-center py-4">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
          </div>
        )}

        {/* Empty state */}
        {groupedTransactions.length === 0 && !isLoading && (
          <Card>
            <CardContent className="text-center py-8">
              <div className="text-muted-foreground mb-2">No transactions found</div>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Transaction
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

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

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount *</Label>
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
                    className="text-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Type *</Label>
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
                      <SelectItem value="expense">💸 Expense</SelectItem>
                      <SelectItem value="income">💰 Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Transaction Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Transaction Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
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

                <div className="space-y-2">
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
                      {supportedCurrencies?.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      )) || [
                        "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "SAR", "AED", "YER"
                      ].map(code => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vendor">Vendor *</Label>
                <Input
                  id="vendor"
                  placeholder="e.g., Starbucks, Amazon, etc."
                  value={formData.vendor}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, vendor: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the transaction..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  required
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
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
            </div>

            {/* Action Buttons */}
            <DialogFooter className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setIsEditDialogOpen(false);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                size="lg"
              >
                {editingTransaction ? "Update" : "Save"} Transaction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Add floating trigger and panel (bottom-center) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        {!quickOpen ? (
          <Button
            onClick={() => setQuickOpen(true)}
            size="lg"
            className="rounded-full shadow-md px-5"
            aria-label="Quick add"
          >
            <MessageCircle className="w-5 h-5 mr-2" /> Quick add
          </Button>
        ) : (
          <div className="bg-background border border-border rounded-xl shadow-xl w-[min(680px,90vw)] p-3 flex items-center gap-2">
            <button
              aria-label="Close quick add"
              className="shrink-0 rounded-md hover:bg-muted p-1 text-muted-foreground"
              onClick={() => setQuickOpen(false)}
            >
              <X className="w-4 h-4" />
            </button>
            <Input
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              onKeyDown={async (e) => {
                if ((e.key === 'Enter' || e.key === 'NumpadEnter') && !e.shiftKey) {
                  e.preventDefault();
                  await handleQuickSend();
                }
              }}
              placeholder="E.g. I spent $12 at Starbucks, groceries 2025-01-12"
              className="flex-1"
              ref={quickInputRef}
            />
            <Button
              variant={quickListening ? 'default' : 'outline'}
              size="icon"
              aria-label={quickListening ? 'Stop recording' : 'Start voice input'}
              className={quickListening ? 'bg-red-500 hover:bg-red-600' : ''}
              onClick={async () => {
                if (quickListening) {
                  if (mediaRecorderRefQuick.current && mediaRecorderRefQuick.current.state !== 'inactive') {
                    mediaRecorderRefQuick.current.stop();
                  }
                  return;
                }
                try {
                  const hasMediaRecorder = typeof (window as any).MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
                  if (!hasMediaRecorder) {
                    toast.error('Voice input not supported in this browser');
                    return;
                  }
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                  mediaStreamRefQuick.current = stream;
                  audioChunksRefQuick.current = [];
                  const mediaRecorder = new (window as any).MediaRecorder(stream);
                  mediaRecorderRefQuick.current = mediaRecorder;
                  mediaRecorder.onstart = () => {
                    setQuickListening(true);
                    setQuickRecordingTime(0);
                    // Seconds ticker for countdown
                    if (quickTickRef.current) clearInterval(quickTickRef.current);
                    quickTickRef.current = setInterval(() => {
                      setQuickRecordingTime((s) => (s >= 20 ? 20 : s + 1));
                    }, 1000);
                    // Record up to 20s, auto-stop for speed
                    if (quickTimerRef.current) clearTimeout(quickTimerRef.current);
                    quickTimerRef.current = setTimeout(() => {
                      if (mediaRecorderRefQuick.current && mediaRecorderRefQuick.current.state !== 'inactive') {
                        mediaRecorderRefQuick.current.stop();
                      }
                    }, 20000);

                    // Setup basic silence detection (auto-stop when silent for ~1s)
                    try {
                      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
                      audioContextRefQuick.current = new AudioCtx();
                      const source = audioContextRefQuick.current.createMediaStreamSource(stream);
                      const analyser = audioContextRefQuick.current.createAnalyser();
                      analyser.fftSize = 2048;
                      source.connect(analyser);
                      analyserRefQuick.current = analyser;
                      const buffer = new Float32Array(analyser.fftSize);
                      lastNonSilentRefQuick.current = Date.now();
                      if (levelIntervalRefQuick.current) window.clearInterval(levelIntervalRefQuick.current);
                      levelIntervalRefQuick.current = window.setInterval(() => {
                        const analyser = analyserRefQuick.current;
                        if (!analyser) return;
                        analyser.getFloatTimeDomainData(buffer);
                        let sumSquares = 0;
                        for (let i = 0; i < buffer.length; i++) {
                          const v = buffer[i];
                          sumSquares += v * v;
                        }
                        const rms = Math.sqrt(sumSquares / buffer.length);
                        const threshold = 0.015; // tune if needed
                        if (rms > threshold) {
                          lastNonSilentRefQuick.current = Date.now();
                        } else if (Date.now() - lastNonSilentRefQuick.current > 1000) {
                          // silent for >1s → stop
                          if (mediaRecorderRefQuick.current && mediaRecorderRefQuick.current.state !== 'inactive') {
                            mediaRecorderRefQuick.current.stop();
                          }
                        }
                      }, 150);
                    } catch {
                      // ignore if AudioContext not available
                    }
                  };
                  mediaRecorder.ondataavailable = (e: BlobEvent) => {
                    if (e.data && e.data.size > 0) audioChunksRefQuick.current.push(e.data);
                  };
                  mediaRecorder.onstop = async () => {
                    try {
                      const blob = new Blob(audioChunksRefQuick.current, { type: mediaRecorder.mimeType || 'audio/webm' });
                      const fd = new FormData();
                      fd.append('audio', blob, 'quick.webm');
                      const sttRes = await fetch('/api/stt', { method: 'POST', body: fd });
                      const sttJson = await sttRes.json();
                      if (sttJson.success && typeof sttJson.text === 'string' && sttJson.text.trim()) {
                        // Auto-send after transcription (do not write into textbox)
                        await handleQuickSend(sttJson.text.trim());
                      } else {
                        toast.error('Could not transcribe audio');
                      }
                    } catch {
                      toast.error('Voice processing failed');
                    } finally {
                      setQuickListening(false);
                      setQuickRecordingTime(0);
                      if (quickTimerRef.current) { clearTimeout(quickTimerRef.current); quickTimerRef.current = null; }
                      if (quickTickRef.current) { clearInterval(quickTickRef.current); quickTickRef.current = null; }
                      if (levelIntervalRefQuick.current) { window.clearInterval(levelIntervalRefQuick.current); levelIntervalRefQuick.current = null; }
                      try {
                        if (audioContextRefQuick.current) {
                          audioContextRefQuick.current.close();
                          audioContextRefQuick.current = null;
                        }
                      } catch {}
                      if (mediaStreamRefQuick.current) {
                        mediaStreamRefQuick.current.getTracks().forEach((t) => t.stop());
                        mediaStreamRefQuick.current = null;
                      }
                    }
                  };
                  mediaRecorder.start();
                } catch {
                  toast.error('Microphone access denied');
                }
              }}
            >
              {quickListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            {quickListening && (
              <span className="text-xs text-muted-foreground mr-2">
                Recording… ({quickRecordingTime}s)
              </span>
            )}
            <Button
              onClick={async () => {
                await handleQuickSend();
              }}
              disabled={!quickInput.trim()}
            >
              <Send className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
