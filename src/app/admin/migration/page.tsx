'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Database, AlertTriangle, CheckCircle, RotateCcw } from 'lucide-react';

interface MigrationStatus {
  needsMigration: boolean;
  totalTransactions: number;
  migratedTransactions: number;
  legacyTransactions: number;
}

interface MigrationResult {
  success: boolean;
  migratedCount?: number;
  errorCount?: number;
  errors?: string[];
  rollbackData?: any[];
}

export default function MigrationPage() {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [rollbackData, setRollbackData] = useState<any[] | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/migration');
      const data = await response.json();
      if (data.success) {
        setStatus(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch migration status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleMigrate = async () => {
    setIsMigrating(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'migrate' })
      });
      
      const data = await response.json();
      setResult(data);
      
      if (data.success) {
        setRollbackData(data.data.rollbackData);
        await fetchStatus(); // Refresh status
      }
    } catch (error) {
      console.error('Migration failed:', error);
      setResult({ success: false, errors: ['Migration failed'] });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackData) return;
    
    setIsRollingBack(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'rollback', 
          rollbackData 
        })
      });
      
      const data = await response.json();
      setResult(data);
      
      if (data.success) {
        setRollbackData(null);
        await fetchStatus(); // Refresh status
      }
    } catch (error) {
      console.error('Rollback failed:', error);
      setResult({ success: false, errors: ['Rollback failed'] });
    } finally {
      setIsRollingBack(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
          <div className="h-32 bg-muted rounded animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Database Migration</h1>
        <p className="text-muted-foreground">
          Manage multi-currency system migration
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Migration Status
          </CardTitle>
          <CardDescription>
            Current state of your transaction database
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{status.totalTransactions}</div>
                <div className="text-sm text-muted-foreground">Total Transactions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{status.migratedTransactions}</div>
                <div className="text-sm text-muted-foreground">Migrated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{status.legacyTransactions}</div>
                <div className="text-sm text-muted-foreground">Legacy</div>
              </div>
              <div className="text-center">
                <Badge variant={status.needsMigration ? 'destructive' : 'default'}>
                  {status.needsMigration ? 'Migration Needed' : 'Up to Date'}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Migration Actions */}
      {status?.needsMigration && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Migration Required
            </CardTitle>
            <CardDescription>
              Your database needs to be updated to support multi-currency transactions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will convert {status.legacyTransactions} legacy transactions to the new multi-currency format. 
                The process is safe and reversible.
              </AlertDescription>
            </Alert>
            
            <Button 
              onClick={handleMigrate} 
              disabled={isMigrating}
              className="w-full md:w-auto"
            >
              {isMigrating ? 'Migrating...' : 'Start Migration'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Rollback Actions */}
      {rollbackData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-blue-600" />
              Rollback Available
            </CardTitle>
            <CardDescription>
              You can rollback the migration if needed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleRollback} 
              disabled={isRollingBack}
              variant="outline"
              className="w-full md:w-auto"
            >
              {isRollingBack ? 'Rolling Back...' : 'Rollback Migration'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Migration Complete */}
      {status && !status.needsMigration && status.totalTransactions > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Migration Complete
            </CardTitle>
            <CardDescription>
              Your database is fully updated and supports multi-currency transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                All {status.totalTransactions} transactions have been successfully migrated to the new format.
                You can now use multi-currency features.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              {result.success ? 'Operation Successful' : 'Operation Failed'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.success ? (
              <div className="space-y-2">
                {result.migratedCount !== undefined && (
                  <div>Migrated: {result.migratedCount} transactions</div>
                )}
                {result.errorCount !== undefined && result.errorCount > 0 && (
                  <div className="text-red-600">Errors: {result.errorCount}</div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {result.errors?.map((error, index) => (
                  <div key={index} className="text-red-600 text-sm">{error}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
} 