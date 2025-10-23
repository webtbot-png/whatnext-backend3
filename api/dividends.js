import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-fetch';

interface DividendSettings {
  enabled: boolean;
  claimIntervalMinutes: number;
  distributionPercentage: number;
  minClaimAmount: number;
}

interface DividendStats {
  totalClaims: number;
  totalDistributed: number;
  uniqueHolders: number;
  lastClaimDate: string;
  nextClaimScheduled: string;
}

export default function DividendsTab() {
  const [settings, setSettings] = useState<DividendSettings>({
    enabled: false,
    claimIntervalMinutes: 10,
    distributionPercentage: 30,
    minClaimAmount: 0.001
  });

  const [stats, setStats] = useState<DividendStats>({
    totalClaims: 0,
    totalDistributed: 0,
    uniqueHolders: 0,
    lastClaimDate: 'Never',
    nextClaimScheduled: 'Not scheduled'
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Load dividend settings and stats on component mount
  useEffect(() => {
    loadDividendData();
  }, []);

  const loadDividendData = async () => {
    try {
      setLoading(true);

      // Load settings from auto_claim_settings table
      const settingsResponse = await apiFetch('/api/admin/dividends/settings');
      if (settingsResponse.ok) {
        const settingsData = await settingsResponse.json();
        setSettings({
          enabled: settingsData.enabled || false,
          claimIntervalMinutes: settingsData.claim_interval_minutes || 10,
          distributionPercentage: settingsData.distribution_percentage || 30,
          minClaimAmount: settingsData.min_claim_amount || 0.001
        });
      }

      // Load stats from dividend_stats view
      const statsResponse = await apiFetch('/api/admin/dividends/stats');
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats({
          totalClaims: statsData.total_claims || 0,
          totalDistributed: Number.parseFloat(statsData.total_distributed || 0),
          uniqueHolders: statsData.unique_holders || 0,
          lastClaimDate: statsData.last_claim_date ? new Date(statsData.last_claim_date).toLocaleString() : 'Never',
          nextClaimScheduled: statsData.next_claim_scheduled ? new Date(statsData.next_claim_scheduled).toLocaleString() : 'Not scheduled'
        });
      }
    } catch (error) {
      console.error('Failed to load dividend data:', error);
      setMessage('❌ Failed to load dividend data');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('adminToken');
      const response = await apiFetch('/api/admin/dividends/settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: settings.enabled,
          claim_interval_minutes: settings.claimIntervalMinutes,
          distribution_percentage: settings.distributionPercentage,
          min_claim_amount: settings.minClaimAmount
        }),
      });

      if (response.ok) {
        setMessage('✅ Dividend settings saved successfully!');
      } else {
        const data = await response.json();
        setMessage(`❌ Failed to save: ${data.error}`);
      }
    } catch (error) {
      console.error('Save settings error:', error);
      setMessage('❌ Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(num);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
          <p className="text-gray-400 mt-4">Loading dividend data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">💰 Dividend Management</h2>
          <p className="text-gray-400 mt-1 text-sm sm:text-base">Configure automatic dividend distribution to token holders based on their holdings</p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-black/50 backdrop-blur-lg border border-cyan-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-cyan-400 text-sm font-medium">Total Claims</h3>
            <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">
              <span className="text-cyan-400 text-lg">📊</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{stats.totalClaims}</p>
          <p className="text-xs text-gray-400 mt-1">Dividend events</p>
        </div>

        <div className="bg-black/50 backdrop-blur-lg border border-green-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-green-400 text-sm font-medium">Total Distributed</h3>
            <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
              <span className="text-green-400 text-lg">💰</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(stats.totalDistributed)} SOL</p>
          <p className="text-xs text-gray-400 mt-1">To holders</p>
        </div>

        <div className="bg-black/50 backdrop-blur-lg border border-blue-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-blue-400 text-sm font-medium">Unique Holders</h3>
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <span className="text-blue-400 text-lg">👥</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{stats.uniqueHolders}</p>
          <p className="text-xs text-gray-400 mt-1">Token holders</p>
        </div>

        <div className="bg-black/50 backdrop-blur-lg border border-purple-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-purple-400 text-sm font-medium">Next Claim</h3>
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <span className="text-purple-400 text-lg">⏰</span>
            </div>
          </div>
          <p className="text-sm font-bold text-white">{stats.nextClaimScheduled}</p>
          <p className="text-xs text-gray-400 mt-1">Scheduled time</p>
        </div>
      </div>

      {/* Settings Panel */}
      <div className="bg-black/50 backdrop-blur-lg border border-cyan-500/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Dividend Settings</h3>
        
        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-blue-300 text-sm">
            <strong>How it works:</strong> When dividends are claimed, the system takes the available SOL and distributes it proportionally 
            among all current token holders based on their percentage ownership at the time of the claim.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Enable/Disable Toggle */}
          <div className="space-y-2">
            <label htmlFor="auto-claim-toggle" className="block text-gray-300 font-medium mb-2">
              Auto-Claim System
            </label>
            <div className="flex items-center">
              <button
                id="auto-claim-toggle"
                onClick={() => setSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enabled ? 'bg-cyan-500' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="ml-3 text-sm text-gray-300">
                {settings.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Claim Interval */}
          <div className="space-y-2">
            <label htmlFor="claim-interval" className="block text-gray-300 font-medium mb-2">
              Claim Interval (minutes)
            </label>
            <input
              id="claim-interval"
              type="number"
              value={settings.claimIntervalMinutes}
              onChange={(e) => setSettings(prev => ({ ...prev, claimIntervalMinutes: Number.parseInt(e.target.value) || 10 }))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
              min="1"
              max="1440"
            />
          </div>

          {/* Distribution Percentage */}
          <div className="space-y-2">
            <label htmlFor="distribution-percentage" className="block text-gray-300 font-medium mb-2">
              Distribution Percentage (%)
            </label>
            <input
              id="distribution-percentage"
              type="number"
              value={settings.distributionPercentage}
              onChange={(e) => setSettings(prev => ({ ...prev, distributionPercentage: Number.parseFloat(e.target.value) || 30 }))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
              min="0"
              max="100"
              step="0.1"
            />
          </div>

          {/* Minimum Claim Amount */}
          <div className="space-y-2">
            <label htmlFor="min-claim-amount" className="block text-gray-300 font-medium mb-2">
              Min Claim Amount (SOL)
            </label>
            <input
              id="min-claim-amount"
              type="number"
              value={settings.minClaimAmount}
              onChange={(e) => setSettings(prev => ({ ...prev, minClaimAmount: Number.parseFloat(e.target.value) || 0.001 }))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
              min="0"
              step="0.001"
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-400">
            Last claim: {stats.lastClaimDate}
          </div>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            message.startsWith('✅') ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
            'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
